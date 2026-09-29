// Every piece of editor-written HTML goes through DOMPurify before it touches
// the page (on save AND on render), so a bad commit can't inject scripts.
import DOMPurify from '../vendor/dompurify/purify.es.min.mjs';

const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's',
  'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span', 'sub', 'sup', 'hr',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'style'];

// Only these inline styles survive (what the rich-text toolbar can produce).
const STYLE_RULES = {
  color: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\))$/i,
  'background-color': /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i,
  'font-size': /^(\d{1,2}(\.\d+)?(px|rem|em)|small|large|x-large)$/i,
  'text-align': /^(left|right|center|justify)$/i,
};
const CLASS_RE = /^(ql-(size-(small|large|huge)|align-(center|right|justify)|indent-[1-8])|rt-[a-z0-9-]+)$/;

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      const kept = [];
      data.attrValue.split(';').forEach((decl) => {
        const i = decl.indexOf(':');
        if (i < 0) return;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const value = decl.slice(i + 1).trim();
        if (STYLE_RULES[prop] && STYLE_RULES[prop].test(value)) kept.push(`${prop}: ${value}`);
      });
      if (kept.length) data.attrValue = kept.join('; ');
      else data.keepAttr = false;
    }
    if (data.attrName === 'class') {
      const kept = data.attrValue.split(/\s+/).filter((c) => CLASS_RE.test(c));
      if (kept.length) data.attrValue = kept.join(' ');
      else data.keepAttr = false;
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (!isSafeUrl(href)) { node.removeAttribute('href'); return; }
      if (/^https?:/i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      } else {
        node.removeAttribute('target');
      }
    }
  });
}

export function sanitizeRich(html) {
  configure();
  return DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/** Plain text from rich HTML (used by search). */
export function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = sanitizeRich(html);
  return div.textContent.replace(/\s+/g, ' ').trim();
}

/** http(s), mailto, in-page hash links and relative repo paths only. */
export function isSafeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (/^(https?:|mailto:)/i.test(u)) return true;
  if (u.startsWith('#')) return true;
  // relative path inside the site, e.g. content/cad/files/x.pdf or assets/...
  return /^(\.\/)?[a-z0-9_\-./%]+$/i.test(u) && !u.includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(u);
}

export function safeUrl(url) {
  return isSafeUrl(url) ? String(url).trim() : '';
}
