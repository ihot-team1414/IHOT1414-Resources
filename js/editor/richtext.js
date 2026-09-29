// Loads Quill (vendored) only when an editor opens a rich-text block.
import { sanitizeRich } from '../sanitize.js';

let loading = null;

export function loadQuill() {
  if (window.Quill) return Promise.resolve(window.Quill);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/quill/quill.snow.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'vendor/quill/quill.js';
      s.onload = () => resolve(window.Quill);
      s.onerror = () => { loading = null; reject(new Error('Could not load the text editor.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// Text colors editors can pick: the brand palette only.
const COLORS = ['#f5f8fc', '#d6e4f5', '#b6c2d2', '#8595ab', '#7ea9dd', '#598fcf', '#3e75b7', '#2f5a8e'];

export async function createRichEditor(container, html) {
  const Quill = await loadQuill();
  const quill = new Quill(container, {
    theme: 'snow',
    placeholder: 'Write a guide, checklist or notes…',
    modules: {
      toolbar: [
        [{ header: [2, 3, 4, false] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: COLORS }],
        [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
        ['link', 'blockquote', 'code'],
        ['clean'],
      ],
    },
  });
  // Content is sanitized before Quill ever sees it.
  quill.clipboard.dangerouslyPasteHTML(sanitizeRich(html || ''), 'silent');
  quill.history.clear();

  // Give toolbar buttons accessible names.
  container.previousElementSibling?.querySelectorAll('button, .ql-picker-label').forEach((b) => {
    const cls = [...b.classList].find((c) => c.startsWith('ql-') && c !== 'ql-active' && c !== 'ql-picker-label');
    const name = (cls || b.closest('.ql-picker')?.className.match(/ql-(\w+)/)?.[1] || '').replace('ql-', '');
    const val = b.value ? ` ${b.value}` : '';
    if (name && !b.getAttribute('aria-label')) b.setAttribute('aria-label', `${name}${val}`.trim());
  });

  return {
    quill,
    getHTML() {
      let out = quill.getSemanticHTML();
      out = out.replace(/&nbsp;/g, ' ').replace(/(<p><br><\/p>|<p><\/p>)+$/g, '');
      return sanitizeRich(out.trim());
    },
    isEmpty() {
      return quill.getText().trim().length === 0;
    },
    focus() { quill.focus(); },
  };
}
