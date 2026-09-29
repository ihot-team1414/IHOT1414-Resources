// #/login  – editor sign-in
// #/admin  – editor tools: change password, manage editors, rotate the token,
//            add a subteam, and first-time setup when no editors exist yet.

import { esc, qs, toast, confirmDialog, slugify } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { getSession, setSession, signOut } from '../auth/session.js';
import {
  createEditorEntry, unlockEntry, wrapToken, changeEntryPassword,
  checkPasswordStrength, USERNAME_RE, DEFAULT_ITERATIONS,
} from '../auth/vault.js';
import { loadEditors, findEditor, EDITORS_PATH, normalize, serialize } from '../auth/editors.js';
import { GitHub, ConflictError } from '../github.js';
import { loadEditorCss } from '../editor/css.js';
import { setCached } from '../store.js';
import { promptText } from '../editor/forms.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export async function mountAccountPage(root, ctx) {
  await loadEditorCss();
  const page = { name: 'account', unmount() {} };
  if (ctx.view === 'login') await renderLogin(root, ctx);
  else await renderAdmin(root, ctx);
  return page;
}

function shell(inner, { wide = false } = {}) {
  return `<section class="auth-page${wide ? ' is-wide' : ''}"><div class="container">${inner}</div></section>`;
}

function iterations(config) {
  return config.security?.pbkdf2Iterations || DEFAULT_ITERATIONS;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
  }
}

function showError(form, msg) {
  const box = qs('.form-error', form);
  box.innerHTML = msg;
  box.hidden = !msg;
  if (msg) box.focus?.();
}

