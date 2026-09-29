// Modal forms for adding/editing content blocks.
import { esc, openModal, uid, toast, formatBytes } from '../ui.js';
import { icon } from '../icons.js';
import { BLOCK_TYPES, parseYouTube, parseDrive, linkKind, renderBlock, setLocalPreview } from '../blocks.js';
import { isSafeUrl } from '../sanitize.js';
import { createRichEditor } from './richtext.js';
import { prepareUpload } from './upload.js';

const TYPE_HELP = {
  text: 'Headings, bold, lists, colors and links.',
  link: 'A website, or a Google Doc, Sheet or Slides link.',
  youtube: 'Embed a YouTube video (loads when clicked).',
  drive: 'Preview a Google Drive video, Doc, Sheet or Slides.',
  image: 'Upload a photo or screenshot (auto-optimized).',
  pdf: 'Upload a PDF or link to one.',
  video: 'Upload a short clip. Use YouTube or Drive for anything big.',
};

/** Step 1: choose a block type. Resolves with the type key or null. */
export function pickBlockType() {
  return new Promise((resolve) => {
    let picked = null;
    const { dialog, close } = openModal({
      title: 'Add content',
      body: `<div class="type-grid">${Object.entries(BLOCK_TYPES).map(([key, t]) => `
        <button class="type-card" type="button" data-type="${key}">
          <span class="type-ico" aria-hidden="true">${icon[t.icon]}</span>
          <span><strong>${esc(t.label)}</strong><span>${esc(TYPE_HELP[key])}</span></span>
        </button>`).join('')}</div>`,
      onClose: () => resolve(picked),
    });
    dialog.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.type; close(); }));
    dialog.querySelector('[data-type]')?.focus();
  });
}

const field = (id, label, input, hint = '') => `
  <div class="field">
    <label for="${id}">${label}</label>
    ${input}
    ${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ''}
  </div>`;

function uploadField(kind, accept, current) {
  return `
    <div class="field">
      <span class="label" id="up-label">${kind === 'image' ? 'Image' : kind === 'pdf' ? 'PDF file' : 'Video file'}</span>
      <label class="dropzone" for="f-file">
        ${icon.upload}
        <span><strong>Choose a file</strong> or drag it here</span>
        <span class="hint" id="f-file-status">${current ? `Current: ${esc(current.split('/').pop())}` : 'Nothing selected'}</span>
        <input id="f-file" type="file" accept="${accept}" class="sr-only" aria-describedby="up-label f-file-status">
      </label>
    </div>`;
}

/**
 * Open the form for a block. Resolves with { block, upload } or null if cancelled.
 * `upload` is { path, blob } when a new file must be committed with the page.
 */
