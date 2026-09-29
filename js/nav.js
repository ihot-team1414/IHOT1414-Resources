// Navigation bar: transparent at the top, fading into blurred navy glass on scroll.
// One page-selector button works as a dropdown on desktop and a full-screen
// sheet (hamburger) on mobile. Fully keyboard operable.

import { icon, getSubteamIcon } from './icons.js';
import { esc, qs, qsa } from './ui.js';
import { getSession, onSessionChange, signOut } from './auth/session.js';
import { navigate } from './router.js';

let site;
let menu, toggle, panel, badge, currentLabel;
let currentRoute = { name: 'home', params: {} };

export function initNav(siteData) {
  site = siteData;
  const nav = qs('.site-nav');
  menu = qs('.nav-menu', nav);
  toggle = qs('.nav-toggle', nav);
  panel = qs('.nav-panel', nav);
  badge = qs('.nav-edit-badge', nav);
  currentLabel = qs('.nav-toggle-text', nav);

  buildPanel();
  onSessionChange(() => { buildPanel(); updateNav(currentRoute); });

  toggle.addEventListener('click', () => setOpen(menu.dataset.open !== 'true'));
  document.addEventListener('click', (e) => {
    if (menu.dataset.open === 'true' && !menu.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('keydown', onKey);
  menu.addEventListener('focusout', (e) => {
    if (menu.dataset.open === 'true' && e.relatedTarget && !menu.contains(e.relatedTarget)) setOpen(false, false);
  });
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a, button[data-action]');
    if (!a) return;
    if (a.dataset.action === 'signout') {
      signOut();
      navigate('/', {});
    }
    setOpen(false, false);
  });

  // Scroll state -> glass background.
  const onScroll = () => { nav.dataset.scrolled = window.scrollY > 12 ? 'true' : 'false'; };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function buildPanel() {
  const session = getSession();
  const teams = site.subteams || [];
  panel.innerHTML = `
    <ul>
      <li><a class="nav-link" href="#/" data-route="home"><span class="nav-ico">${icon.robot}</span>Home</a></li>
    </ul>
    <div class="nav-group-label" id="nav-group-teams">Subteam resources</div>
    <ul aria-labelledby="nav-group-teams">
      ${teams.map((t) => `
        <li><a class="nav-link" href="#/team/${esc(t.slug)}" data-route="team:${esc(t.slug)}">
          <span class="nav-ico">${getSubteamIcon(t.slug)}</span>${esc(t.name)}</a></li>`).join('')}
    </ul>
    <div class="nav-sep" role="separator"></div>
    <ul>
      ${session
        ? `<li><a class="nav-link" href="#/admin" data-route="admin"><span class="nav-ico">${icon.users}</span>Editor tools</a></li>
           <li><button class="nav-link" type="button" data-action="signout" style="width:100%;border:0;background:none;text-align:left"><span class="nav-ico">${icon.logout}</span>Sign out (${esc(session.username)})</button></li>`
        : `<li><a class="nav-link" href="#/login" data-route="login"><span class="nav-ico">${icon.lock}</span>Login / Editor</a></li>`}
    </ul>`;
  if (badge) {
    badge.hidden = !session;
    badge.innerHTML = session ? `Editing<span class="badge-name">&nbsp;as ${esc(session.username)}</span>` : '';
  }
}

function setOpen(open, focusFirst = true) {
  menu.dataset.open = open ? 'true' : 'false';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  qs('.site-nav').dataset.open = open ? 'true' : 'false';
  document.body.classList.toggle('menu-open', open);
  if (open && focusFirst) {
    const active = qs('.nav-link[aria-current="page"]', panel) || qs('.nav-link', panel);
    requestAnimationFrame(() => active?.focus());
  }
  if (!open && menu.contains(document.activeElement) && document.activeElement !== toggle) {
    toggle.focus();
  }
}

function onKey(e) {
  const open = menu.dataset.open === 'true';
  const links = qsa('.nav-link', panel);
  const idx = links.indexOf(document.activeElement);
  switch (e.key) {
    case 'Escape':
      if (open) { e.preventDefault(); setOpen(false); toggle.focus(); }
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (!open) { setOpen(true); break; }
      links[(idx + 1) % links.length]?.focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (!open) { setOpen(true); break; }
      links[(idx - 1 + links.length) % links.length]?.focus();
      break;
    case 'Home':
      if (open) { e.preventDefault(); links[0]?.focus(); }
      break;
    case 'End':
      if (open) { e.preventDefault(); links[links.length - 1]?.focus(); }
      break;
    default:
  }
}

export function updateNav(route) {
  currentRoute = route;
  let key = route.name;
  let label = 'Home';
  if (route.name === 'team') {
    key = `team:${route.params.slug}`;
    label = (site.subteams || []).find((t) => t.slug === route.params.slug)?.name || 'Resources';
  } else if (route.name === 'login') label = 'Login';
  else if (route.name === 'admin') label = 'Editor tools';
  qsa('.nav-link', panel).forEach((a) => {
    if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (currentLabel) currentLabel.innerHTML = `<span class="nav-current-label">Page:</span> ${esc(label)}`;
  setOpen(false, false);
}
