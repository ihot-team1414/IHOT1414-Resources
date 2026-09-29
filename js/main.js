// Entry point: loads content, sets up the nav/footer and routes between pages.
import { loadSite, loadConfig } from './store.js';
import { parseHash, onRoute } from './router.js';
import { initNav, updateNav } from './nav.js';
import { renderFooter } from './footer.js';
import { renderHome, mountHome, unmountHome } from './pages/home.js';
import { esc, prefersReducedMotion } from './ui.js';

const app = document.getElementById('app');
const state = { site: null, config: null, page: null, lastHash: location.hash, first: true };

// Pages with unsaved work (the editor) register a guard here.
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = fn; }
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard && leaveGuard.dirty?.()) { e.preventDefault(); e.returnValue = ''; }
});

export const getState = () => state;

function setTitle(part) {
  const base = state.site?.seo?.title || 'IHOT Robotics | FRC Team 1414';
  document.title = part ? `${part} | IHOT 1414` : base;
}

function scrollToAnchor(anchor, smooth = true) {
  const target = anchor === 'top' ? document.body : document.getElementById(anchor);
  if (!target) return;
  const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
  if (anchor === 'top') window.scrollTo({ top: 0, behavior });
  else target.scrollIntoView({ behavior, block: 'start' });
}

function focusHeading() {
  // On the very first page load keep focus where the browser put it.
  if (state.first) { state.first = false; return; }
  const h = app.querySelector('h1');
  if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  else app.focus({ preventScroll: true });
}

async function unmountCurrent() {
  if (state.page?.unmount) await state.page.unmount();
  if (state.page?.name === 'home') unmountHome();
  state.page = null;
  setLeaveGuard(null);
}

async function route(r) {
  // Guard: leaving an editor with unsaved changes.
  if (leaveGuard && leaveGuard.dirty?.() && !leaveGuard.sameRoute?.(r)) {
    const ok = await leaveGuard.confirm();
    if (!ok) { history.replaceState(null, '', state.lastHash || '#/'); return; }
  }
  state.prevHash = state.lastHash;
  state.lastHash = location.hash;
  updateNav(r);

  if (r.name === 'home') {
    const fresh = state.page?.name !== 'home';
    if (fresh) {
      await unmountCurrent();
      app.innerHTML = renderHome(state.site);
      mountHome(app, state.site);
      state.page = { name: 'home' };
      setTitle('');
    }
    if (r.params.anchor) {
      requestAnimationFrame(() => scrollToAnchor(r.params.anchor, !fresh));
      if (fresh) focusHeading();
    } else if (fresh) {
      window.scrollTo(0, 0);
      focusHeading();
    } else {
      scrollToAnchor('top');
    }
    return;
  }

  if (r.name === 'team') {
    const team = (state.site.subteams || []).find((t) => t.slug === r.params.slug);
    if (!team) return notFound();
    if (state.page?.name === 'team' && state.page.slug === team.slug) {
      state.page.openSection?.(r.params.section);
      return;
    }
    await unmountCurrent();
    app.innerHTML = '<div class="page-loading"><span class="spinner" aria-hidden="true"></span></div>';
    const mod = await import('./pages/team.js');
    window.scrollTo(0, 0);
    state.page = await mod.mountTeamPage(app, { site: state.site, config: state.config, team, sectionId: r.params.section, setLeaveGuard });
    setTitle(`${team.name} resources`);
    focusHeading();
    return;
  }

  if (r.name === 'login' || r.name === 'admin') {
    await unmountCurrent();
    const mod = await import('./pages/account.js');
    window.scrollTo(0, 0);
    state.page = await mod.mountAccountPage(app, { site: state.site, config: state.config, view: r.name, tab: r.params.tab, query: r.query, from: state.prevHash });
    setTitle(r.name === 'login' ? 'Editor login' : 'Editor tools');
    focusHeading();
    return;
  }

  notFound();
}

async function notFound() {
  await unmountCurrent();
  app.innerHTML = `
    <section class="section" style="padding-top:calc(var(--nav-h) + var(--space-8))">
      <div class="container">
        <p class="eyebrow">404</p>
        <h1>That page isn't on the robot.</h1>
        <p class="lead">The link may be out of date. Head back home or pick a subteam from the menu.</p>
        <a class="btn btn-primary" href="#/">Back to home</a>
      </div>
    </section>`;
  state.page = { name: 'notfound' };
  setTitle('Page not found');
  focusHeading();
}

async function boot() {
  try {
    [state.site, state.config] = await Promise.all([loadSite(), loadConfig()]);
  } catch (err) {
    app.innerHTML = `<div class="container" style="padding:9rem 1rem"><h1>Something went wrong</h1><p class="lead">The site content could not be loaded (${esc(err.message)}). Please refresh.</p></div>`;
    return;
  }
  if (prefersReducedMotion()) document.documentElement.classList.add('reduced-motion');
  initNav(state.site);
  renderFooter(state.site);
  onRoute(route);
  route(parseHash());
}

boot();
