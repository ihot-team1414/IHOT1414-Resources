// Home page, rendered from content/site.json.
import { esc, qs, qsa, prefersReducedMotion } from '../ui.js';
import { icon, getIllustration, getSubteamIcon } from '../icons.js';
import { initReveal, initParallax, countUp } from '../reveal.js';
import { loadSections } from '../store.js';

const ctaHref = (h) => esc(h || '#/');
const isExternal = (h) => /^https?:\/\//i.test(h || '');
const extAttrs = (h) => (isExternal(h) ? ' target="_blank" rel="noopener noreferrer"' : '');

function nodeDivider() {
  return '<div class="node-divider" aria-hidden="true"><span></span><span class="big"></span><span></span></div>';
}

function hero(h, team) {
  return `
  <section class="hero" id="top" aria-labelledby="hero-title">
    <div class="container hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">${esc(h.eyebrow)}</p>
        <h1 id="hero-title" tabindex="-1">${esc(h.headline)} <span class="accent">${esc(h.headlineAccent)}</span></h1>
        <p class="lead">${esc(h.subheadline)}</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="${ctaHref(h.primaryCta?.href)}"${extAttrs(h.primaryCta?.href)}>${esc(h.primaryCta?.label)} ${icon.arrowRight}</a>
          <a class="btn btn-secondary" href="${ctaHref(h.secondaryCta?.href)}"${extAttrs(h.secondaryCta?.href)}>${esc(h.secondaryCta?.label)}</a>
        </div>
        <div class="hero-meta">
          ${(h.meta || []).map((m) => `<span>${icon[m.icon] || ''}${esc(m.text)}</span>`).join('')}
        </div>
      </div>
      <div class="robot-stage" tabindex="0" role="group" aria-roledescription="3D model viewer"
           aria-label="3D model of the ${esc(team.name)} competition robot. Use the left and right arrow keys to rotate it.">
        <img class="robot-poster" src="assets/robot/robot-poster.webp"
             srcset="assets/robot/robot-poster-sm.webp 800w, assets/robot/robot-poster.webp 1600w"
             sizes="(max-width: 900px) 100vw, 60vw" width="1600" height="1280"
             alt="" fetchpriority="high" decoding="async">
        <span class="robot-hint" aria-hidden="true">${icon.chevronRight}${esc(h.robotHint || 'Drag to rotate')}</span>
      </div>
    </div>
  </section>`;
}

function stats(list) {
  if (!list?.length) return '';
  return `
  <section class="stats" aria-label="Team highlights">
    <div class="container">
      <ul class="stats-grid" role="list" style="list-style:none;margin:0;padding:0">
        ${list.map((s, i) => `
          <li class="stat reveal" style="--reveal-delay:${i * 80}ms">
            <span class="stat-value" data-count>${esc(s.value)}</span>
            <span class="stat-label">${esc(s.label)}</span>
          </li>`).join('')}
      </ul>
    </div>
  </section>`;
}

function subteamsIntro(intro) {
  return `
  <section class="section subteams-intro" id="subteams" aria-labelledby="subteams-title">
    <div class="container">
      <div class="section-head reveal">
        <p class="eyebrow">${esc(intro.eyebrow)}</p>
        <h2 id="subteams-title">${esc(intro.title)}</h2>
        <p class="lead">${esc(intro.text)}</p>
      </div>
      ${nodeDivider()}
    </div>
  </section>`;
}

function subteam(t, i) {
  const num = String(i + 1).padStart(2, '0');
  return `
  <section class="subteam${i % 2 ? ' is-flipped' : ''}" id="team-${esc(t.slug)}" aria-labelledby="st-${esc(t.slug)}">
    <div class="container subteam-inner">
      <div class="subteam-art reveal">
        <span class="subteam-num" aria-hidden="true">${num}</span>
        <div data-parallax="0.08" class="illustration-wrap" style="width:100%;display:grid;place-items:center">${getIllustration(t.slug)}</div>
      </div>
      <div class="subteam-copy reveal" style="--reveal-delay:120ms">
        <p class="eyebrow">${num} · ${esc(t.tagline)}</p>
        <h2 id="st-${esc(t.slug)}">${esc(t.name)}</h2>
        <p class="lead">${esc(t.summary)}</p>
        <ul class="subteam-tags" aria-label="Focus areas">
          ${(t.tags || []).map((tag) => `<li class="tag">${esc(tag)}</li>`).join('')}
        </ul>
        <div class="subteam-actions">
          <a class="btn btn-primary" href="#/team/${esc(t.slug)}">View resources ${icon.arrowRight}</a>
          <span class="count" data-count-for="${esc(t.slug)}"></span>
        </div>
      </div>
    </div>
  </section>`;
}

function about(a) {
  return `
  <section class="section section-alt" id="about" aria-labelledby="about-title">
    <div class="container about-grid">
      <div class="about-copy reveal">
        <p class="eyebrow">${esc(a.eyebrow)}</p>
        <h2 id="about-title" style="font-size:var(--fs-2xl)">${esc(a.title)}</h2>
        ${(a.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      </div>
      <dl class="facts reveal" style="--reveal-delay:120ms">
        ${(a.facts || []).map((f) => `
          <div class="fact">
            <span class="fact-ico" aria-hidden="true">${icon[f.icon] || icon.globe}</span>
            <div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>
          </div>`).join('')}
      </dl>
    </div>
  </section>`;
}

