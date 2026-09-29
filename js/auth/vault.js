// Client-side "vault" for the team's GitHub token. Only WebCrypto primitives.
//
// Each editor entry in content/editors.json holds:
//   - an RSA-OAEP key pair made for that editor. The private key is encrypted
//     with AES-GCM using a key derived from the editor's password (PBKDF2-SHA256,
//     600k iterations by default, random 16-byte salt).
//   - the team's fine-grained GitHub token, encrypted to that editor's public key.
//
// Signing in = derive key from password -> decrypt private key -> decrypt token.
// A wrong password fails AES-GCM authentication, so no password hash is stored.
// Because the token is encrypted to public keys, an admin can rotate the token
// or add editors without knowing anyone else's password.
//
// Limits (also in ADMIN.md): this protects the token from casual readers of the
// public repo. Anyone who knows an editor's password gets the token; a weak
// password can be brute-forced offline. Use long passphrases.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const DEFAULT_ITERATIONS = 600000;
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export function b64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export function checkPasswordStrength(pw) {
  if (!pw || pw.length < 12) return 'Use at least 12 characters. A short phrase of 3–4 random words works well.';
  if (/^(.)\1+$/.test(pw)) return 'That password is too repetitive.';
  const lower = pw.toLowerCase();
  if (['password', 'ihot1414', 'robotics', '123456', 'qwerty'].some((w) => lower.includes(w)) && pw.length < 20) {
    return 'Avoid obvious words like "password", "robotics" or the team number.';
  }
  return '';
}

async function deriveAesKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const RSA = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

async function importPublic(spkiB64) {
  return crypto.subtle.importKey('spki', unb64(spkiB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

async function sealPrivateKey(pkcs8, username, password, iterations) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await deriveAesKey(password, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(username) }, key, pkcs8);
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) },
    privateKey: { alg: 'AES-GCM', iv: b64(iv), data: b64(data) },
  };
}

/** Create a new editor entry. `token` may be null (then the editor can't save until a token is added). */
export async function createEditorEntry({ username, password, token, role = 'editor', iterations = DEFAULT_ITERATIONS }) {
  if (!USERNAME_RE.test(username)) throw new Error('Usernames are 2–32 characters: lowercase letters, numbers, dot, dash or underscore.');
  const pair = await crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const sealed = await sealPrivateKey(pkcs8, username, password, iterations);
  const entry = {
    username,
    role,
    created: new Date().toISOString(),
    ...sealed,
    publicKey: b64(spki),
    token: null,
  };
  if (token) entry.token = await wrapToken(entry, token);
  return entry;
}

/** Encrypt the team token to an editor's public key. */
export async function wrapToken(entry, token) {
  const pub = await importPublic(entry.publicKey);
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, enc.encode(token));
  return { alg: 'RSA-OAEP-256', data: b64(ct), updated: new Date().toISOString() };
}

async function openPrivateKey(entry, password) {
  const { kdf, privateKey } = entry;
  const key = await deriveAesKey(password, unb64(kdf.salt), kdf.iterations);
  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(privateKey.iv), additionalData: enc.encode(entry.username) },
      key,
      unb64(privateKey.data),
    );
  } catch (_) {
    const err = new Error('Incorrect username or password.');
    err.code = 'bad-password';
    throw err;
  }
  return { pkcs8, key: await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']) };
}

/** Sign in: returns the decrypted token (or null if this entry has none yet). */
export async function unlockEntry(entry, password) {
  const { key } = await openPrivateKey(entry, password);
  if (!entry.token) return { token: null };
  try {
    const pt = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, unb64(entry.token.data));
    return { token: dec.decode(pt) };
  } catch (_) {
    return { token: null, tokenError: true };
  }
}

/** Re-encrypt the private key under a new password. */
export async function changeEntryPassword(entry, oldPassword, newPassword, iterations = entry.kdf.iterations) {
  const { pkcs8 } = await openPrivateKey(entry, oldPassword);
  const sealed = await sealPrivateKey(pkcs8, entry.username, newPassword, iterations);
  return { ...entry, ...sealed, passwordChanged: new Date().toISOString() };
}