// ------------------------------------------------------------------- login
async function renderLogin(root, { config, query, from }) {
  const session = getSession();
  if (session) {
    root.innerHTML = shell(`
      <div class="auth-card card">
        <span class="auth-ico" aria-hidden="true">${icon.unlock}</span>
        <h1>You're signed in</h1>
        <p class="muted">Signed in as <strong>${esc(session.username)}</strong>. Open any subteam page to edit it.</p>
        <div class="auth-actions">
          <a class="btn btn-primary" href="#/admin">${icon.users} Editor tools</a>
          <button class="btn btn-secondary" type="button" data-signout>${icon.logout} Sign out</button>
        </div>
      </div>`);
    qs('[data-signout]', root).addEventListener('click', () => { signOut(); navigate('/login'); });
    return;
  }

  const editors = await loadEditors(config);
  const next = query.next || (from && !/#\/(login|admin)/.test(from) ? from : '#/');
  root.innerHTML = shell(`
    <div class="auth-card card">
      <span class="auth-ico" aria-hidden="true">${icon.lock}</span>
      <h1>Editor login</h1>
      <p class="muted">Visitors don't need an account. Editors sign in to add, edit and organize resources.</p>
      ${editors.editors.length === 0 ? `
        <div class="notice">${icon.key}<span><strong>No editors yet.</strong> If you're setting up the site, start with <a href="#/admin">first-time setup</a>.</span></div>` : ''}
      <form id="login-form" novalidate>
        <div class="field">
          <label for="l-user">Username</label>
          <input id="l-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        </div>
        <div class="field">
          <label for="l-pass">Password</label>
          <input id="l-pass" name="password" type="password" autocomplete="current-password" required>
        </div>
        <div class="form-error" role="alert" tabindex="-1" hidden></div>
        <button class="btn btn-primary" type="submit" style="width:100%">${icon.unlock} Sign in</button>
      </form>
      <p class="auth-foot muted">Forgot your password? Ask an admin to reset your account from Editor tools.</p>
    </div>`);

  const form = qs('#login-form', root);
  qs('#l-user', root).focus();
  let failures = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('button[type="submit"]', form);
    const username = qs('#l-user', form).value.trim().toLowerCase();
    const password = qs('#l-pass', form).value;
    if (!username || !password) { showError(form, 'Enter your username and password.'); return; }
    showError(form, '');
    setBusy(btn, true, 'Unlocking…');
    try {
      if (failures > 2) await new Promise((r) => setTimeout(r, 1000 * failures)); // slow down guessing
      const entry = await findEditor(config, username);
      if (!entry) throw Object.assign(new Error('Incorrect username or password.'), { code: 'bad-password' });
      const { token, tokenError } = await unlockEntry(entry, password);
      let warning = '';
      let usableToken = token;
      if (token) {
        try {
          const access = await new GitHub({ ...config.github, token }).checkAccess();
          if (!access.canPush) warning = 'The team token can read but not write. Ask an admin to check its permissions.';
          if (access.expires) {
            const days = Math.round((new Date(access.expires) - Date.now()) / 86400000);
            if (days < 14) warning = `Heads-up: the team token expires in ${days} day${days === 1 ? '' : 's'}. Ask an admin to rotate it.`;
          }
        } catch (err) {
          if (err.code === 'auth') { usableToken = null; warning = 'The team token has expired or was revoked, so saving is off. Ask an admin to rotate it.'; }
          else warning = err.message;
        }
      } else {
        warning = tokenError
          ? 'Your saved token could not be decrypted. Ask an admin to reset your account.'
          : 'Your account has no save token yet, so edits can be downloaded but not saved. Ask an admin.';
      }
      setSession({ username: entry.username, role: entry.role || 'editor', token: usableToken, since: new Date().toISOString() });
      toast(warning || 'Open any subteam page to start editing.', { title: `Signed in as ${entry.username}`, type: warning ? 'error' : 'info', timeout: warning ? 10000 : 5000 });
      navigate(next);
    } catch (err) {
      failures += 1;
      showError(form, esc(err.code === 'bad-password' ? 'Incorrect username or password.' : err.message));
      qs('#l-pass', form).select();
    } finally {
      setBusy(btn, false);
    }
  });
}

// ------------------------------------------------------------ admin tools
async function renderAdmin(root, ctx) {
  const { config } = ctx;
  const session = getSession();
  const editorsDoc = await loadEditors(config);

  if (!session) {
    if (editorsDoc.editors.length === 0) return renderSetup(root, ctx);
    navigate('/login?next=%23%2Fadmin', { replace: true });
    return;
  }

  const isAdmin = session.role === 'admin';
  const gh = session.token ? new GitHub({ ...config.github, token: session.token }) : null;

  root.innerHTML = shell(`
    <header class="admin-head">
      <p class="eyebrow">Editor tools</p>
      <h1>Hi, ${esc(session.username)}</h1>
      <p class="lead">Manage your account${isAdmin ? ', the editor list, the GitHub token and subteams' : ''}. Every change here is saved as a commit to <a href="https://github.com/${esc(config.github.owner)}/${esc(config.github.repo)}" target="_blank" rel="noopener noreferrer">${esc(config.github.owner)}/${esc(config.github.repo)}</a>.</p>
      ${gh ? '' : `<div class="notice">${icon.key}<span>Your session has no working save token, so changes here can't be committed. Ask an admin to reset your account or rotate the token.</span></div>`}
    </header>

    <div class="admin-grid">
      <section class="card admin-card" aria-labelledby="acc-title">
        <h2 id="acc-title">${icon.lock} Change your password</h2>
        <form id="pw-form" novalidate>
          <div class="field"><label for="pw-old">Current password</label><input id="pw-old" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="pw-new">New password</label><input id="pw-new" type="password" autocomplete="new-password" required aria-describedby="pw-hint"><span class="hint" id="pw-hint">At least 12 characters. A few random words make a strong, memorable passphrase.</span></div>
          <div class="field"><label for="pw-new2">Repeat new password</label><input id="pw-new2" type="password" autocomplete="new-password" required></div>
          <div class="form-error" role="alert" tabindex="-1" hidden></div>
          <button class="btn btn-primary btn-sm" type="submit" ${gh ? '' : 'disabled'}>Update password</button>
        </form>
      </section>

      ${isAdmin ? `
      <section class="card admin-card" aria-labelledby="ed-title">
        <h2 id="ed-title">${icon.users} Editors</h2>
        <div id="editor-list"></div>
        <h3>Add an editor</h3>
        <form id="add-form" novalidate>
          <div class="field-row">
            <div class="field"><label for="a-user">Username</label><input id="a-user" autocapitalize="none" spellcheck="false" required placeholder="e.g. alex.k"></div>
            <div class="field"><label for="a-role">Role</label>
              <select id="a-role"><option value="editor">Editor</option><option value="admin">Admin</option></select></div>
          </div>
          <div class="field"><label for="a-pass">Temporary password</label><input id="a-pass" type="text" autocomplete="off" required aria-describedby="a-hint">
            <span class="hint" id="a-hint">Share it privately. They should change it on this page after signing in.</span></div>
          <div class="form-error" role="alert" tabindex="-1" hidden></div>
          <button class="btn btn-primary btn-sm" type="submit" ${gh ? '' : 'disabled'}>${icon.plus} Add editor</button>
        </form>
      </section>

      <section class="card admin-card" aria-labelledby="tok-title">
        <h2 id="tok-title">${icon.key} GitHub token</h2>
        <div id="token-status" class="token-status"><span class="spinner" aria-hidden="true"></span> Checking…</div>
        <h3>Rotate the token</h3>
        <p class="muted">Create a new fine-grained token (<a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">GitHub → New token</a>) limited to <strong>${esc(config.github.repo)}</strong> with <strong>Contents: Read and write</strong>. Paste it here, then revoke the old one on GitHub. Every editor gets the new token automatically.</p>
        <form id="rot-form" novalidate>
          <div class="field"><label for="r-token">New token</label><input id="r-token" type="password" autocomplete="off" spellcheck="false" required placeholder="github_pat_…"></div>
          <div class="form-error" role="alert" tabindex="-1" hidden></div>
          <button class="btn btn-primary btn-sm" type="submit">${icon.key} Rotate token</button>
        </form>
      </section>

      <section class="card admin-card" aria-labelledby="st-title">
        <h2 id="st-title">${icon.folder} Add a subteam</h2>
        <p class="muted">Creates the subteam's resource page, adds it to the menu and the home page. Edit the wording later in <code>content/site.json</code>.</p>
        <form id="st-form" novalidate>
          <div class="field-row">
            <div class="field"><label for="s-name">Name</label><input id="s-name" required placeholder="e.g. Media"></div>
            <div class="field"><label for="s-slug">Page address</label><input id="s-slug" required placeholder="media" pattern="[a-z0-9-]+"></div>
          </div>
          <div class="field"><label for="s-tag">Tagline</label><input id="s-tag" required placeholder="e.g. Telling the team's story"></div>
          <div class="field"><label for="s-sum">Summary (2–3 sentences)</label><textarea id="s-sum" required></textarea></div>
          <div class="form-error" role="alert" tabindex="-1" hidden></div>
          <button class="btn btn-primary btn-sm" type="submit" ${gh ? '' : 'disabled'}>${icon.plus} Add subteam</button>
        </form>
      </section>` : `
      <section class="card admin-card">
        <h2>${icon.users} Need more access?</h2>
        <p class="muted">Admins manage editors, the GitHub token and subteams. Ask an admin if you need something changed.</p>
      </section>`}
    </div>

    <p class="muted admin-foot">Full instructions, including how to do all of this by hand on GitHub, are in <a href="https://github.com/${esc(config.github.owner)}/${esc(config.github.repo)}/blob/${esc(config.github.branch)}/ADMIN.md" target="_blank" rel="noopener noreferrer">ADMIN.md</a>.</p>
  `, { wide: true });

  // ---- shared: read-modify-write editors.json as one commit
  async function updateEditors(mutate, message, tokenGh = gh) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await tokenGh.getJSON(EDITORS_PATH);
      const doc = normalize(cur?.data);
      const next = await mutate(structuredClone(doc));
      try {
        await tokenGh.commit({
          message: `${message}\n\nSaved from the website editor by ${session.username}.`,
          changes: [{ path: EDITORS_PATH, text: serialize(next) }],
          expected: { [EDITORS_PATH]: cur?.sha || null },
        });
        setCached(EDITORS_PATH, next);
        return next;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt === 1) throw err;
      }
    }
    return null;
  }

  // ---- change own password
  qs('#pw-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = qs('button[type="submit"]', form);
    const oldPw = qs('#pw-old', form).value;
    const newPw = qs('#pw-new', form).value;
    if (newPw !== qs('#pw-new2', form).value) { showError(form, 'The new passwords don’t match.'); return; }
    const weak = checkPasswordStrength(newPw);
    if (weak) { showError(form, esc(weak)); return; }
    showError(form, '');
    setBusy(btn, true, 'Saving…');
    try {
      await updateEditors(async (doc) => {
        const i = doc.editors.findIndex((x) => x.username === session.username);
        if (i < 0) throw new Error('Your account was not found in editors.json.');
        doc.editors[i] = await changeEntryPassword(doc.editors[i], oldPw, newPw, iterations(config));
        return doc;
      }, `Change password for ${session.username}`);
      form.reset();
      toast('Use your new password next time you sign in.', { title: 'Password updated' });
    } catch (err) {
      showError(form, esc(err.code === 'bad-password' ? 'Your current password is incorrect.' : err.message));
    } finally { setBusy(btn, false); }
  });

  if (!isAdmin) return;

  // ---- editor list
  const renderList = (doc) => {
    const list = qs('#editor-list', root);
    list.innerHTML = `
      <table class="admin-table">
        <thead><tr><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Can save</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          ${doc.editors.map((x) => `
            <tr>
              <td><strong>${esc(x.username)}</strong>${x.username === session.username ? ' <span class="muted">(you)</span>' : ''}</td>
              <td>${esc(x.role || 'editor')}</td>
              <td>${x.token ? 'Yes' : 'No'}</td>
              <td class="row-actions">${x.username === session.username ? '' : `
                <button class="btn btn-ghost btn-sm" type="button" data-reset="${esc(x.username)}">Reset password</button>
                <button class="btn btn-ghost btn-sm btn-danger" type="button" data-remove="${esc(x.username)}">${icon.trash}<span class="sr-only">Remove ${esc(x.username)}</span></button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  };
  renderList(editorsDoc);

  qs('#editor-list', root).addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    const rs = e.target.closest('[data-reset]');
    if (!gh || (!rm && !rs)) return;
    if (rm) {
      const name = rm.dataset.remove;
      const ok = await confirmDialog({
        title: `Remove ${name}?`,
        message: `${name} will no longer be able to sign in. Because they may have seen the team token, rotate the token next (the form below) and revoke the old one on GitHub.`,
        confirmLabel: 'Remove editor',
        danger: true,
      });
      if (!ok) return;
      try {
        const doc = await updateEditors((d) => ({ ...d, editors: d.editors.filter((x) => x.username !== name) }), `Remove editor ${name}`);
        renderList(doc);
        toast('Now rotate the GitHub token so they can’t reuse it.', { title: `${name} removed`, timeout: 9000 });
        qs('#r-token', root).focus();
      } catch (err) { toast(err.message, { type: 'error' }); }
    }
    if (rs) {
      const name = rs.dataset.reset;
      const temp = await promptText({ title: `Reset password for ${name}`, label: 'New temporary password', confirmLabel: 'Reset password', hint: 'At least 12 characters. Share it privately; they should change it after signing in.' });
      if (!temp) return;
      const weak = checkPasswordStrength(temp);
      if (weak) { toast(weak, { type: 'error' }); return; }
      try {
        const doc = await updateEditors(async (d) => {
          const i = d.editors.findIndex((x) => x.username === name);
          if (i < 0) throw new Error('Editor not found.');
          d.editors[i] = await createEditorEntry({ username: name, password: temp, token: session.token, role: d.editors[i].role, iterations: iterations(config) });
          return d;
        }, `Reset password for ${name}`);
        renderList(doc);
        toast(`${name} can sign in with the temporary password now (or within a minute).`, { title: 'Password reset' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    }
  });

  // ---- add editor
  qs('#add-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = qs('button[type="submit"]', form);
    const username = qs('#a-user', form).value.trim().toLowerCase();
    const password = qs('#a-pass', form).value;
    const role = qs('#a-role', form).value;
    if (!USERNAME_RE.test(username)) { showError(form, 'Usernames are 2–32 characters: lowercase letters, numbers, dot, dash or underscore.'); return; }
    const weak = checkPasswordStrength(password);
    if (weak) { showError(form, esc(weak)); return; }
    showError(form, '');
    setBusy(btn, true, 'Creating keys…');
    try {
      const doc = await updateEditors(async (d) => {
        if (d.editors.some((x) => x.username === username)) throw new Error(`${username} already exists.`);
        d.editors.push(await createEditorEntry({ username, password, token: session.token, role, iterations: iterations(config) }));
        return d;
      }, `Add editor ${username}`);
      renderList(doc);
      form.reset();
      toast(`${username} can sign in within about a minute. Share the temporary password privately.`, { title: 'Editor added' });
    } catch (err) { showError(form, esc(err.message)); } finally { setBusy(btn, false); }
  });

  // ---- token status + rotation
  (async () => {
    const box = qs('#token-status', root);
    if (!gh) { box.innerHTML = `${icon.close} <span>No working token in this session.</span>`; return; }
    try {
      const a = await gh.checkAccess();
      const exp = a.expires ? new Date(a.expires) : null;
      box.innerHTML = `${a.canPush ? icon.check : icon.close}<span>${a.canPush ? 'Token works and can save' : 'Token is read-only'}${exp ? ` · expires ${esc(exp.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}` : ''}</span>`;
    } catch (err) {
      box.innerHTML = `${icon.close}<span>${esc(err.message)}</span>`;
    }
  })();

  qs('#rot-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = qs('button[type="submit"]', form);
    const token = qs('#r-token', form).value.trim();
    if (!token) { showError(form, 'Paste the new token.'); return; }
    showError(form, '');
    setBusy(btn, true, 'Checking token…');
    try {
      const newGh = new GitHub({ ...config.github, token });
      const access = await newGh.checkAccess();
      if (!access.canPush) throw new Error('That token can’t write to the repo. Give it “Contents: Read and write”.');
      await updateEditors(async (d) => {
        for (const x of d.editors) x.token = await wrapToken(x, token);
        return d;
      }, 'Rotate the team GitHub token', newGh);
      setSession({ ...session, token });
      form.reset();
      toast('Every editor now uses the new token. Revoke the old token on GitHub.', { title: 'Token rotated', timeout: 9000 });
      qs('#token-status', root).innerHTML = `${icon.check}<span>New token active</span>`;
    } catch (err) { showError(form, esc(err.message)); } finally { setBusy(btn, false); }
  });

  // ---- add subteam
  const nameEl = qs('#s-name', root);
  const slugEl = qs('#s-slug', root);
  nameEl.addEventListener('input', () => { if (!slugEl.dataset.touched) slugEl.value = slugify(nameEl.value); });
  slugEl.addEventListener('input', () => { slugEl.dataset.touched = '1'; });
  qs('#st-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = qs('button[type="submit"]', form);
    const name = nameEl.value.trim();
    const slug = slugify(slugEl.value);
    const tagline = qs('#s-tag', form).value.trim();
    const summary = qs('#s-sum', form).value.trim();
    if (!name || !slug || !tagline || !summary) { showError(form, 'Fill in every field.'); return; }
    showError(form, '');
    setBusy(btn, true, 'Creating…');
    try {
      const site = await gh.getJSON('content/site.json');
      if (site.data.subteams.some((t) => t.slug === slug)) throw new Error(`A subteam at #/team/${slug} already exists.`);
      site.data.subteams.push({ slug, name, tagline, summary, tags: [] });
      const sections = { version: 1, subteam: slug, updated: new Date().toISOString().slice(0, 10), sections: [] };
      await gh.commit({
        message: `Add ${name} subteam\n\nSaved from the website editor by ${session.username}.`,
        changes: [
          { path: 'content/site.json', text: `${JSON.stringify(site.data, null, 2)}\n` },
          { path: `content/${slug}/sections.json`, text: `${JSON.stringify(sections, null, 2)}\n` },
          { path: `content/${slug}/files/.gitkeep`, text: '' },
        ],
        expected: { 'content/site.json': site.sha, [`content/${slug}/sections.json`]: null },
      });
      form.reset();
      delete slugEl.dataset.touched;
      toast(`The ${name} page will appear in the menu after the site redeploys (about a minute). Reload then.`, { title: 'Subteam added', timeout: 9000 });
    } catch (err) { showError(form, esc(err.message)); } finally { setBusy(btn, false); }
  });
}

// ------------------------------------------------------- first-time setup
async function renderSetup(root, { config }) {
  root.innerHTML = shell(`
    <div class="auth-card card is-setup">
      <span class="auth-ico" aria-hidden="true">${icon.key}</span>
      <h1>First-time setup</h1>
      <p class="muted">Nobody can edit the site yet. Create the first <strong>admin</strong> account. You'll need a GitHub token that can write to <strong>${esc(config.github.owner)}/${esc(config.github.repo)}</strong>.</p>
      <ol class="setup-steps">
        <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">GitHub → Settings → Fine-grained tokens → Generate new token</a>.</li>
        <li><strong>Resource owner:</strong> ${esc(config.github.owner)}. <strong>Repository access:</strong> Only select repositories → ${esc(config.github.repo)}.</li>
        <li><strong>Permissions → Repository → Contents:</strong> Read and write. Leave everything else as “No access”.</li>
        <li>Pick an expiration (up to a year), generate it and paste it below.</li>
      </ol>
      <form id="setup-form" novalidate>
        <div class="field"><label for="su-user">Admin username</label><input id="su-user" autocapitalize="none" spellcheck="false" autocomplete="username" required></div>
        <div class="field"><label for="su-pass">Password</label><input id="su-pass" type="password" autocomplete="new-password" required aria-describedby="su-hint"><span class="hint" id="su-hint">At least 12 characters. This password protects the token, so make it strong.</span></div>
        <div class="field"><label for="su-pass2">Repeat password</label><input id="su-pass2" type="password" autocomplete="new-password" required></div>
        <div class="field"><label for="su-token">GitHub token</label><input id="su-token" type="password" autocomplete="off" spellcheck="false" required placeholder="github_pat_…"></div>
        <div class="form-error" role="alert" tabindex="-1" hidden></div>
        <button class="btn btn-primary" type="submit" style="width:100%">${icon.key} Create admin account</button>
      </form>
      <p class="auth-foot muted">The token is encrypted with your password in your browser before it's committed. It is never stored in plain text. See ADMIN.md for details and limits.</p>
    </div>`);

  const form = qs('#setup-form', root);
  qs('#su-user', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('button[type="submit"]', form);
    const username = qs('#su-user', form).value.trim().toLowerCase();
    const password = qs('#su-pass', form).value;
    const token = qs('#su-token', form).value.trim();
    if (!USERNAME_RE.test(username)) { showError(form, 'Usernames are 2–32 characters: lowercase letters, numbers, dot, dash or underscore.'); return; }
    if (password !== qs('#su-pass2', form).value) { showError(form, 'The passwords don’t match.'); return; }
    const weak = checkPasswordStrength(password);
    if (weak) { showError(form, esc(weak)); return; }
    if (!token) { showError(form, 'Paste the GitHub token.'); return; }
    showError(form, '');
    setBusy(btn, true, 'Checking token…');
    try {
      const gh = new GitHub({ ...config.github, token });
      const access = await gh.checkAccess();
      if (!access.canPush) throw new Error('That token can’t write to the repo. It needs “Contents: Read and write” on this repository.');
      setBusy(btn, false); setBusy(btn, true, 'Encrypting…');
      const cur = await gh.getJSON(EDITORS_PATH);
      const doc = normalize(cur?.data);
      if (doc.editors.length) throw new Error('Setup was already completed. Sign in instead.');
      doc.editors.push(await createEditorEntry({ username, password, token, role: 'admin', iterations: iterations(config) }));
      setBusy(btn, false); setBusy(btn, true, 'Saving to GitHub…');
      await gh.commit({
        message: `Add first admin (${username})\n\nCreated from the website's first-time setup.`,
        changes: [{ path: EDITORS_PATH, text: serialize(doc) }],
        expected: { [EDITORS_PATH]: cur?.sha || null },
      });
      setCached(EDITORS_PATH, doc);
      setSession({ username, role: 'admin', token, since: new Date().toISOString() });
      toast('You are signed in. Open any subteam page to start editing, or add more editors here.', { title: 'Setup complete', timeout: 9000 });
      navigate('/admin', { replace: true });
    } catch (err) {
      showError(form, esc(err.message));
    } finally { setBusy(btn, false); }
  });
}
