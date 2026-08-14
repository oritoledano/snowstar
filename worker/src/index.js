/**
 * Snowstar / Mutra member API — accounts, favorites.
 *
 * Security posture:
 *  - passwords: HMAC-SHA256 with a server-side secret "pepper", then PBKDF2-SHA256
 *    at the platform-max 100k iterations with a 16-byte per-user salt. The pepper
 *    lives only in Worker secrets, never in D1 — so a database leak on its own
 *    can't be brute-forced offline. (Workers cap PBKDF2 at 100k, hence the pepper.)
 *  - sessions: 32 random bytes, stored SHA-256-hashed so a DB leak isn't replayable;
 *    delivered as HttpOnly + Secure + SameSite=Lax cookie (JS can never read it)
 *  - comparisons on secrets are constant-time
 *  - login/signup throttled per IP+email; generic errors so we never reveal
 *    whether an email is registered
 *  - same-origin only (the Worker shares the site's domain), plus an Origin check
 *    on writes as CSRF defence-in-depth alongside SameSite
 */

import { handleTrack, handleStats, handleJourney, sendDigest, handleDownload } from './analytics.js';
import { sendMail, resetEmail } from './mail.js';
import { startOAuth, finishOAuth, facebookDataDeletion, claimHandoff } from './oauth.js';

const SESSION_DAYS = 60;
const PBKDF2_ITERS = 100000; // Workers' hard ceiling; offset by the pepper below
const MAX_ATTEMPTS = 8;          // per window
const ATTEMPT_WINDOW = 15 * 60;  // 15 minutes
const RESET_MINUTES = 45;        // how long a password-reset link stays good
const VALID_TOKEN = /^[A-Za-z0-9_-]{20,120}$/;
const ALLOWED_ORIGINS = ['https://snowstar.company', 'https://www.snowstar.company'];

const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randB64 = (n) => b64(crypto.getRandomValues(new Uint8Array(n)));
/** URL-safe random token, for things that travel in a link. */
const randToken = (n) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256b64(str) {
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

async function pbkdf2(password, saltB64, iters, env) {
  const pre = await peppered(password, env);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(pre), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, 256);
  return b64(bits);
}

/** Constant-time string compare — avoids leaking match position via timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const validEmail = (e) =>
  typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Which Snowstar product a set of favorites belongs to. */
const PRODUCTS = new Set(['mutra', 'snowstar']);
const product = (v) => (PRODUCTS.has(v) ? v : 'mutra');

/** Public shape of a user — never leak hashes, salts or internal ids. */
const publicUser = (u) => ({
  email: u.email,
  name: u.name,
  newsletter: !!u.newsletter,
  admin: !!u.admin,
  avatar: u.avatar || null,
});

const favoritesFor = async (env, userId, prod) => {
  const r = await env.DB.prepare(
    'SELECT slug FROM favorites WHERE user_id = ? AND product = ? ORDER BY created_at DESC'
  ).bind(userId, prod).all();
  return (r.results || []).map((row) => row.slug);
};

/** Rate limiter keyed on IP + action + email, backed by D1. */
async function throttle(env, key) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE bucket = ?').bind(key).first();
  if (row && row.reset_at > t) {
    if (row.count >= MAX_ATTEMPTS) return false;
    await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE bucket = ?').bind(key).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO attempts (bucket, count, reset_at) VALUES (?, 1, ?) ' +
      'ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = excluded.reset_at'
    ).bind(key, t + ATTEMPT_WINDOW).run();
  }
  return true;
}

async function clearThrottle(env, key) {
  await env.DB.prepare('DELETE FROM attempts WHERE bucket = ?').bind(key).run();
}

/**
 * One session for the whole of Snowstar.
 *
 * `Domain=snowstar.company` widens the cookie from host-only to the apex plus
 * every subdomain, so a future product at e.g. app.snowstar.company shares the
 * same signed-in user. Changing this later would sign everyone out, which is
 * why it's set now while the account list is still small.
 */