function sponsors(sp) {
  const item = (s) => {
    const inner = s.logo
      ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}" loading="lazy" decoding="async">`
      : esc(s.name);
    return s.url
      ? `<li><a class="sponsor" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${inner}</a></li>`
      : `<li class="sponsor">${inner}</li>`;
  };
  return `
  <section class="section" id="sponsors" aria-labelledby="sponsors-title">
    <div class="container">
      <div class="section-head reveal">
        <p class="eyebrow">${esc(sp.eyebrow)}</p>
        <h2 id="sponsors-title">${esc(sp.title)}</h2>
        <p class="lead">${esc(sp.text)}</p>
      </div>
      <ul class="sponsor-grid reveal">${(sp.items || []).map(item).join('')}</ul>
      ${sp.cta ? `
      <div class="sponsor-cta reveal">
        <p><strong>${esc(sp.cta.title)}</strong>${esc(sp.cta.text)}</p>
        <a class="btn btn-primary" href="${ctaHref(sp.cta.href)}"${extAttrs(sp.cta.href)}>${esc(sp.cta.label)} ${icon.arrowRight}</a>
      </div>` : ''}
    </div>
  </section>`;
}

function join(j, team) {
  const socials = (team.socials || []).filter((s) => ['instagram', 'x', 'github'].includes(s.icon));
  return `
  <section class="section join" id="join" aria-labelledby="join-title">
    <div class="container join-grid">
      <div class="reveal">
        <p class="eyebrow">${esc(j.eyebrow)}</p>
        <h2 id="join-title">${esc(j.title)}</h2>
        <p class="lead" style="margin-bottom:var(--space-6)">${esc(j.text)}</p>
        <ol class="join-steps">
          ${(j.steps || []).map((s) => `<li><div><strong>${esc(s.title)}</strong>${esc(s.text)}</div></li>`).join('')}
        </ol>
      </div>
      <div class="card contact-card reveal" style="--reveal-delay:120ms">
        <h3 style="margin:0">${esc(j.contactTitle)}</h3>
        <p class="muted" style="margin:0">${esc(j.contactText)}</p>
        ${team.email ? `<div class="contact-row">${icon.mail}<a href="mailto:${esc(team.email)}">${esc(team.email)}</a></div>` : ''}
        <div class="contact-row">${icon.pin}<span>${esc(team.school)}, ${esc(team.city)}</span></div>
        ${socials.map((s) => `<div class="contact-row">${icon[s.icon]}<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></div>`).join('')}
        <div class="hero-ctas" style="margin-top:var(--space-2)">
          <a class="btn btn-primary" href="${ctaHref(j.primaryCta?.href)}"${extAttrs(j.primaryCta?.href)}>${esc(j.primaryCta?.label)} ${icon.arrowRight}</a>
          <a class="btn btn-secondary" href="${ctaHref(j.secondaryCta?.href)}"${extAttrs(j.secondaryCta?.href)}>${esc(j.secondaryCta?.label)}</a>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderHome(site) {
  return [
    hero(site.hero, site.team),
    stats(site.stats),
    subteamsIntro(site.subteamsIntro),
    ...(site.subteams || []).map(subteam),
    about(site.about),
    sponsors(site.sponsors),
    join(site.join, site.team),
  ].join('');
}

// --- After render: animations, counts, 3D robot ------------------------------
let robotViewer = null;

export function mountHome(root, site) {
  initReveal(root);
  initParallax(root);

  // Count-up stats once they scroll into view.
  const statEls = qsa('[data-count]', root);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    statEls.forEach((el) => io.observe(el));
  }

  // Resource counts under each "View resources" button.
  (site.subteams || []).forEach(async (t) => {
    try {
      const data = await loadSections(t.slug);
      const n = data.sections?.length || 0;
      const el = qs(`[data-count-for="${t.slug}"]`, root);
      if (el && n) el.textContent = `${n} section${n === 1 ? '' : 's'} of guides & links`;
    } catch (_) { /* counts are optional */ }
  });

  scheduleRobot(qs('.robot-stage', root), qs('.hero', root));
}

export function unmountHome() {
  robotViewer?.dispose();
  robotViewer = null;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (_) { return false; }
}

function scheduleRobot(stage, heroEl) {
  if (!stage || !webglAvailable()) return;
  const conn = navigator.connection || {};
  if (conn.saveData) return;                     // respect data saver: keep the poster
  const small = window.matchMedia('(max-width: 900px)').matches;
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  const src = small || lowMem ? 'assets/robot/robot-lo.glb' : 'assets/robot/robot-hi.glb';

  const start = async () => {
    if (!stage.isConnected) return;
    try {
      const { mountRobot } = await import('../hero3d.js');
      if (!stage.isConnected) return;
      robotViewer = await mountRobot(stage, {
        src,
        reducedMotion: prefersReducedMotion(),
        pixelRatioCap: small ? 1.5 : 2,
        scrollTarget: heroEl,
        onReady: () => stage.classList.add('is-live'),
      });
      const markInteracted = () => stage.classList.add('has-interacted');
      stage.addEventListener('pointerdown', markInteracted, { once: true });
      stage.addEventListener('keydown', markInteracted, { once: true });
    } catch (err) {
      console.warn('3D robot unavailable, keeping the poster image.', err);
    }
  };

  // Wait until the page has loaded and the browser is idle so the 3D view
  // never competes with the first paint.
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}
