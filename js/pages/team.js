// Subteam resource page: accordion sections, live search, deep links.
// Signed-in editors get extra controls (see js/editor/editor.js).

import { esc, qs, qsa, debounce, announce, prefersReducedMotion } from '../ui.js';
import { icon, getSubteamIcon, getIllustration } from '../icons.js';
import { renderBlock, blockText, wireEmbeds, BLOCK_TYPES } from '../blocks.js';
import { loadSections } from '../store.js';
import { isEditor } from '../auth/session.js';

export async function mountTeamPage(root, ctx) {
  const page = new TeamPage(root, ctx);
  await page.init();
  return page;
}

function countLabel(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export class TeamPage {
  constructor(root, { site, config, team, sectionId, setLeaveGuard }) {
    this.name = 'team';
    this.root = root;
    this.site = site;
    this.config = config;
    this.team = team;
    this.slug = team.slug;
    this.setLeaveGuard = setLeaveGuard;
    this.initialSection = sectionId;
    this.data = { version: 1, subteam: team.slug, sections: [] };
    this.editing = false;
    this.editor = null;
    this.open = new Set();
    this.preSearchOpen = null;
    this.query = '';
    this.index = new Map();         // section id -> lowercase searchable text
    this.ac = new AbortController(); // removes every listener on unmount
  }

  async init() {
    try {
      this.data = structuredClone(await loadSections(this.slug, { fresh: true }));
    } catch (err) {
      this.loadError = err;
    }
    this.data.sections ||= [];
    this.renderShell();
    wireEmbeds(this.root, this.ac.signal);
    this.bind();

    if (isEditor()) {
      const { attachEditor } = await import('../editor/editor.js');
      this.editor = await attachEditor(this);
    }
    if (this.initialSection) this.openSection(this.initialSection);
  }

  // ---------------------------------------------------------------- render
  renderShell() {
    const t = this.team;
    const others = (this.site.subteams || []).filter((s) => s.slug !== t.slug);
    this.root.innerHTML = `
      <section class="res-hero" aria-labelledby="res-title">
        <div class="container">
          <nav class="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><a href="#/">Home</a></li>
              <li><a href="#/subteams">Subteams</a></li>
              <li><span aria-current="page">${esc(t.name)}</span></li>
            </ol>
          </nav>
          <div class="res-hero-grid">
            <div>
              <p class="eyebrow">Subteam resources</p>
              <h1 id="res-title"><span class="res-ico" aria-hidden="true">${getSubteamIcon(t.slug)}</span>${esc(t.name)}</h1>
              <p class="lead">${esc(t.summary)}</p>
            </div>
            <div class="res-hero-art" aria-hidden="true">${getIllustration(t.slug)}</div>
          </div>
          <div class="res-tools">
            <div class="res-search" role="search">
              <label class="sr-only" for="res-q">Search ${esc(t.name)} resources</label>
              <span class="res-search-ico" aria-hidden="true">${icon.search}</span>
              <input id="res-q" type="search" autocomplete="off" spellcheck="false"
                     placeholder="Search guides and links" aria-describedby="res-count">
              <kbd aria-hidden="true">/</kbd>
            </div>
            <div class="res-meta">
              <span id="res-count" aria-live="polite"></span>
              <button class="btn btn-ghost btn-sm" type="button" data-toggle-all>${icon.chevronDown}<span>Expand all</span></button>
            </div>
          </div>
          <div class="editor-bar-slot"></div>
        </div>
      </section>

      <div class="container res-layout">
        <aside class="res-toc" aria-label="Sections on this page">
          <p class="res-toc-title">On this page</p>
          <ol class="res-toc-list"></ol>
        </aside>
        <div class="res-main">
          ${this.loadError ? `<div class="form-error" role="alert">Could not load this page's resources (${esc(this.loadError.message)}). Try refreshing.</div>` : ''}
          <div class="res-sections" id="res-sections"></div>
          <div class="res-empty" hidden>
            <span class="res-empty-ico" aria-hidden="true">${icon.search}</span>
            <p><strong>No matches.</strong> Nothing in ${esc(t.name)} matches "<span class="res-empty-q"></span>". Try a shorter or different word.</p>
          </div>
        </div>
      </div>

      <section class="section res-others" aria-labelledby="others-title">
        <div class="container">
          <h2 id="others-title" class="res-others-title">More subteam resources</h2>
          <ul class="res-others-grid">
            ${others.map((o) => `
              <li><a class="res-other" href="#/team/${esc(o.slug)}">
                <span class="nav-ico" aria-hidden="true">${getSubteamIcon(o.slug)}</span>
                <span><strong>${esc(o.name)}</strong><span>${esc(o.tagline)}</span></span>
                ${icon.arrowRight}
              </a></li>`).join('')}
          </ul>
        </div>
      </section>`;
    this.renderSections();
  }

  renderSections() {
    const list = qs('#res-sections', this.root);
    const secs = this.data.sections;
    this.buildIndex();
    if (!secs.length) {
      list.innerHTML = `
        <div class="res-placeholder">
          <p><strong>No resources yet.</strong> ${this.editing ? 'Use “Add section” above to create the first one.' : 'Check back soon, or ask a subteam lead.'}</p>
        </div>`;
    } else {
      list.innerHTML = secs.map((s, i) => this.sectionHTML(s, i)).join('');
    }
    this.renderToc();
    this.updateCount();
    if (this.query) this.applySearch(this.query, { keepOpenState: true });
    this.editor?.afterRender();
  }

  sectionHTML(s, i) {
    const open = this.open.has(s.id);
    const n = s.blocks?.length || 0;
    const e = this.editing;
    const sid = esc(s.id);
    return `
      <article class="acc${open ? ' is-open' : ''}${e ? ' is-editing' : ''}" id="sec-${sid}" data-id="${sid}">
        <div class="acc-head">
          ${e ? `<button class="acc-drag icon-btn" type="button" aria-label="Drag to reorder “${esc(s.title)}”" title="Drag to reorder">${icon.grip}</button>` : ''}
          <h2 class="acc-h">
            <button class="acc-btn" type="button" aria-expanded="${open}" aria-controls="sec-${sid}-panel" id="sec-${sid}-btn">
              <span class="acc-title">${esc(s.title)}</span>
              <span class="acc-count">${countLabel(n, 'item')}</span>
              <span class="acc-chev" aria-hidden="true">${icon.chevronDown}</span>
            </button>
          </h2>
          ${e ? `
            <div class="acc-tools">
              <button class="icon-btn" type="button" data-action="section-up" aria-label="Move “${esc(s.title)}” up" ${i === 0 ? 'disabled' : ''}>${icon.arrowUp}</button>
              <button class="icon-btn" type="button" data-action="section-down" aria-label="Move “${esc(s.title)}” down" ${i === this.data.sections.length - 1 ? 'disabled' : ''}>${icon.arrowDown}</button>
              <button class="icon-btn" type="button" data-action="section-rename" aria-label="Rename “${esc(s.title)}”">${icon.edit}</button>
              <button class="icon-btn" type="button" data-action="section-delete" aria-label="Delete “${esc(s.title)}”">${icon.trash}</button>
            </div>`
          : `<button class="icon-btn acc-link" type="button" data-copy-link aria-label="Copy link to “${esc(s.title)}”" title="Copy link">${icon.link}</button>`}
        </div>
        <div class="acc-panel" id="sec-${sid}-panel" role="region" aria-labelledby="sec-${sid}-btn" ${open ? '' : 'inert'}>
          <div class="acc-panel-inner">
            <div class="acc-body">
              ${(s.blocks || []).map((b, bi) => this.blockHTML(b, bi, n)).join('') || (e ? '' : '<p class="muted">This section is empty.</p>')}
              ${e ? `<button class="add-block" type="button" data-action="block-add">${icon.plus} Add content</button>` : ''}
            </div>
          </div>
        </div>
      </article>`;
  }

  blockHTML(b, bi, n) {
    const inner = renderBlock(b);
    if (!this.editing) return `<div class="blk-wrap" data-bid="${esc(b.id)}">${inner}</div>`;
    const label = BLOCK_TYPES[b.type]?.label || b.type;
    return `
      <div class="blk-wrap is-editing" data-bid="${esc(b.id)}">
        <div class="blk-tools" role="group" aria-label="${esc(label)} block">
          <span class="blk-type">${icon[BLOCK_TYPES[b.type]?.icon] || ''}${esc(label)}</span>
          <button class="icon-btn" type="button" data-action="block-edit" aria-label="Edit ${esc(label)}">${icon.edit}</button>
          <button class="icon-btn" type="button" data-action="block-up" aria-label="Move up" ${bi === 0 ? 'disabled' : ''}>${icon.arrowUp}</button>
          <button class="icon-btn" type="button" data-action="block-down" aria-label="Move down" ${bi === n - 1 ? 'disabled' : ''}>${icon.arrowDown}</button>
          <button class="icon-btn" type="button" data-action="block-delete" aria-label="Delete ${esc(label)}">${icon.trash}</button>
        </div>
        ${inner || '<p class="muted">Empty block</p>'}
      </div>`;
  }

  renderToc() {
    const toc = qs('.res-toc-list', this.root);
    if (!toc) return;
    toc.innerHTML = this.data.sections.map((s) => `
      <li data-id="${esc(s.id)}"><a href="#/team/${esc(this.slug)}/${esc(s.id)}">${esc(s.title)}</a></li>`).join('');
  }

  updateCount(matchCount = null) {
    const el = qs('#res-count', this.root);
    const secs = this.data.sections.length;
    const items = this.data.sections.reduce((a, s) => a + (s.blocks?.length || 0), 0);
    if (matchCount === null) el.textContent = `${countLabel(secs, 'section')} · ${countLabel(items, 'resource')}`;
    else el.textContent = matchCount ? `${countLabel(matchCount, 'section')} match “${this.query}”` : `No sections match “${this.query}”`;
    const toggle = qs('[data-toggle-all] span', this.root);
    if (toggle) toggle.textContent = this.allOpen() ? 'Collapse all' : 'Expand all';
  }

  // --------------------------------------------------------------- behavior
  bind() {
    const root = this.root;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.acc-btn');
      if (btn) { this.toggle(btn.closest('.acc').dataset.id); return; }
      if (e.target.closest('[data-toggle-all]')) { this.toggleAll(); return; }
      const copy = e.target.closest('[data-copy-link]');
      if (copy) { this.copyLink(copy.closest('.acc').dataset.id, copy); return; }
      const tocLink = e.target.closest('.res-toc a');
      if (tocLink) {
        // Let the router handle it, but open immediately for snappy feel.
        const id = tocLink.closest('li').dataset.id;
        this.setOpen(id, true);
      }
    }, { signal: this.ac.signal });

    const input = qs('#res-q', root);
    const run = debounce(() => this.applySearch(input.value), 120);
    input.addEventListener('input', run, { signal: this.ac.signal });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { input.value = ''; this.applySearch(''); }
      if (e.key === 'Enter') {
        const first = qs('.acc:not([hidden]) .acc-btn', root);
        if (first) { e.preventDefault(); first.focus(); }
      }
    });

    // "/" focuses search (unless typing somewhere else).
    this.onSlash = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', this.onSlash, { signal: this.ac.signal });

    // Highlight the TOC entry for the section in view.
    if ('IntersectionObserver' in window) {
      this.tocObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const id = en.target.dataset.id;
          qsa('.res-toc li', root).forEach((li) => li.classList.toggle('is-current', li.dataset.id === id));
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      this.observeToc();
    }
  }

  observeToc() {
    if (!this.tocObserver) return;
    this.tocObserver.disconnect();
    qsa('.acc', this.root).forEach((el) => this.tocObserver.observe(el));
  }

  allOpen() {
    const visible = this.visibleSectionIds();
    return visible.length > 0 && visible.every((id) => this.open.has(id));
  }

  visibleSectionIds() {
    return qsa('.acc:not([hidden])', this.root).map((el) => el.dataset.id);
  }

  setOpen(id, open) {
    const el = qs(`.acc[data-id="${CSS.escape(id)}"]`, this.root);
    if (!el) return;
    if (open) this.open.add(id); else this.open.delete(id);
    el.classList.toggle('is-open', open);
    qs('.acc-btn', el).setAttribute('aria-expanded', String(open));
    const panel = qs('.acc-panel', el);
    if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
    this.updateCount(this.query ? this.visibleSectionIds().length : null);
  }

  toggle(id) {
    this.setOpen(id, !this.open.has(id));
  }

  toggleAll() {
    const target = !this.allOpen();
    this.visibleSectionIds().forEach((id) => this.setOpen(id, target));
  }

  openSection(id) {
    if (!id) return;
    const el = qs(`.acc[data-id="${CSS.escape(id)}"]`, this.root);
    if (!el) return;
    if (el.hidden) { qs('#res-q', this.root).value = ''; this.applySearch(''); }
    this.setOpen(id, true);
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      qs('.acc-btn', el).focus({ preventScroll: true });
    });
  }

  async copyLink(id, btn) {
    const url = `${location.origin}${location.pathname}#/team/${this.slug}/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      btn.innerHTML = icon.check;
      announce('Link copied');
      setTimeout(() => { btn.innerHTML = icon.link; }, 1500);
    } catch (_) {
      history.replaceState(null, '', `#/team/${this.slug}/${id}`);
    }
  }

  // ----------------------------------------------------------------- search
  buildIndex() {
    this.index.clear();
    this.data.sections.forEach((s) => {
      const text = [s.title, ...(s.blocks || []).map(blockText)].join(' \n ');
      this.index.set(s.id, text.toLowerCase());
    });
  }

  applySearch(raw, { keepOpenState = false } = {}) {
    const q = raw.trim();
    const root = this.root;
    const secs = qsa('.acc', root);
    clearHighlights(qs('#res-sections', root));
    qsa('.blk-wrap.is-dim', root).forEach((w) => w.classList.remove('is-dim'));
    const tocItems = qsa('.res-toc li', root);

    if (!q) {
      const restore = this.preSearchOpen;
      const wasSearching = !!this.query;
      this.preSearchOpen = null;
      this.query = '';
      secs.forEach((el) => { el.hidden = false; });
      if (wasSearching && restore && !keepOpenState) {
        secs.forEach((el) => this.setOpen(el.dataset.id, restore.has(el.dataset.id)));
      }
      tocItems.forEach((li) => { li.hidden = false; });
      qs('.res-empty', root).hidden = true;
      this.updateCount();
      return;
    }

    if (!this.query) this.preSearchOpen = new Set(this.open);
    this.query = q;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let matches = 0;
    secs.forEach((el) => {
      const text = this.index.get(el.dataset.id) || '';
      const hit = terms.every((t) => text.includes(t));
      el.hidden = !hit;
      if (hit) {
        matches += 1;
        this.setOpen(el.dataset.id, true);
        highlight(el, terms);
        // If the title itself doesn't match, fade the blocks that don't either.
        const sec = this.data.sections.find((x) => x.id === el.dataset.id);
        const titleHit = terms.every((t) => (sec?.title || '').toLowerCase().includes(t));
        qsa('.blk-wrap', el).forEach((w) => {
          const b = sec?.blocks.find((x) => x.id === w.dataset.bid);
          const txt = (b ? blockText(b) : '').toLowerCase();
          w.classList.toggle('is-dim', !titleHit && !terms.some((t) => txt.includes(t)));
        });
      }
    });
    tocItems.forEach((li) => { li.hidden = !qs(`.acc[data-id="${CSS.escape(li.dataset.id)}"]:not([hidden])`, root); });
    const empty = qs('.res-empty', root);
    empty.hidden = matches > 0;
    qs('.res-empty-q', root).textContent = q;
    this.updateCount(matches);
    announce(matches ? `${countLabel(matches, 'section')} match ${q}` : `No results for ${q}`);
  }

  unmount() {
    this.ac.abort();
    this.tocObserver?.disconnect();
    this.editor?.destroy();
  }
}

// --- Highlighting -----------------------------------------------------------
function highlight(root, terms) {
  const source = `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
  const pattern = new RegExp(source, 'gi');
  const tester = new RegExp(source, 'i');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || p.closest('mark, script, style, svg, .blk-tools, .acc-count, .sr-only, kbd')) return NodeFilter.FILTER_REJECT;
      return tester.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(pattern).forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) {
        const m = document.createElement('mark');
        m.className = 'hl';
        m.textContent = part;
        frag.appendChild(m);
      } else frag.appendChild(document.createTextNode(part));
    });
    node.parentNode.replaceChild(frag, node);
  });
}

function clearHighlights(root) {
  if (!root) return;
  root.querySelectorAll('mark.hl').forEach((m) => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}