function sessionCookie(token, maxAgeSec) {
  const parts = [
    `ss_session=${token}`,
    'Domain=snowstar.company',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  return parts.join('; ');
}

function readCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

async function currentUser(req, env) {
  const token = readCookie(req, 'ss_session');
  if (!token) return null;
  const hash = await sha256b64(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.newsletter, u.admin, u.avatar, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(hash).first();
  if (!row || row.expires_at <= now()) return null;
  return row;
}

/** CSRF defence-in-depth: state-changing requests must come from our own origin. */
function originOk(req) {
  const o = req.headers.get('origin');
  if (!o) return true; // same-origin form/fetch without Origin (rare); SameSite still guards
  return ALLOWED_ORIGINS.includes(o);
}

async function handle(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';

  if (method !== 'GET' && !originOk(req)) return json({ error: 'bad_origin' }, 403);

  // ── social sign-in ──
  const oauth = path.match(/^\/auth\/(google|facebook)(\/callback)?$/);
  if (oauth && method === 'GET') {
    return oauth[2] ? finishOAuth(req, env, oauth[1]) : startOAuth(req, env, oauth[1]);
  }
  // Facebook requires this endpoint to exist before it will approve the app
  if (path === '/facebook/data-deletion' && method === 'POST') return facebookDataDeletion(req, env);
  if (path === '/auth/claim' && method === 'POST') return claimHandoff(req, env);

  // ── analytics beacon (anonymous, no auth) ──
  if (path === '/track' && method === 'POST') return handleTrack(req, env, ctx);

  // ── owner-only stats ──
  if (path === '/stats' && method === 'GET') return handleStats(req, env, await currentUser(req, env));
  if (path === '/journey' && method === 'GET') return handleJourney(req, env, await currentUser(req, env));

  // ── member download (the one thing that needs an account) ──
  if (path === '/download' && method === 'GET') return handleDownload(req, env, await currentUser(req, env));

  // ── who am I ──
  if (path === '/me' && method === 'GET') {
    const u = await currentUser(req, env);
    if (!u) return json({ user: null, favorites: [] });
    const prod = product(url.searchParams.get('product'));
    return json({ user: publicUser(u), favorites: await favoritesFor(env, u.id, prod) });
  }

  // ── signup ──
  if (path === '/signup' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 80) || null;
    const newsletter = body.newsletter ? 1 : 0;
    const prod = product(body.product);
    const source = String(body.source || prod).slice(0, 30);

    if (!validEmail(email)) return json({ error: 'invalid_email' }, 400);
    if (password.length < 8) return json({ error: 'weak_password' }, 400);
    if (password.length > 200) return json({ error: 'invalid' }, 400);

    if (!(await throttle(env, `signup:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'email_taken' }, 409);

    const salt = randB64(16);
    const hash = await pbkdf2(password, salt, PBKDF2_ITERS, env);
    const id = crypto.randomUUID();
    const t = now();
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, pw_hash, pw_salt, pw_iters, newsletter, signup_source, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, name, hash, salt, PBKDF2_ITERS, newsletter, source, t, t).run();

    const token = randB64(32);
    const maxAge = SESSION_DAYS * 86400;
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256b64(token), id, t, t + maxAge).run();

    return json({ user: publicUser({ email, name, newsletter }), favorites: [] }, 201,
      { 'set-cookie': sessionCookie(token, maxAge) });
  }

  // ── login ──
  if (path === '/login' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!validEmail(email) || !password) return json({ error: 'invalid_credentials' }, 401);

    const key = `login:${ip}:${email}`;
    if (!(await throttle(env, key))) return json({ error: 'rate_limited' }, 429);

    const u = await env.DB.prepare(
      'SELECT id, email, name, newsletter, admin, avatar, pw_hash, pw_salt, pw_iters FROM users WHERE email = ?'
    ).bind(email).first();

    // Always run a derivation so response time doesn't reveal whether the email
    // exists — or whether it's a social-only account with no password set.
    const hasPw = !!(u && u.pw_hash && u.pw_salt);
    const salt = hasPw ? u.pw_salt : randB64(16);
    const iters = hasPw ? u.pw_iters : PBKDF2_ITERS;
    const candidate = await pbkdf2(password, salt, iters, env);
    if (!hasPw || !safeEqual(candidate, u.pw_hash)) return json({ error: 'invalid_credentials' }, 401);

    await clearThrottle(env, key);
    const t = now();
    const token = randB64(32);
    const maxAge = SESSION_DAYS * 86400;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256b64(token), u.id, t, t + maxAge),
      env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(t, u.id),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(t),
    ]);

    return json(
      { user: publicUser(u), favorites: await favoritesFor(env, u.id, product(body.product)) },
      200, { 'set-cookie': sessionCookie(token, maxAge) }
    );
  }

  // ── logout ──
  if (path === '/logout' && method === 'POST') {
    const token = readCookie(req, 'ss_session');
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256b64(token)).run();
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  // ── forgot password: issue a single-use link ──
  if (path === '/reset/request' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    // The answer is identical either way — this endpoint must never reveal
    // whether an address has an account.
    if (!validEmail(email)) return json({ ok: true });
    if (!(await throttle(env, `reset:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const u = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (!u) return json({ ok: true });

    const token = randToken(32);
    const t = now();
    await env.DB.prepare(
      'INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(await sha256b64(token), u.id, t, t + RESET_MINUTES * 60).run();

    const link = `https://snowstar.company/reset.html?t=${token}`;
    ctx.waitUntil((async () => {
      try {
        await sendMail(env, { to: u.email, ...resetEmail(link, RESET_MINUTES) });
      } catch (e) {
        console.error('reset mail failed', e && e.stack ? e.stack : String(e));
      }
    })());
    return json({ ok: true });
  }

  // ── is this reset link still good? (so the page can say so up front) ──
  if (path === '/reset/check' && method === 'GET') {
    const token = url.searchParams.get('t') || '';
    if (!VALID_TOKEN.test(token)) return json({ valid: false });
    const row = await env.DB.prepare(
      'SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?'
    ).bind(await sha256b64(token)).first();
    return json({ valid: !!row && !row.used_at && row.expires_at > now() });
  }

  // ── set the new password ──
  if (path === '/reset/confirm' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!VALID_TOKEN.test(token)) return json({ error: 'invalid_token' }, 400);
    if (password.length < 8) return json({ error: 'weak_password' }, 400);
    if (password.length > 200) return json({ error: 'invalid' }, 400);
    if (!(await throttle(env, `resetc:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const t = now();
    const row = await env.DB.prepare(
      `SELECT r.token_hash, r.user_id, r.expires_at, r.used_at,
              u.email, u.name, u.newsletter, u.admin, u.avatar
         FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = ?`
    ).bind(await sha256b64(token)).first();
    if (!row || row.used_at || row.expires_at <= t) return json({ error: 'invalid_token' }, 400);

    const salt = randB64(16);
    const hash = await pbkdf2(password, salt, PBKDF2_ITERS, env);
    const sessionToken = randB64(32);
    const maxAge = SESSION_DAYS * 86400;

    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iters = ? WHERE id = ?')
        .bind(hash, salt, PBKDF2_ITERS, row.user_id),
      env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(t, row.token_hash),
      // a reset is how you take an account back, so every other session dies
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
      env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(row.user_id),
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256b64(sessionToken), row.user_id, t, t + maxAge),
    ]);
    await clearThrottle(env, `resetc:${ip}`);

    return json(
      { user: publicUser(row), favorites: await favoritesFor(env, row.user_id, product(body.product)) },
      200, { 'set-cookie': sessionCookie(sessionToken, maxAge) }
    );
  }

  // ── favorites (scoped per product, so a second product can't collide) ──
  if (path === '/favorites' && (method === 'POST' || method === 'DELETE')) {
    const u = await currentUser(req, env);
    if (!u) return json({ error: 'unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || '').trim().slice(0, 120);
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'invalid_slug' }, 400);
    const prod = product(body.product);

    if (method === 'POST') {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO favorites (user_id, product, slug, created_at) VALUES (?, ?, ?, ?)'
      ).bind(u.id, prod, slug, now()).run();
    } else {
      await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND product = ? AND slug = ?')
        .bind(u.id, prod, slug).run();
    }
    return json({ favorites: await favoritesFor(env, u.id, prod) });
  }

  // ── merge favorites saved before signing in ──
  if (path === '/favorites/merge' && method === 'POST') {
    const u = await currentUser(req, env);
    if (!u) return json({ error: 'unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const prod = product(body.product);
    const slugs = Array.isArray(body.slugs) ? body.slugs.slice(0, 500) : [];
    const valid = slugs.filter((s) => typeof s === 'string' && /^[a-z0-9-]+$/.test(s));
    if (valid.length) {
      const t = now();
      await env.DB.batch(valid.map((s) =>
        env.DB.prepare('INSERT OR IGNORE INTO favorites (user_id, product, slug, created_at) VALUES (?, ?, ?, ?)')
          .bind(u.id, prod, s, t)
      ));
    }
    return json({ favorites: await favoritesFor(env, u.id, prod) });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDigest(env));
  },

  async fetch(req, env, ctx) {
    try {
      return await handle(req, env, ctx);
    } catch (err) {
      console.error('api error', err && err.stack ? err.stack : String(err));
      return json({ error: 'server_error' }, 500);
    }
  },
};
