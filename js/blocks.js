// Renders content blocks inside resource sections, and extracts their text
// for search. Block types:
//   text     { html }                         rich text (sanitized)
//   link     { url, title, description }      Docs/Sheets/Slides, websites, repo files
//   youtube  { url, title }                   click-to-load, privacy-enhanced embed
//   drive    { url, title }                   Google Drive video/doc preview embed
//   image    { src, alt, caption }
//   pdf      { src, title, size }
//   video    { src, title, size }             small uploaded clips (see ADMIN.md)

import { esc } from './ui.js';
import { icon } from './icons.js';
import { sanitizeRich, htmlToText, safeUrl } from './sanitize.js';

// Uploaded files not yet deployed to Pages are previewed from memory (editor only).
const localPreviews = new Map();
export function setLocalPreview(path, objectUrl) { localPreviews.set(path, objectUrl); }
export function resolveSrc(src) { return localPreviews.get(src) || safeUrl(src); }

export const BLOCK_TYPES = {
  text: { label: 'Rich text', icon: 'text' },
  link: { label: 'Link or Google Doc/Sheet/Slides', icon: 'link' },
  youtube: { label: 'YouTube video', icon: 'youtube' },
  drive: { label: 'Google Drive embed', icon: 'drive' },
  image: { label: 'Image', icon: 'image' },
  pdf: { label: 'PDF', icon: 'pdf' },
  video: { label: 'Video file (small)', icon: 'video' },
};

// --- URL helpers ------------------------------------------------------------
export function parseYouTube(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
        if (m) id = m[2];
      }
    }
    id = id.split(/[?&#/]/)[0];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    let start = 0;
    if (t) {
      const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      if (m) start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    }
    return { id, start };
  } catch (_) { return null; }
}

export function parseDrive(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    let m;
    if (host === 'docs.google.com' && (m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([A-Za-z0-9_-]{10,})/))) {
      const kind = m[1];
      const id = m[3];
      const published = !!m[2];
      let embed;
      if (kind === 'presentation') embed = `https://docs.google.com/presentation/d/${published ? 'e/' : ''}${id}/embed`;
      else if (kind === 'forms') embed = `https://docs.google.com/forms/d/${published ? 'e/' : ''}${id}/viewform?embedded=true`;
      else embed = `https://docs.google.com/${kind}/d/${published ? 'e/' : ''}${id}/preview`;
      return { kind, id, embed, open: url };
    }
    if (host === 'drive.google.com') {
      if ((m = u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})/))) {
        return { kind: 'file', id: m[1], embed: `https://drive.google.com/file/d/${m[1]}/preview`, open: `https://drive.google.com/file/d/${m[1]}/view` };
      }
      if ((m = u.pathname.match(/^\/drive\/(u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/))) {
        return { kind: 'folder', id: m[2], embed: `https://drive.google.com/embeddedfolderview?id=${m[2]}#list`, open: url };
      }
      const id = u.searchParams.get('id');
      if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) {
        return { kind: 'file', id, embed: `https://drive.google.com/file/d/${id}/preview`, open: `https://drive.google.com/file/d/${id}/view` };
      }
    }
  } catch (_) { /* not a URL */ }
  return null;
}

export function linkKind(url) {
  const u = String(url || '');
  if (/docs\.google\.com\/document/.test(u)) return { key: 'doc', label: 'Google Doc' };
  if (/docs\.google\.com\/spreadsheets/.test(u)) return { key: 'sheet', label: 'Google Sheet' };
  if (/docs\.google\.com\/presentation/.test(u)) return { key: 'slides', label: 'Google Slides' };
  if (/docs\.google\.com\/forms/.test(u)) return { key: 'doc', label: 'Google Form' };
  if (/drive\.google\.com/.test(u)) return { key: 'drive', label: 'Google Drive' };
  if (/(youtube\.com|youtu\.be)/.test(u)) return { key: 'youtube', label: 'YouTube' };
  if (/github\.com/.test(u)) return { key: 'github', label: 'GitHub' };
  if (/\.pdf($|\?)/i.test(u)) return { key: 'pdf', label: 'PDF' };
  if (/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(u)) return { key: 'image', label: 'Image' };
  if (!/^https?:/i.test(u)) return { key: 'file', label: 'Team file' };
  return { key: 'link', label: hostOf(u) };
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return 'Link'; }
}