export async function editBlockForm(type, existing, { config, slug }) {
  const b = existing ? structuredClone(existing) : { id: uid('b'), type };
  const label = BLOCK_TYPES[type]?.label || type;
  let rich = null;
  let upload = null;

  let body = '';
  switch (type) {
    case 'text':
      body = `<div class="rich-wrap"><div id="f-rich"></div></div>`;
      break;
    case 'link':
      body = field('f-url', 'Link (URL)', `<input id="f-url" type="url" required placeholder="https://docs.google.com/…" value="${esc(b.url || '')}" aria-describedby="f-url-hint">`, 'Google Docs, Sheets and Slides get their own icon automatically. You can also link to a file in the repo, like content/cad/files/drawing.pdf')
        + field('f-title', 'Title', `<input id="f-title" required value="${esc(b.title || '')}" placeholder="e.g. Drivetrain CAD walkthrough">`)
        + field('f-desc', 'Short description (optional)', `<input id="f-desc" value="${esc(b.description || '')}" maxlength="160">`);
      break;
    case 'youtube':
      body = field('f-url', 'YouTube link', `<input id="f-url" type="url" required placeholder="https://www.youtube.com/watch?v=…" value="${esc(b.url || '')}" aria-describedby="f-url-hint">`, 'Normal, youtu.be, Shorts and timestamped links all work. Unlisted videos are fine.')
        + field('f-title', 'Title', `<input id="f-title" required value="${esc(b.title || '')}">`);
      break;
    case 'drive':
      body = field('f-url', 'Google Drive / Docs link', `<input id="f-url" type="url" required placeholder="https://drive.google.com/file/d/…" value="${esc(b.url || '')}" aria-describedby="f-url-hint">`, 'Set sharing to “Anyone with the link can view” (or your school domain) or viewers will see a sign-in box. Great for large videos.')
        + field('f-title', 'Title', `<input id="f-title" required value="${esc(b.title || '')}">`);
      break;
    case 'image':
      body = uploadField('image', 'image/png,image/jpeg,image/webp,image/gif', b.src)
        + field('f-src', '…or image URL', `<input id="f-src" type="url" placeholder="https://…" value="${/^https?:/.test(b.src || '') ? esc(b.src) : ''}">`)
        + field('f-alt', 'Alt text (describe the image)', `<input id="f-alt" required value="${esc(b.alt || '')}" aria-describedby="f-alt-hint">`, 'Screen readers read this aloud. e.g. “Wiring diagram of the swerve module”.')
        + field('f-caption', 'Caption (optional)', `<input id="f-caption" value="${esc(b.caption || '')}">`);
      break;
    case 'pdf':
      body = uploadField('pdf', 'application/pdf,.pdf', b.src)
        + field('f-src', '…or PDF URL', `<input id="f-src" type="url" placeholder="https://…" value="${/^https?:/.test(b.src || '') ? esc(b.src) : ''}">`)
        + field('f-title', 'Title', `<input id="f-title" required value="${esc(b.title || '')}">`);
      break;
    case 'video':
      body = `<p class="notice">${icon.youtube}<span>Videos are stored in the repo, so keep them short (limit ${esc(config.uploads?.maxVideoMB || 50)} MB). For anything longer, upload to YouTube (unlisted) or Google Drive and use those blocks instead.</span></p>`
        + uploadField('video', 'video/mp4,video/webm', b.src)
        + field('f-title', 'Title', `<input id="f-title" required value="${esc(b.title || '')}">`);
      break;
    default:
      return null;
  }
  body += '<div class="form-error" id="f-error" role="alert" hidden></div><div class="block-preview" id="f-preview" aria-live="polite"></div>';

  return new Promise((resolve) => {
    let result = null;
    const { dialog, close } = openModal({
      title: existing ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`,
      wide: type === 'text',
      body: `<form id="block-form" novalidate>${body}</form>`,
      footer: `<button class="btn btn-secondary btn-sm" type="button" data-close>Cancel</button>
               <button class="btn btn-primary btn-sm" type="submit" form="block-form" id="f-submit">${existing ? 'Update' : 'Add'}</button>`,
      onClose: () => resolve(result),
    });
    const form = dialog.querySelector('#block-form');
    const errBox = dialog.querySelector('#f-error');
    const preview = dialog.querySelector('#f-preview');
    const $ = (id) => dialog.querySelector(`#${id}`);
    const showError = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };

    if (type === 'text') {
      createRichEditor($('f-rich'), b.html).then((r) => { rich = r; r.focus(); }).catch((e) => showError(e.message));
    } else {
      form.querySelector('input')?.focus();
    }

    // Live preview + detection for URL-based blocks.
    const url = $('f-url');
    const refreshPreview = () => {
      if (!url) return;
      const v = url.value.trim();
      if (!v) { preview.innerHTML = ''; return; }
      if (type === 'youtube') preview.innerHTML = parseYouTube(v) ? `<span class="tag">${icon.check} Valid YouTube video</span>` : '<span class="tag">Not a YouTube link yet</span>';
      if (type === 'drive') {
        const d = parseDrive(v);
        preview.innerHTML = d ? `<span class="tag">${icon.check} ${esc(linkKind(v).label)} detected</span>` : '<span class="tag">Not a Google Drive / Docs link yet</span>';
      }
      if (type === 'link') preview.innerHTML = `<span class="tag">${esc(linkKind(v).label)}</span>`;
    };
    url?.addEventListener('input', refreshPreview);
    refreshPreview();

    // File input + drag and drop.
    const fileInput = $('f-file');
    if (fileInput) {
      const zone = dialog.querySelector('.dropzone');
      const status = $('f-file-status');
      const handle = async (file) => {
        if (!file) return;
        showError('');
        status.textContent = `Preparing ${file.name}…`;
        try {
          const kind = type === 'image' ? 'image' : type === 'pdf' ? 'pdf' : 'video';
          const prepared = await prepareUpload(file, kind, { config, slug });
          upload = prepared;
          status.textContent = `${file.name} · ${prepared.note}`;
          if (type === 'image') {
            preview.innerHTML = `<img src="${URL.createObjectURL(prepared.blob)}" alt="" style="max-height:220px;border-radius:10px">`;
            if (!$('f-alt').value) $('f-alt').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
          }
          if ((type === 'pdf' || type === 'video') && $('f-title') && !$('f-title').value) {
            $('f-title').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
          }
          const src = $('f-src');
          if (src) src.value = '';
        } catch (err) {
          upload = null;
          status.textContent = 'Nothing selected';
          if (!err.cancelled) showError(err.message);
        }
      };
      fileInput.addEventListener('change', () => handle(fileInput.files[0]));
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
      zone.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      showError('');
      const val = (id) => ($(id)?.value || '').trim();
      try {
        switch (type) {
          case 'text':
            if (!rich) throw new Error('The editor is still loading.');
            if (rich.isEmpty()) throw new Error('Write something first.');
            b.html = rich.getHTML();
            break;
          case 'link':
            if (!isSafeUrl(val('f-url'))) throw new Error('Enter a full link starting with https:// (or a repo path like content/cad/files/x.pdf).');
            if (!val('f-title')) throw new Error('Give the link a title.');
            Object.assign(b, { url: val('f-url'), title: val('f-title'), description: val('f-desc') });
            break;
          case 'youtube':
            if (!parseYouTube(val('f-url'))) throw new Error('That doesn’t look like a YouTube video link.');
            if (!val('f-title')) throw new Error('Give the video a title.');
            Object.assign(b, { url: val('f-url'), title: val('f-title') });
            break;
          case 'drive':
            if (!parseDrive(val('f-url'))) throw new Error('Paste a Google Drive file/folder link or a Google Docs/Sheets/Slides link.');
            if (!val('f-title')) throw new Error('Give it a title.');
            Object.assign(b, { url: val('f-url'), title: val('f-title') });
            break;
          case 'image': {
            const src = upload ? upload.path : (val('f-src') || (!/^https?:/.test(b.src || '') ? b.src : ''));
            if (!src) throw new Error('Upload an image or paste an image URL.');
            if (!upload && val('f-src') && !/^https:\/\//.test(val('f-src'))) throw new Error('Image URLs must start with https://');
            if (!val('f-alt')) throw new Error('Add alt text so screen-reader users know what the image shows.');
            Object.assign(b, { src, alt: val('f-alt'), caption: val('f-caption') });
            break;
          }
          case 'pdf': {
            const src = upload ? upload.path : (val('f-src') || (!/^https?:/.test(b.src || '') ? b.src : ''));
            if (!src) throw new Error('Upload a PDF or paste a PDF URL.');
            if (!upload && val('f-src') && !/^https:\/\//.test(val('f-src'))) throw new Error('PDF URLs must start with https://');
            if (!val('f-title')) throw new Error('Give the PDF a title.');
            Object.assign(b, { src, title: val('f-title') });
            if (upload) b.size = formatBytes(upload.size);
            break;
          }
          case 'video':
            if (!upload && !b.src) throw new Error('Choose a video file.');
            if (!val('f-title')) throw new Error('Give the video a title.');
            if (upload) { b.src = upload.path; b.size = formatBytes(upload.size); }
            b.title = val('f-title');
            break;
          default:
        }
      } catch (err) {
        showError(err.message);
        return;
      }
      if (upload) setLocalPreview(upload.path, URL.createObjectURL(upload.blob));
      if (!renderBlock(b)) { showError('That content could not be displayed. Check the link.'); return; }
      result = { block: b, upload: upload ? { path: upload.path, blob: upload.blob } : null };
      close('ok');
    });
  });
}

export function promptText({ title, label, value = '', confirmLabel = 'Save', hint = '' }) {
  return new Promise((resolve) => {
    let result = null;
    const { dialog, close } = openModal({
      title,
      body: `<form id="prompt-form">${field('p-input', label, `<input id="p-input" required value="${esc(value)}" maxlength="80">`, hint)}<div class="form-error" role="alert" hidden></div></form>`,
      footer: `<button class="btn btn-secondary btn-sm" type="button" data-close>Cancel</button>
               <button class="btn btn-primary btn-sm" type="submit" form="prompt-form">${esc(confirmLabel)}</button>`,
      onClose: () => resolve(result),
    });
    const input = dialog.querySelector('#p-input');
    input.focus();
    input.select();
    dialog.querySelector('#prompt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) { const er = dialog.querySelector('.form-error'); er.textContent = 'This can’t be empty.'; er.hidden = false; return; }
      result = v;
      close('ok');
    });
  });
}

export { toast };
