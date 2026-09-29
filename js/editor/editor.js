// Edit mode for subteam resource pages. Loaded only for signed-in editors.
//
// Changes are kept locally until "Save", which makes one commit containing the
// page JSON plus any uploaded files. Conflicts are detected by comparing the
// file's git SHA with the one we loaded.

import Sortable from '../../vendor/sortable/sortable.esm.min.js';
import { esc, qs, qsa, toast, confirmDialog, choiceDialog, openModal, slugify, timeAgo, announce } from '../ui.js';
import { icon } from '../icons.js';
import { getSession, canSave } from '../auth/session.js';
import { GitHub, ConflictError } from '../github.js';
import { sectionsPath, setCached } from '../store.js';
import { pickBlockType, editBlockForm, promptText } from './forms.js';

import { loadEditorCss } from './css.js';

const FILES_RE = (slug) => new RegExp(`^content/${slug}/files/[^/]+$`);

function referencedFiles(data, slug) {
  const re = FILES_RE(slug);
  const set = new Set();
  (data.sections || []).forEach((s) => (s.blocks || []).forEach((b) => {
    [b.src, b.url].forEach((p) => { if (p && re.test(p)) set.add(p); });
  }));
  return set;
}

export async function attachEditor(page) {
  loadEditorCss();
  const ed = new Editor(page);
  await ed.init();
  return ed;
}

class Editor {
  constructor(page) {
    this.page = page;
    this.slug = page.slug;
    this.path = sectionsPath(page.slug);
    this.session = getSession();
    this.sha = null;
    this.snapshot = '';
    this.pending = new Map();         // path -> Blob (uploaded, not yet committed)
    this.ac = new AbortController();
    this.saving = false;
    this.gh = canSave()
      ? new GitHub({ ...page.config.github, token: this.session.token })
      : null;
  }

  async init() {
    const { page } = this;
    // Load the newest copy straight from GitHub (Pages can lag ~1 min) and its SHA.
    if (this.gh) {
      try {
        const res = await this.gh.getJSON(this.path);
        if (res) {
          page.data = res.data;
          page.data.sections ||= [];
          this.sha = res.sha;
        } else {
          this.sha = null; // file doesn't exist yet; first save creates it
        }
      } catch (err) {
        toast(err.message, { title: 'Could not load the latest version', type: 'error', timeout: 9000 });
      }
    }
    this.snapshot = this.serialize();
    page.editing = true;
    this.renderBar();
    page.renderSections();
    this.bind();
    page.setLeaveGuard({
      dirty: () => this.isDirty(),
      sameRoute: (r) => r.name === 'team' && r.params.slug === this.slug,
      confirm: () => confirmDialog({
        title: 'Leave without saving?',
        message: 'You have unsaved changes on this page. If you leave now they will be lost.',
        confirmLabel: 'Leave page',
        cancelLabel: 'Stay',
        danger: true,
      }),
    });
  }

  serialize() {
    const d = this.page.data;
    return `${JSON.stringify({ version: 1, subteam: this.slug, updated: d.updated || '', sections: d.sections }, null, 2)}\n`;
  }

  isDirty() {
    return this.serialize() !== this.snapshot || this.pending.size > 0;
  }

  // ------------------------------------------------------------------ UI
  renderBar() {
    const slot = qs('.editor-bar-slot', this.page.root);
    const s = this.session;
    slot.innerHTML = `
      <div class="editor-bar" role="region" aria-label="Editor controls">
        <div class="editor-bar-info">
          <span class="editor-dot" aria-hidden="true"></span>
          <span>Edit mode · <strong>${esc(s.username)}</strong>${this.gh ? '' : ' · <span class="muted">no save token (changes can be downloaded)</span>'}</span>
        </div>
        <div class="editor-bar-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="section-add">${icon.plus}<span>Add section</span></button>
          ${this.gh ? `<button class="btn btn-ghost btn-sm" type="button" data-action="history">${icon.history}<span>History</span></button>` : ''}
        </div>
      </div>
      <div class="save-bar" hidden role="region" aria-label="Unsaved changes">
        <div class="container save-bar-inner">
          <span class="save-status" aria-live="polite">Unsaved changes</span>
          <div class="save-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="discard">${icon.undo}<span>Discard</span></button>
            <button class="btn btn-primary btn-sm" type="button" data-action="save">${icon.save}<span>${this.gh ? 'Save changes' : 'Download changes'}</span></button>
          </div>
        </div>
      </div>`;
    // The save bar is fixed to the bottom of the viewport.
    const bar = qs('.save-bar', slot);
    document.body.appendChild(bar);
    this.saveBar = bar;
  }

