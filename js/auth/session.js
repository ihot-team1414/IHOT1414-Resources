// Holds the signed-in editor for this browser tab.
// The decrypted GitHub token lives in sessionStorage: it disappears when the
// tab closes and is never written to the repo. See ADMIN.md for the limits.

const KEY = 'ihot.session.v1';
let current = null;
const listeners = new Set();

try {
  const raw = sessionStorage.getItem(KEY);
  if (raw) current = JSON.parse(raw);
} catch (_) { current = null; }

export function getSession() {
  return current;
}

export function isEditor() {
  return !!current;
}

export function canSave() {
  return !!(current && current.token);
}

export function setSession(session) {
  current = session;
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch (_) { /* private mode: keep it in memory only */ }
  listeners.forEach((fn) => fn(current));
}

export function signOut() {
  setSession(null);
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