const kindIcon = (key) => icon[{ link: 'external', drive: 'drive', doc: 'doc', sheet: 'sheet', slides: 'slides', youtube: 'youtube', github: 'github', pdf: 'pdf', image: 'image', file: 'file' }[key] || 'external'];

// --- Rendering ------------------------------------------------------------
export function renderBlock(b) {
  switch (b.type) {
    case 'text':
      return `<div class="blk blk-text rt">${sanitizeRich(b.html)}</div>`;

    case 'link': {
      const url = safeUrl(b.url);
      if (!url) return '';
      const kind = linkKind(url);
      const external = /^https?:/i.test(url);
      return `
        <a class="blk blk-link" href="${esc(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>
          <span class="blk-link-ico kind-${kind.key}" aria-hidden="true">${kindIcon(kind.key)}</span>
          <span class="blk-link-text">
            <span class="blk-link-title">${esc(b.title || url)}</span>
            ${b.description ? `<span class="blk-link-desc">${esc(b.description)}</span>` : ''}
            <span class="blk-link-meta">${esc(kind.label)}</span>
          </span>
          <span class="blk-link-go" aria-hidden="true">${external ? icon.external : icon.arrowRight}</span>
          ${external ? '<span class="sr-only">(opens in a new tab)</span>' : ''}
        </a>`;
    }

    case 'youtube': {
      const yt = parseYouTube(b.url);
      if (!yt) return `<p class="blk blk-error">Invalid YouTube link.</p>`;
      const title = b.title || 'YouTube video';
      return `
        <figure class="blk blk-embed">
          <div class="embed-frame" data-yt="${esc(yt.id)}" data-start="${yt.start}" data-title="${esc(title)}">
            <button class="embed-facade" type="button" aria-label="Play video: ${esc(title)}">
              <img src="https://i.ytimg.com/vi/${esc(yt.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360">
              <span class="play-btn" aria-hidden="true">${icon.youtube}</span>
            </button>
          </div>
          <figcaption>${icon.youtube}<span>${esc(title)}</span>
            <a href="https://www.youtube.com/watch?v=${esc(yt.id)}" target="_blank" rel="noopener noreferrer">Open on YouTube<span class="sr-only"> (opens in a new tab)</span></a></figcaption>
        </figure>`;
    }

    case 'drive': {
      const d = parseDrive(b.url);
      if (!d) return `<p class="blk blk-error">Invalid Google Drive link.</p>`;
      const title = b.title || 'Google Drive file';
      const kind = linkKind(b.url);
      return `
        <figure class="blk blk-embed">
          <div class="embed-frame is-doc${d.kind === 'presentation' || d.kind === 'file' ? ' is-video' : ''}" data-embed="${esc(d.embed)}" data-title="${esc(title)}">
            <button class="embed-facade drive-facade" type="button" aria-label="Load preview: ${esc(title)}">
              <span class="drive-facade-ico" aria-hidden="true">${kindIcon(kind.key)}</span>
              <span class="drive-facade-title">${esc(title)}</span>
              <span class="btn btn-secondary btn-sm" aria-hidden="true">${icon.eye} Load preview</span>
            </button>
          </div>
          <figcaption>${kindIcon(kind.key)}<span>${esc(title)}</span>
            <a href="${esc(d.open)}" target="_blank" rel="noopener noreferrer">Open in ${esc(kind.label)}<span class="sr-only"> (opens in a new tab)</span></a></figcaption>
        </figure>`;
    }

    case 'image': {
      const src = resolveSrc(b.src);
      if (!src) return '';
      return `
        <figure class="blk blk-image">
          <a href="${esc(src)}" target="_blank" rel="noopener noreferrer" class="img-link">
            <img src="${esc(src)}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async">
            <span class="sr-only">Open full-size image in a new tab</span>
          </a>
          ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}
        </figure>`;
    }

    case 'pdf': {
      const src = resolveSrc(b.src);
      if (!src) return '';
      const title = b.title || 'PDF document';
      return `
        <div class="blk blk-file">
          <span class="blk-link-ico kind-pdf" aria-hidden="true">${icon.pdf}</span>
          <span class="blk-link-text">
            <span class="blk-link-title">${esc(title)}</span>
            <span class="blk-link-meta">PDF${b.size ? ` · ${esc(b.size)}` : ''}</span>
          </span>
          <span class="blk-file-actions">
            <button class="btn btn-secondary btn-sm pdf-toggle" type="button" aria-expanded="false" data-src="${esc(src)}" data-title="${esc(title)}">${icon.eye}<span>Preview</span></button>
            <a class="btn btn-secondary btn-sm" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${icon.external}<span>Open</span></a>
          </span>
          <div class="pdf-frame" hidden></div>
        </div>`;
    }

    case 'video': {
      const src = resolveSrc(b.src);
      if (!src) return '';
      return `
        <figure class="blk blk-video">
          <video controls preload="metadata" playsinline src="${esc(src)}"${b.title ? ` aria-label="${esc(b.title)}"` : ''}></video>
          ${b.title ? `<figcaption>${icon.video}<span>${esc(b.title)}</span></figcaption>` : ''}
        </figure>`;
    }

    default:
      return '';
  }
}