  updateDirty() {
    const dirty = this.isDirty();
    if (this.saveBar) {
      this.saveBar.hidden = !dirty && !this.saving;
      const n = this.pending.size;
      if (!this.saving) qs('.save-status', this.saveBar).textContent = dirty ? `Unsaved changes${n ? ` · ${n} file${n > 1 ? 's' : ''} to upload` : ''}` : 'All changes saved';
    }
    document.body.classList.toggle('has-save-bar', dirty || this.saving);
  }

  afterRender() {
    // Called by the page after every sections re-render.
    this.updateDirty();
    this.page.observeToc?.();
  }

  changed(msg) {
    this.page.renderSections();
    if (msg) announce(msg);
  }

  focusSection(id, selector = '.acc-btn') {
    requestAnimationFrame(() => qs(`.acc[data-id="${CSS.escape(id)}"] ${selector}`, this.page.root)?.focus());
  }

  // --------------------------------------------------------------- events
  bind() {
    const root = this.page.root;
    const signal = this.ac.signal;
    const onClick = async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      const secEl = btn.closest('.acc');
      const secId = secEl?.dataset.id;
      const blkId = btn.closest('.blk-wrap')?.dataset.bid;
      try {
        await this.handle(action, secId, blkId);
      } catch (err) {
        toast(err.message || String(err), { type: 'error', title: 'Something went wrong' });
        console.error(err);
      }
    };
    root.addEventListener('click', onClick, { signal });
    this.saveBar.addEventListener('click', onClick, { signal });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.isDirty() && !document.querySelector('dialog[open]')) this.save();
      }
    }, { signal });

    // Drag to reorder sections (touch friendly: short press-and-hold on phones).
    const list = qs('#res-sections', root);
    this.sortable = Sortable.create(list, {
      handle: '.acc-drag',
      draggable: '.acc',
      animation: 180,
      delay: 120,
      delayOnTouchOnly: true,
      touchStartThreshold: 4,
      ghostClass: 'acc-ghost',
      chosenClass: 'acc-chosen',
      dragClass: 'acc-drag-active',
      forceFallback: false,
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const ids = qsa('.acc', list).map((el) => el.dataset.id);
        const byId = new Map(this.page.data.sections.map((s) => [s.id, s]));
        this.page.data.sections = ids.map((id) => byId.get(id)).filter(Boolean);
        this.changed('Section moved');
      },
    });
  }

  section(id) {
    return this.page.data.sections.find((s) => s.id === id);
  }

  uniqueSectionId(title) {
    const base = slugify(title);
    let id = base;
    let i = 2;
    while (this.section(id)) id = `${base}-${i++}`;
    return id;
  }

  async handle(action, secId, blkId) {
    const data = this.page.data;
    const secs = data.sections;
    const idx = secs.findIndex((s) => s.id === secId);
    const sec = secs[idx];

    switch (action) {
      case 'section-add': {
        const title = await promptText({ title: 'New section', label: 'Section title', confirmLabel: 'Add section', hint: 'e.g. “Swerve drive” or “Onshape basics”' });
        if (!title) return;
        const id = this.uniqueSectionId(title);
        secs.push({ id, title, blocks: [] });
        this.page.open.add(id);
        this.changed(`Section ${title} added`);
        requestAnimationFrame(() => qs(`.acc[data-id="${CSS.escape(id)}"]`, this.page.root)?.scrollIntoView({ block: 'center' }));
        this.focusSection(id, '.add-block');
        return;
      }
      case 'section-rename': {
        const title = await promptText({ title: 'Rename section', label: 'Section title', value: sec.title });
        if (!title || title === sec.title) return;
        sec.title = title;          // id stays the same so existing links keep working
        this.changed('Section renamed');
        this.focusSection(sec.id);
        return;
      }
      case 'section-delete': {
        const n = sec.blocks?.length || 0;
        const ok = await confirmDialog({
          title: `Delete “${sec.title}”?`,
          message: n ? `This section and its ${n} item${n > 1 ? 's' : ''} will be removed when you save. You can restore it later from History.` : 'This empty section will be removed when you save.',
          confirmLabel: 'Delete section',
          danger: true,
        });
        if (!ok) return;
        secs.splice(idx, 1);
        this.page.open.delete(sec.id);
        this.changed('Section deleted');
        return;
      }
      case 'section-up':
      case 'section-down': {
        const to = action === 'section-up' ? idx - 1 : idx + 1;
        if (to < 0 || to >= secs.length) return;
        [secs[idx], secs[to]] = [secs[to], secs[idx]];
        this.changed(`Moved ${action === 'section-up' ? 'up' : 'down'}`);
        this.focusSection(sec.id, `[data-action="${action}"]:not([disabled])`);
        return;
      }
      case 'block-add': {
        const type = await pickBlockType();
        if (!type) return;
        const res = await editBlockForm(type, null, { config: this.page.config, slug: this.slug });
        if (!res) return;
        sec.blocks ||= [];
        sec.blocks.push(res.block);
        if (res.upload) this.pending.set(res.upload.path, res.upload.blob);
        this.page.open.add(sec.id);
        this.changed('Content added');
        return;
      }
      case 'block-edit': {
        const b = sec.blocks.find((x) => x.id === blkId);
        const res = await editBlockForm(b.type, b, { config: this.page.config, slug: this.slug });
        if (!res) return;
        const oldFile = b.src;
        sec.blocks[sec.blocks.indexOf(b)] = res.block;
        if (res.upload) {
          this.pending.set(res.upload.path, res.upload.blob);
          if (oldFile && this.pending.has(oldFile)) this.pending.delete(oldFile);
        }
        this.changed('Content updated');
        return;
      }
      case 'block-up':
      case 'block-down': {
        const bi = sec.blocks.findIndex((x) => x.id === blkId);
        const to = action === 'block-up' ? bi - 1 : bi + 1;
        if (to < 0 || to >= sec.blocks.length) return;
        [sec.blocks[bi], sec.blocks[to]] = [sec.blocks[to], sec.blocks[bi]];
        this.changed('Moved');
        requestAnimationFrame(() => qs(`.blk-wrap[data-bid="${CSS.escape(blkId)}"] [data-action="${action}"]:not([disabled])`, this.page.root)?.focus());
        return;
      }
      case 'block-delete': {
        const b = sec.blocks.find((x) => x.id === blkId);
        const ok = await confirmDialog({ title: 'Delete this item?', message: 'It will be removed when you save. You can restore it later from History.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        sec.blocks = sec.blocks.filter((x) => x.id !== blkId);
        if (b?.src && this.pending.has(b.src)) this.pending.delete(b.src);
        this.changed('Item deleted');
        return;
      }
      case 'discard': {
        const ok = await confirmDialog({ title: 'Discard changes?', message: 'This throws away everything you changed since the last save.', confirmLabel: 'Discard', danger: true });
        if (!ok) return;
        this.page.data = JSON.parse(this.snapshot);
        this.pending.clear();
        this.changed('Changes discarded');
        return;
      }
      case 'save':
        await this.save();
        return;
      case 'history':
        await this.showHistory();
        return;
      default:
    }
  }

  // ----------------------------------------------------------------- save
  async save({ overwrite = false } = {}) {
    if (this.saving) return;
    if (!this.gh) { this.download(); return; }

    const data = this.page.data;
    data.updated = new Date().toISOString().slice(0, 10);
    const json = this.serialize();
    const before = referencedFiles(JSON.parse(this.snapshot), this.slug);
    const after = referencedFiles(data, this.slug);
    const uploads = [...this.pending.entries()].filter(([p]) => after.has(p));
    const removed = [...before].filter((p) => !after.has(p));

    const changes = [
      { path: this.path, text: json },
      ...uploads.map(([path, blob]) => ({ path, blob })),
      ...removed.map((path) => ({ path, delete: true })),
    ];
    const team = this.page.team.name;
    const message = `Update ${team} resources\n\nSaved from the website editor by ${this.session.username}.`
      + (uploads.length ? `\nUploaded: ${uploads.map(([p]) => p.split('/').pop()).join(', ')}` : '')
      + (removed.length ? `\nRemoved unused: ${removed.map((p) => p.split('/').pop()).join(', ')}` : '');

    this.saving = true;
    const status = qs('.save-status', this.saveBar);
    const saveBtn = qs('[data-action="save"]', this.saveBar);
    saveBtn.disabled = true;
    status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving…';
    this.updateDirty();
    try {
      const res = await this.gh.commit({
        message,
        changes,
        expected: overwrite ? {} : { [this.path]: this.sha },
        onProgress: (p) => {
          if (p.step === 'upload' && p.path !== this.path) status.innerHTML = `<span class="spinner" aria-hidden="true"></span> Uploading ${esc(p.path.split('/').pop())}…`;
          if (p.step === 'commit') status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Committing…';
        },
      });
      this.sha = res.blobShas[this.path];
      this.snapshot = json;
      this.pending.clear();
      setCached(this.path, JSON.parse(json));
      toast(`Live on the site in about a minute. <a href="${esc(res.url)}" target="_blank" rel="noopener noreferrer">View commit</a>`, { title: 'Saved', html: true, timeout: 8000 });
      announce('Saved');
    } catch (err) {
      if (err instanceof ConflictError) {
        this.saving = false;
        saveBtn.disabled = false;
        await this.resolveConflict(err);
        return;
      }
      toast(err.message, { title: 'Save failed. Your changes are still here.', type: 'error', timeout: 12000 });
    } finally {
      this.saving = false;
      saveBtn.disabled = false;
      this.updateDirty();
    }
  }

  async resolveConflict(err) {
    const choice = await choiceDialog({
      title: 'Someone else saved this page',
      message: 'Another editor saved changes to this page after you opened it. You can load their version (your changes will be downloaded as a backup first), or overwrite theirs with yours.',
      choices: [
        { key: 'theirs', label: 'Load their version' },
        { key: 'mine', label: 'Overwrite with mine', primary: true },
      ],
    });
    if (choice === 'mine') {
      await this.save({ overwrite: true });
    } else if (choice === 'theirs') {
      this.download('my-unsaved-changes');
      const res = await this.gh.getJSON(this.path);
      this.page.data = res ? res.data : { sections: [] };
      this.sha = res ? res.sha : null;
      this.pending.clear();
      this.snapshot = this.serialize();
      this.changed('Loaded the latest version');
      toast('Loaded the latest version. Your changes were downloaded as a JSON backup.', { title: 'Updated' });
    }
  }

  download(name = `${this.slug}-sections`) {
    const blob = new Blob([this.serialize()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (!this.gh) {
      toast(`Downloaded. To publish it, upload it to <code>${esc(this.path)}</code> on GitHub (see ADMIN.md), or ask an admin to add a save token to your account.`, { title: 'Changes downloaded', html: true, timeout: 12000 });
    }
  }

  // -------------------------------------------------------------- history
  async showHistory() {
    const { dialog, body, close } = openModal({
      title: `${this.page.team.name} page history`,
      wide: true,
      body: '<div class="page-loading" style="min-height:160px"><span class="spinner"></span></div>',
    });
    let commits;
    try {
      commits = await this.gh.listCommits(this.path);
    } catch (err) {
      body.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      return;
    }
    if (!commits.length) { body.innerHTML = '<p class="muted">No saved versions yet.</p>'; return; }
    body.innerHTML = `
      <p class="muted" style="margin-top:0">Every save is a git commit. Load an older version to review it, then press Save to restore it. Nothing changes until you save.</p>
      <ol class="history-list">
        ${commits.map((c, i) => `
          <li>
            <div>
              <strong>${esc(c.commit.message.split('\n')[0])}</strong>
              <span class="muted">${esc(c.commit.message.match(/by ([\w.-]+)/)?.[1] || c.commit.author?.name || 'unknown')} · ${esc(timeAgo(c.commit.author?.date || c.commit.committer?.date))}${i === 0 ? ' · current' : ''}</span>
            </div>
            <div class="history-actions">
              <a class="btn btn-ghost btn-sm" href="${esc(c.html_url)}" target="_blank" rel="noopener noreferrer">${icon.external}<span>Diff</span></a>
              ${i === 0 ? '' : `<button class="btn btn-secondary btn-sm" type="button" data-restore="${esc(c.sha)}">${icon.undo}<span>Load this version</span></button>`}
            </div>
          </li>`).join('')}
      </ol>`;
    dialog.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-restore]');
      if (!btn) return;
      if (this.isDirty()) {
        const ok = await confirmDialog({ title: 'Replace your unsaved changes?', message: 'Loading an older version replaces what you have now (unsaved changes will be lost).', confirmLabel: 'Load version', danger: true });
        if (!ok) return;
      }
      btn.disabled = true;
      try {
        const old = await this.gh.getJSON(this.path, btn.dataset.restore);
        this.page.data = old.data;
        this.page.data.sections ||= [];
        this.pending.clear();
        close();
        this.changed('Older version loaded');
        toast('Older version loaded. Review it, then press Save changes to restore it.', { title: 'Version loaded', timeout: 9000 });
      } catch (err) {
        toast(err.message, { type: 'error' });
        btn.disabled = false;
      }
    });
  }

  destroy() {
    this.ac.abort();
    this.sortable?.destroy();
    this.saveBar?.remove();
    document.body.classList.remove('has-save-bar');
  }
}
