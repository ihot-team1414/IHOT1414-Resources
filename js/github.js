// Minimal GitHub REST client for saving content straight from the browser.
// Every save is ONE commit made with the Git Data API (blobs -> tree -> commit
// -> move branch), so a page's JSON and any uploaded files land together, and
// the git history doubles as undo/version history.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ConflictError extends GitHubError {
  constructor(path, currentSha) {
    super(`${path} was changed by someone else since you opened it.`, { status: 409, code: 'conflict' });
    this.path = path;
    this.currentSha = currentSha;
  }
}

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToUtf8(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
/** Blob -> base64 without blowing the call stack on big files. */
export function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

export class GitHub {
  constructor({ owner, repo, branch = 'main', token }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async request(method, path, body, { allow404 = false } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (err) {
      throw new GitHubError('Could not reach GitHub. Check your internet connection and try again.', { code: 'network' });
    }
    if (allow404 && res.status === 404) return null;
    if (res.status === 204) return {};
    let data = null;
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) {
      const msg = data?.message || res.statusText;
      if (res.status === 401) throw new GitHubError('GitHub rejected the team token (it may have expired or been revoked). Ask an admin to rotate it.', { status: 401, code: 'auth' });
      if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        throw new GitHubError('GitHub rate limit reached. Wait a few minutes and try again.', { status: 403, code: 'rate' });
      }
      if (res.status === 403 || (res.status === 404 && method !== 'GET')) {
        throw new GitHubError(`The team token isn't allowed to do that (${msg}). It needs "Contents: Read and write" on this repository.`, { status: res.status, code: 'forbidden' });
      }
      throw new GitHubError(`GitHub error ${res.status}: ${msg}`, { status: res.status, code: 'http', details: data });
    }
    this.lastHeaders = res.headers;
    return data;
  }

  /** Confirms the token works and can write. Returns { canPush, expires }. */
  async checkAccess() {
    const repo = await this.request('GET', this.base);
    const expires = this.lastHeaders?.get('github-authentication-token-expiration') || '';
    return { canPush: !!repo?.permissions?.push, expires, fullName: repo.full_name, private: repo.private };
  }

  async headSha() {
    const ref = await this.request('GET', `${this.base}/git/ref/heads/${encodeURIComponent(this.branch)}`);
    return ref.object.sha;
  }

  /** Returns { sha, text } of a file on the branch (or at `ref`), or null if missing. */
  async getFile(path, ref = this.branch) {
    const data = await this.request('GET', `${this.base}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, null, { allow404: true });
    if (!data) return null;
    if (Array.isArray(data)) throw new GitHubError(`${path} is a folder`);
    let text = '';
    if (data.content) text = b64ToUtf8(data.content);
    else if (data.sha) {
      const blob = await this.request('GET', `${this.base}/git/blobs/${data.sha}`);
      text = b64ToUtf8(blob.content);
    }
    return { sha: data.sha, text };
  }

  async getJSON(path, ref) {
    const f = await this.getFile(path, ref);
    if (!f) return null;
    return { sha: f.sha, data: JSON.parse(f.text) };
  }

  async fileSha(path, ref) {
    const data = await this.request('GET', `${this.base}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, null, { allow404: true });
    return data && !Array.isArray(data) ? data.sha : null;
  }

  /**
   * Commit several files at once.
   * changes: [{ path, text } | { path, blob } | { path, delete: true }]
   * expected: { [path]: sha | null }  -- conflict check (null = must not exist)
   */
  async commit({ message, changes, expected = {}, onProgress = () => {} }) {
    // Upload blobs first (they don't change the branch, so they're safe to reuse on retry).
    const blobShas = {};
    let done = 0;
    for (const c of changes) {
      if (c.delete) continue;
      onProgress({ step: 'upload', path: c.path, done, total: changes.length });
      const content = c.blob ? await blobToB64(c.blob) : utf8ToB64(c.text);
      const blob = await this.request('POST', `${this.base}/git/blobs`, { content, encoding: 'base64' });
      blobShas[c.path] = blob.sha;
      done += 1;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      onProgress({ step: 'commit' });
      const head = await this.headSha();
      for (const [path, sha] of Object.entries(expected)) {
        const current = await this.fileSha(path, head);
        if ((current || null) !== (sha || null)) throw new ConflictError(path, current);
      }
      const headCommit = await this.request('GET', `${this.base}/git/commits/${head}`);
      const tree = await this.request('POST', `${this.base}/git/trees`, {
        base_tree: headCommit.tree.sha,
        tree: changes.map((c) => (c.delete
          ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : { path: c.path, mode: '100644', type: 'blob', sha: blobShas[c.path] })),
      });
      const commit = await this.request('POST', `${this.base}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [head],
      });
      try {
        await this.request('PATCH', `${this.base}/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: commit.sha, force: false });
        return { commitSha: commit.sha, url: commit.html_url || `https://github.com/${this.owner}/${this.repo}/commit/${commit.sha}`, blobShas };
      } catch (err) {
        // 422 = branch moved while we were committing (someone else saved). Retry on the new head;
        // the conflict check above stops us if they touched the same file.
        if (err.status !== 422) throw err;
      }
    }
    throw new GitHubError('The branch kept changing while saving. Please try again.', { code: 'busy' });
  }

  async listCommits(path, perPage = 25) {
    return this.request('GET', `${this.base}/commits?sha=${encodeURIComponent(this.branch)}&path=${encodeURIComponent(path)}&per_page=${perPage}`);
  }
}
