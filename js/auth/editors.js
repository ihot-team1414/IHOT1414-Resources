// Reads content/editors.json. Right after an admin adds someone, GitHub Pages
// may not have redeployed yet, so we also check the raw file on GitHub.
import { getJSON } from '../store.js';

export const EDITORS_PATH = 'content/editors.json';

export async function loadEditors(config, { fresh = true } = {}) {
  let doc = null;
  try { doc = await getJSON(EDITORS_PATH, { fresh }); } catch (_) { doc = null; }
  return normalize(doc);
}

export async function loadEditorsFromGitHub(config) {
  const { owner, repo, branch } = config.github;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${EDITORS_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch (_) { return null; }
}

export async function findEditor(config, username) {
  const name = username.trim().toLowerCase();
  const local = await loadEditors(config);
  let entry = local.editors.find((e) => e.username === name);
  if (!entry) {
    const remote = await loadEditorsFromGitHub(config);
    entry = remote?.editors.find((e) => e.username === name) || null;
  }
  return entry;
}

export function normalize(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  return {
    _README: d._README || 'Managed from the site (Editor tools page). Contains no passwords and no plaintext tokens. See ADMIN.md.',
    version: 1,
    editors: Array.isArray(d.editors) ? d.editors : [],
  };
}

export function serialize(doc) {
  return `${JSON.stringify(normalize(doc), null, 2)}\n`;
}
