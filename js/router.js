// Hash-based router. GitHub Pages only serves real files, so every page lives
// behind "#/..." and refreshes or shared links never 404.
//
//   #/                     home
//   #/subteams | #/about | #/sponsors | #/join   home, scrolled to that section
//   #/team/<slug>          subteam resource page
//   #/team/<slug>/<id>     ...with one section opened and scrolled into view
//   #/login                editor sign-in
//   #/admin                editor & token management (signed-in editors)

const HOME_ANCHORS = new Set(['subteams', 'about', 'sponsors', 'join', 'top']);

export function parseHash(hash = location.hash) {
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart));

  if (parts.length === 0) return { name: 'home', params: {}, query };
  // Old-style in-page anchors (#join) keep working.
  if (parts.length === 1 && HOME_ANCHORS.has(parts[0])) return { name: 'home', params: { anchor: parts[0] }, query };
  if (parts[0] === 'team' && parts[1]) return { name: 'team', params: { slug: parts[1], section: parts[2] || '' }, query };
  if (parts[0] === 'login') return { name: 'login', params: {}, query };
  if (parts[0] === 'admin') return { name: 'admin', params: { tab: parts[1] || '' }, query };
  return { name: 'notfound', params: {}, query };
}

export function href(path) {
  return `#/${path.replace(/^\/+/, '')}`;
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : href(path);
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) location.hash = target;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function onRoute(handler) {
  window.addEventListener('hashchange', () => handler(parseHash()));
}
