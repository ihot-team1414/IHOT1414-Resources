// Small UI helpers shared by every page: escaping, toasts, dialogs, misc.
import { icon } from './icons.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

export function uid(prefix = 'id') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${r[0].toString(36)}${r[1].toString(36)}`.slice(0, 18);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Screen-reader announcements ---------------------------------------
export function announce(message) {
  const region = document.getElementById('sr-status');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 30);
}

// --- Toasts --------------------------------------------------------------
export function toast(message, { title = '', type = 'info', timeout = 5000, html = false } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' is-error' : ''}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <div class="toast-body">
      ${title ? `<div class="toast-title">${esc(title)}</div>` : ''}
      <div>${html ? message : esc(message)}</div>
    </div>
    <button class="icon-btn" type="button" aria-label="Dismiss">${icon.close}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  host.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// --- Modal dialogs (native <dialog>, so focus trapping & Esc are built in) ---
export function openModal({ title, body, footer = '', wide = false, onOpen, onClose, labelledBy } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal${wide ? ' is-wide' : ''}`;
  const titleId = labelledBy || uid('dlg');
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.innerHTML = `
    <div class="modal-head">
      <h2 id="${titleId}">${esc(title)}</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon.close}</button>
    </div>
    <div class="modal-body"></div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  const bodyEl = dlg.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  document.body.appendChild(dlg);
  const opener = document.activeElement;
  const close = (result) => { dlg.returnValue = result ?? ''; dlg.close(); };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close('cancel');
    // click on backdrop
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close('cancel');
    }
  });
  dlg.addEventListener('close', () => {
    onClose?.(dlg.returnValue);
    dlg.remove();
    if (opener && document.contains(opener)) opener.focus();
  });
  dlg.showModal();
  onOpen?.(dlg);
  return { dialog: dlg, body: bodyEl, close };
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { dialog, close } = openModal({
      title,
      body: `<p style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
      footer: `<button class="btn btn-secondary btn-sm" type="button" data-cancel>${esc(cancelLabel)}</button>
               <button class="btn btn-primary btn-sm ${danger ? 'btn-danger' : ''}" type="button" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => { answered = true; resolve(false); close(); });
    const ok = dialog.querySelector('[data-ok]');
    ok.addEventListener('click', () => { answered = true; resolve(true); close(); });
    ok.focus();
  });
}

/** Ask the user to pick one of several actions. Resolves with the chosen key (or null). */
export function choiceDialog({ title, message, choices }) {
  return new Promise((resolve) => {
    let answered = false;
    const { dialog, close } = openModal({
      title,
      body: `<p style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
      footer: choices.map((c) => `<button class="btn btn-sm ${c.primary ? 'btn-primary' : 'btn-secondary'}" type="button" data-choice="${esc(c.key)}">${esc(c.label)}</button>`).join(''),
      onClose: () => { if (!answered) resolve(null); },
    });
    dialog.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      answered = true; resolve(b.dataset.choice); close();
    }));
  });
}
