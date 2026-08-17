/**
 * Password hashing, shared by the auth routes (index.js) and self-service
 * profile edits (profile.js) — one implementation of the pepper+PBKDF2
 * scheme so a future change can't accidentally diverge between the two.
 */

const enc = new TextEncoder();
export const PBKDF2_ITERS = 100000; // Workers' hard ceiling; offset by the pepper below

export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const randB64 = (n) => b64(crypto.getRandomValues(new Uint8Array(n)));

export async function sha256b64(str) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

/**
 * Pepper the password with a server-held secret before stretching it.
 * Without PEPPER (Worker secret) the stored hashes are useless to an attacker
 * who only has the database.
 */
async function peppered(password, env) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.PEPPER || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(password)));
}

export async function pbkdf2(password, saltB64, iters, env) {
  const pre = await peppered(password, env);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(pre), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, 256);
  return b64(bits);
}

/** Constant-time string compare — avoids leaking match position via timing. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a plaintext password against a user's stored hash. */
export async function verifyPassword(env, user, password) {
  if (!user || !user.pw_hash || !user.pw_salt || !password) return false;
  const candidate = await pbkdf2(password, user.pw_salt, user.pw_iters || PBKDF2_ITERS, env);
  return safeEqual(candidate, user.pw_hash);
}
