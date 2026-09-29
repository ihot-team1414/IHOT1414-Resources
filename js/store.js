// Loads site configuration and content JSON from the repo (same origin).
// GitHub Pages caches files for ~10 minutes; a per-minute query string keeps
// visitors close to the latest commit without hammering the server.

const cache = new Map();

function bust() {
  return Math.floor(Date.now() / 60000).toString(36);
}

export async function getJSON(path, { fresh = false } = {}) {
  const key = path;
  if (!fresh && cache.has(key)) return cache.get(key);
  const url = new URL(path, document.baseURI);
  url.searchParams.set('v', bust());
  const p = fetch(url, { cache: 'no-cache' }).then(async (res) => {
    if (!res.ok) {
      const err = new Error(`Could not load ${path} (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export function setCached(path, data) {
  cache.set(path, Promise.resolve(data));
}

export const loadConfig = () => getJSON('config.json');
export const loadSite = () => getJSON('content/site.json');

export const sectionsPath = (slug) => `content/${slug}/sections.json`;
export const filesDir = (slug) => `content/${slug}/files`;

export async function loadSections(slug, opts) {
  try {
    return await getJSON(sectionsPath(slug), opts);
  } catch (err) {
    if (err.status === 404) return { version: 1, subteam: slug, sections: [] };
    throw err;
  }
}