export function blockText(b) {
  switch (b.type) {
    case 'text': return htmlToText(b.html);
    case 'link': return [b.title, b.description, b.url, linkKind(b.url).label].filter(Boolean).join(' ');
    case 'youtube': return [b.title, 'video youtube'].join(' ');
    case 'drive': return [b.title, linkKind(b.url).label].join(' ');
    case 'image': return [b.alt, b.caption, 'image'].filter(Boolean).join(' ');
    case 'pdf': return [b.title, 'pdf'].join(' ');
    case 'video': return [b.title, 'video'].join(' ');
    default: return '';
  }
}

// --- Interactivity for embeds (event delegation, call once per page) -------
export function wireEmbeds(root, signal) {
  root.addEventListener('click', (e) => {
    const facade = e.target.closest('.embed-facade');
    if (facade) {
      const frame = facade.closest('.embed-frame');
      let src = '';
      if (!frame) return;
      if (frame.dataset.yt) {
        const start = parseInt(frame.dataset.start, 10) || 0;
        src = `https://www.youtube-nocookie.com/embed/${frame.dataset.yt}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`;
      } else if (frame.dataset.embed) {
        src = frame.dataset.embed;
      }
      if (!src) return;
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = frame.dataset.title || 'Embedded content';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.loading = 'lazy';
      frame.replaceChildren(iframe);
      frame.classList.add('is-loaded');
      iframe.focus();
      return;
    }
    const pdfBtn = e.target.closest('.pdf-toggle');
    if (pdfBtn) {
      const holder = pdfBtn.closest('.blk-file').querySelector('.pdf-frame');
      const open = pdfBtn.getAttribute('aria-expanded') === 'true';
      if (!open && !holder.firstChild) {
        const iframe = document.createElement('iframe');
        iframe.src = pdfBtn.dataset.src;
        iframe.title = pdfBtn.dataset.title;
        iframe.loading = 'lazy';
        holder.appendChild(iframe);
      }
      holder.hidden = open;
      pdfBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      pdfBtn.querySelector('span').textContent = open ? 'Preview' : 'Hide preview';
    }
  }, { signal });
}
