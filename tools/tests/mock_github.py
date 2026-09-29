"""In-memory fake of the GitHub REST endpoints the site uses (for the editor e2e test)."""
import base64, hashlib, json, os, time, re
from urllib.parse import urlparse, parse_qs, unquote

class MockGitHub:
    def __init__(self, repo_dir, owner='ihot-team1414', repo='IHOT1414-Resources', branch='main', tokens=('github_pat_TEST',)):
        self.owner, self.repo, self.branch = owner, repo, branch
        self.tokens = set(tokens)
        self.blobs, self.trees, self.commits = {}, {}, {}
        self.log = []
        files = {}
        for root, _, names in os.walk(os.path.join(repo_dir, 'content')):
            for n in names:
                full = os.path.join(root, n)
                rel = os.path.relpath(full, repo_dir)
                files[rel] = open(full, 'rb').read()
        for n in ['config.json']:
            files[n] = open(os.path.join(repo_dir, n), 'rb').read()
        tree = {p: self._blob(b) for p, b in files.items()}
        tsha = self._tree(tree)
        self.head = self._commit(tsha, [], 'Initial', 'seed')

    # --- object store
    def _sha(self, kind, data):
        return hashlib.sha1(kind.encode() + b'\0' + data).hexdigest()
    def _blob(self, data):
        s = self._sha('blob', data); self.blobs[s] = data; return s
    def _tree(self, mapping):
        s = self._sha('tree', json.dumps(mapping, sort_keys=True).encode()); self.trees[s] = dict(mapping); return s
    def _commit(self, tree, parents, message, author='editor'):
        data = json.dumps({'t': tree, 'p': parents, 'm': message, 'time': time.time()}).encode()
        s = self._sha('commit', data)
        self.commits[s] = {'tree': tree, 'parents': parents, 'message': message, 'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        return s

    def files_at(self, ref=None):
        c = self.commits[self._resolve(ref or self.branch)]
        return self.trees[c['tree']]
    def read(self, path, ref=None):
        sha = self.files_at(ref).get(path)
        return self.blobs[sha] if sha else None
    def _resolve(self, ref):
        return self.head if ref in (self.branch, None) else ref

    def external_write(self, path, text, message='External edit'):
        """Simulate another editor committing."""
        tree = dict(self.files_at())
        tree[path] = self._blob(text.encode())
        self.head = self._commit(self._tree(tree), [self.head], message)

    # --- HTTP
    def handle(self, method, url, headers, body):
        u = urlparse(url)
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', 'Access-Control-Expose-Headers': 'github-authentication-token-expiration, x-ratelimit-remaining'}
        if method == 'OPTIONS':
            return 204, cors, b''
        if u.hostname == 'raw.githubusercontent.com':
            m = re.match(rf'^/{self.owner}/{self.repo}/{self.branch}/(.+)$', u.path)
            data = self.read(unquote(m.group(1))) if m else None
            return (200, {**cors, 'Content-Type': 'text/plain'}, data) if data is not None else (404, cors, b'404')
        auth = headers.get('authorization', '')
        tok = auth.replace('Bearer ', '')
        self.log.append((method, u.path, tok[-6:]))
        if tok not in self.tokens:
            return self.j(401, {'message': 'Bad credentials'}, cors)
        base = f'/repos/{self.owner}/{self.repo}'
        p = u.path
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        data = json.loads(body) if body else None
        if p == base and method == 'GET':
            return self.j(200, {'full_name': f'{self.owner}/{self.repo}', 'private': False, 'permissions': {'admin': False, 'push': True, 'pull': True}}, {**cors, 'github-authentication-token-expiration': '2027-09-01 00:00:00 UTC'})
        if p == f'{base}/git/ref/heads/{self.branch}':
            return self.j(200, {'object': {'sha': self.head}}, cors)
        if p.startswith(f'{base}/contents/') and method == 'GET':
            path = unquote(p[len(f'{base}/contents/'):])
            ref = q.get('ref', self.branch)
            files = self.files_at(ref)
            if path not in files:
                if any(k.startswith(path + '/') for k in files):
                    return self.j(200, [], cors)
                return self.j(404, {'message': 'Not Found'}, cors)
            sha = files[path]; raw = self.blobs[sha]
            return self.j(200, {'sha': sha, 'size': len(raw), 'encoding': 'base64', 'content': base64.b64encode(raw).decode()}, cors)
        if p.startswith(f'{base}/git/blobs/') and method == 'GET':
            sha = p.rsplit('/', 1)[1]
            return self.j(200, {'sha': sha, 'content': base64.b64encode(self.blobs[sha]).decode(), 'encoding': 'base64'}, cors)
        if p == f'{base}/git/blobs' and method == 'POST':
            raw = base64.b64decode(data['content']) if data.get('encoding') == 'base64' else data['content'].encode()
            return self.j(201, {'sha': self._blob(raw)}, cors)
        if p.startswith(f'{base}/git/commits/') and method == 'GET':
            sha = p.rsplit('/', 1)[1]
            return self.j(200, {'sha': sha, 'tree': {'sha': self.commits[sha]['tree']}}, cors)
        if p == f'{base}/git/trees' and method == 'POST':
            tree = dict(self.trees[data['base_tree']])
            for e in data['tree']:
                if e.get('sha') is None: tree.pop(e['path'], None)
                else: tree[e['path']] = e['sha']
            return self.j(201, {'sha': self._tree(tree)}, cors)
        if p == f'{base}/git/commits' and method == 'POST':
            s = self._commit(data['tree'], data['parents'], data['message'])
            return self.j(201, {'sha': s, 'html_url': f'https://github.com/{self.owner}/{self.repo}/commit/{s}'}, cors)
        if p == f'{base}/git/refs/heads/{self.branch}' and method == 'PATCH':
            new = data['sha']
            if self.commits[new]['parents'] != [self.head] and not data.get('force'):
                return self.j(422, {'message': 'Update is not a fast forward'}, cors)
            self.head = new
            return self.j(200, {'object': {'sha': new}}, cors)
        if p == f'{base}/commits' and method == 'GET':
            path = q.get('path'); out = []; c = self.head
            while c and len(out) < int(q.get('per_page', 30)):
                cm = self.commits[c]
                par = cm['parents'][0] if cm['parents'] else None
                cur = self.trees[cm['tree']].get(path)
                prev = self.trees[self.commits[par]['tree']].get(path) if par else None
                if cur != prev:
                    out.append({'sha': c, 'html_url': f'https://github.com/x/commit/{c}', 'commit': {'message': cm['message'], 'author': {'name': 'site-editor', 'date': cm['date']}}})
                c = par
            return self.j(200, out, cors)
        return self.j(404, {'message': f'mock: unhandled {method} {p}'}, cors)

    def j(self, status, obj, headers):
        return status, {**headers, 'Content-Type': 'application/json'}, json.dumps(obj).encode()
