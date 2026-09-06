/**
 * StreamDAW — sell the app, deliver the installer.
 *
 * Snowstar's first software product, and the first thing sold on a basis other
 * than a per-track music licence. It reuses the site-wide account (one login
 * for Mutra + StreamDAW + whatever's next) but keeps its own "what you own" in
 * `entitlements` (see schema-streamdaw.sql), because a music licence and an app
 * entitlement are different shapes.
 *
 * Payments go through HYP — the SAME gateway and terminal Mutra uses — so no new
 * processor, and the money stays on the Israeli books. HYP has NO webhook: the
 * only completion signal is the buyer's browser landing on /api/hyp/return,
 * which hyp.js verifies against HYP's own servers and then dispatches here by
 * the SD- reference prefix. Nothing is granted on the redirect's word alone.
 *
 * COUPONS live in their OWN table (streamdaw_coupons), deliberately separate
 * from Mutra's `coupons` so a software code can never free a music licence and
 * vice-versa. Only the pure discount MATH is shared from coupons.js. A code that
 * takes the price to zero is granted straight away — a card gateway refuses a
 * zero authorisation, so there is nothing to send to HYP.
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { sha256b64, randB64 } from './crypto.js';
import { parseHyp, verifyReturn } from './hyp.js';
import { applyCoupon, couponProblem, normCode } from './coupons.js';

const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const SITE = 'https://snowstar.company';
const PRODUCT = 'streamdaw';
const ASSET = 'streamdaw-macos';
const TOKEN_TTL = 7 * 24 * 3600;         // emailed download link good for 7 days

// Price in agorot INCL VAT — HYP charges shekels, so StreamDAW is priced in ₪.
// ₪249 ≈ $69. Change here and on the buy page together.
const PRICE_GROSS = 24900;

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const lc = (e) => (e || '').trim().toLowerCase();
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const urlToken = (n = 32) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hypConfigured = (env) => !!(env.HYP_TERMINAL && env.HYP_API_KEY && env.HYP_PASSP);

// ── presence tokens (listener identity for the relay) ───────────────────────
// A signed-in listener exchanges their Snowstar session for a short-lived
// HMAC-signed token {name, sub, exp}. The relay (a separate Node process) shares
// PRESENCE_SECRET and verifies it, so it can trust the listener's name without
// touching the account DB. The player is on stream.snowstar.company (a different
// origin), so this endpoint is the ONLY one that needs CORS + credentials.
const PRESENCE_ORIGINS = ['https://stream.snowstar.company', 'http://localhost:8787', 'http://127.0.0.1:8787'];
function presenceCors(origin) {
  const allow = PRESENCE_ORIGINS.includes(origin) ? origin : PRESENCE_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}
function b64urlBytes(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signPresence(secret, payload) {
  const enc = new TextEncoder();
  const body = b64urlBytes(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return body + '.' + b64urlBytes(sig);
}

/** POST /streamdaw/presence-token — signed-in listener → short-lived HMAC token
 *  the relay verifies to trust the listener's name. CORS + credentials for the
 *  stream.snowstar.company player. */
export async function streamdawPresenceToken(req, env) {
  const cors = presenceCors(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.PRESENCE_SECRET) return json({ error: 'presence not configured' }, 501, cors);
  const user = await currentUser(req, env);
  if (!user) return json({ error: 'sign in required' }, 401, cors);
  const name = ((user.name && user.name.trim()) || lc(user.email).split('@')[0] || 'Listener').slice(0, 40);
  const token = await signPresence(env.PRESENCE_SECRET, { name, sub: String(user.id), exp: now() + 300 });
  return json({ token, name }, 200, cors);
}

// ── coupons (streamdaw_coupons table; math reused from coupons.js) ──────────
function findSdawCoupon(env, code) {
  const c = normCode(code);
  if (!c) return Promise.resolve(null);
  return env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note
       FROM streamdaw_coupons WHERE code = ?`
  ).bind(c).first().catch(() => null);
}
function burnSdawCoupon(env, code) {
  const c = normCode(code);
  if (!c) return Promise.resolve();
  return env.DB.prepare('UPDATE streamdaw_coupons SET used = used + 1 WHERE code = ?').bind(c).run().catch(() => null);
}

/** POST /streamdaw/coupon/check — { code } → what it does to the price. Public,
 *  so the buy page can show the discounted total before anyone commits. */
export async function streamdawCouponCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const c = await findSdawCoupon(env, b.code);
  const problem = couponProblem(c, PRICE_GROSS);
  if (problem) return json({ ok: false, reason: problem });
  const { amount: after, off } = applyCoupon(PRICE_GROSS, c);
  return json({
    ok: true, code: c.code, kind: c.kind, value: c.value, off,
    amount: after, free: after <= 0,
    label: c.kind === 'percent' ? `${c.value}% off` : `₪${(c.value / 100).toFixed(0)} off`,
  });
}

/** POST /streamdaw/coupon — owner creates a code. Admin only. */
export async function streamdawCouponCreate(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.remove) { await env.DB.prepare('DELETE FROM streamdaw_coupons WHERE id = ?').bind(Number(b.remove)).run(); return json({ ok: true }); }
  if (b.toggle) { await env.DB.prepare('UPDATE streamdaw_coupons SET active = 1 - active WHERE id = ?').bind(Number(b.toggle)).run(); return json({ ok: true }); }

  const kind = b.kind === 'amount' ? 'amount' : 'percent';
  let value = Math.round(Number(b.value));
  if (!Number.isFinite(value) || value <= 0) return json({ error: 'bad_value' }, 400);
  if (kind === 'percent' && value > 100) return json({ error: 'percent_over_100' }, 400);
  if (kind === 'amount') value = value * 100;                 // shekels in, agorot stored

  const code = normCode(b.code) || ('SDAW-' + urlToken(6).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  const exists = await env.DB.prepare('SELECT 1 FROM streamdaw_coupons WHERE code = ?').bind(code).first().catch(() => null);
  if (exists) return json({ error: 'code_taken', code }, 409);
  await env.DB.prepare(
    `INSERT INTO streamdaw_coupons (code, kind, value, min_amount, max_uses, used, expires_at, active, note, created_at)
     VALUES (?, ?, ?, 0, ?, 0, ?, 1, ?, ?)`
  ).bind(code, kind, value, Math.max(0, Math.round(Number(b.max_uses) || 0)),
         Number(b.expires_at) || null, String(b.note || '').slice(0, 200), now()).run();
  return json({ ok: true, code, kind, value });
}

// ── 1. Checkout: apply any coupon, then free-grant or send to HYP ───────────
export async function streamdawCheckout(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  const body = await req.json().catch(() => ({}));
  const email = lc(user?.email || body.email);
  if (!validEmail(email)) return json({ error: 'email_required' }, 400);

  // Coupon (optional). Invalid code entered → tell them, don't silently charge full.
  let amount = PRICE_GROSS, couponCode = null;
  if (body.coupon && String(body.coupon).trim()) {
    const c = await findSdawCoupon(env, body.coupon);
    const problem = couponProblem(c, PRICE_GROSS);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ amount } = applyCoupon(PRICE_GROSS, c));
    couponCode = c.code;
  }

  const ref = 'SD-' + urlToken(9).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10).padEnd(6, 'X');

  // ── free (a coupon covered the whole price): grant now, no HYP ──
  if (amount <= 0) {
    if (!hypConfigured(env)) { /* free path needs no gateway, continue */ }
    await env.DB.prepare(
      `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, created_at)
       VALUES (?, ?, ?, 'lifetime', 0, 'ILS', 'granted', ?, ?)`
    ).bind(ref, user?.id || null, email, couponCode, now()).run();
    const ent = await grantEntitlement(env, { email, ext_ref: ref, amount: 0, plan: 'lifetime', source: 'coupon' });
    if (couponCode) await burnSdawCoupon(env, couponCode);
    const link = await mintDownloadLink(env, ent.id, email);
    await emailReceipt(env, email, link).catch(() => {});
    await env.DB.prepare('UPDATE streamdaw_orders SET entitlement_id = ?, settled_at = ? WHERE ref = ?')
      .bind(ent.id, now(), ref).run().catch(() => {});
    return json({ ok: true, free: true, ref, download: link, redirect: `${SITE}/apps/streamdaw.html?bought=1&free=1` });
  }

  // ── paid (full price, or partially discounted): send to HYP ──
  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  const shekels = (amount / 100).toFixed(2);
  await env.DB.prepare(
    `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, created_at)
     VALUES (?, ?, ?, 'lifetime', ?, 'ILS', 'started', ?, ?)`
  ).bind(ref, user?.id || null, email, amount, couponCode, now()).run();

  // APISign — mirrors the music checkout's signing, including the gotchas the
  // comments in hyp.js were written in blood for: signMe=1, and using HYP's
  // response VERBATIM as the pay URL.
  const p = new URLSearchParams({
    action: 'APISign', What: 'SIGN',
    Masof: env.HYP_TERMINAL, KEY: env.HYP_API_KEY, PassP: env.HYP_PASSP,
    Amount: shekels, Coin: '1',
    Info: `StreamDAW ${ref}`, Order: ref,
    UTF8: 'True', UTF8out: 'True', signMe: '1', MoreData: 'True',
    PageLang: 'ENG', tmp: '1', ClientName: email, email,
    SendHesh: 'True', Postpone: 'False', J5: 'False',
  });
  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);
  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, amount_gross: amount });
}

// ── 2. The verified return (dispatched from hyp.js by the SD- prefix) ───────
export async function streamdawReturn(req, env, raw, q) {
  const ref = String(q.Order || '');
  const fail = (why) => Response.redirect(`${SITE}/apps/streamdaw.html?pay=failed&reason=${encodeURIComponent(why)}`, 302);

  if (q.CCode !== '0') {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='declined' WHERE ref=?`).bind(ref).run().catch(() => {});
    return fail('declined');
  }
  const v = await verifyReturn(env, raw);
  const order = await env.DB.prepare(`SELECT * FROM streamdaw_orders WHERE ref=?`).bind(ref).first();
  if (!order) return fail('unknown_ref');
  if (order.status === 'granted') return Response.redirect(`${SITE}/apps/streamdaw.html?bought=1&ref=${encodeURIComponent(ref)}`, 302);

  if (!v.ok) {
    const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
    const looksCharged = /^[0-9]{4,}$/.test(String(q.ACode || '')) && paid === order.amount;
    if (looksCharged) {
      await env.DB.prepare(`UPDATE streamdaw_orders SET status='charged_unverified', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'StreamDAW: card charged but not verified',
        text: `Order ${ref}: HYP Id ${q.Id || ''}, auth ${q.ACode || ''}, ${q.Amount || ''} ILS.\nCharged but VERIFY did not confirm — entitlement NOT granted automatically. Reconcile in HYP.` }).catch(() => {});
      return Response.redirect(`${SITE}/apps/streamdaw.html?pay=confirming&ref=${encodeURIComponent(ref)}`, 302);
    }
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='verify_failed', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
    return fail('unverified');
  }

  const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
  if (paid !== order.amount) return fail('amount_mismatch');
  if (q.Coin && q.Coin !== '1') return fail('bad_currency');

  const ent = await grantEntitlement(env, { email: order.email, ext_ref: ref, amount: paid, plan: order.plan || 'lifetime', source: 'hyp' });
  if (order.coupon) await burnSdawCoupon(env, order.coupon);
  const link = await mintDownloadLink(env, ent.id, order.email);
  await emailReceipt(env, order.email, link).catch(() => {});
  await env.DB.prepare(`UPDATE streamdaw_orders SET status='granted', hyp_id=?, entitlement_id=?, settled_at=? WHERE ref=?`)
    .bind(String(q.Id || ''), ent.id, now(), ref).run().catch(() => {});
  return Response.redirect(`${SITE}/apps/streamdaw.html?bought=1&ref=${encodeURIComponent(ref)}`, 302);
}

// ── 3. Download: serve the installer to an entitled buyer ──────────────────
export async function streamdawDownload(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  let entitlement = null;

  if (token) {
    const h = await sha256b64(token);
    const row = await env.DB.prepare('SELECT * FROM download_tokens WHERE token_hash = ?').bind(h).first();
    if (row && row.expires_at > now() && row.uses < row.max_uses) {
      await env.DB.prepare('UPDATE download_tokens SET uses = uses + 1, used_at = ? WHERE token_hash = ?').bind(now(), h).run();
      entitlement = await env.DB.prepare('SELECT * FROM entitlements WHERE id = ?').bind(row.entitlement_id).first();
    }
  } else {
    const user = await currentUser(req, env).catch(() => null);
    if (user) {
      entitlement = await env.DB.prepare(
        `SELECT * FROM entitlements WHERE product = ? AND status = 'active' AND (user_id = ? OR email = ?)
           AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`
      ).bind(PRODUCT, user.id, lc(user.email), now()).first();
    }
  }
  if (!entitlement || entitlement.status !== 'active') return json({ error: 'not_entitled' }, 403);

  const rel = await env.DB.prepare(
    'SELECT * FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(ASSET).first();
  if (!rel) return json({ error: 'no_release' }, 404);
  const obj = await env.APPS.get(rel.r2_key);
  if (!obj) return json({ error: 'file_missing' }, 404);

  return new Response(obj.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${rel.filename}"`,
      'content-length': String(rel.bytes || obj.size || ''),
      'cache-control': 'private, no-store',
    },
  });
}

// ── 4. Dashboard: does this member own StreamDAW? ──────────────────────────
export async function myStreamdaw(env, user) {
  if (!user) return json({ owned: false }, 401);
  const ent = await env.DB.prepare(
    `SELECT id, plan, created_at FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`
  ).bind(PRODUCT, user.id, lc(user.email), now()).first();
  if (!ent) return json({ owned: false });
  const rel = await env.DB.prepare('SELECT version, filename, bytes, sha256 FROM app_releases WHERE asset = ? AND is_latest = 1')
    .bind(ASSET).first();
  return json({ owned: true, since: ent.created_at, plan: ent.plan, release: rel, download: `${SITE}/api/streamdaw/download` });
}

// ── helpers ────────────────────────────────────────────────────────────────
async function grantEntitlement(env, { email, ext_ref, amount, plan, source }) {
  const existing = await env.DB.prepare('SELECT * FROM entitlements WHERE ext_ref = ?').bind(ext_ref).first();
  if (existing) return existing;
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(lc(email)).first();
  const ins = await env.DB.prepare(
    `INSERT INTO entitlements (user_id, email, product, plan, status, source, ext_ref, amount, currency, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 'ILS', ?)`
  ).bind(u?.id || null, lc(email), PRODUCT, plan, source || 'hyp', ext_ref, amount, now()).run();
  return { id: ins.meta.last_row_id, email: lc(email) };
}

async function mintDownloadLink(env, entitlementId, email) {
  const token = urlToken(32);
  const h = await sha256b64(token);
  await env.DB.prepare(
    `INSERT INTO download_tokens (token_hash, entitlement_id, email, product, asset, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(h, entitlementId, lc(email), PRODUCT, ASSET, now(), now() + TOKEN_TTL).run();
  return `${SITE}/api/streamdaw/download?t=${token}`;
}

function emailReceipt(env, to, link) {
  const subject = 'Your StreamDAW download — by Snowstar';
  const text =
`Thanks for getting StreamDAW.

Download it here (link is private to you, good for 7 days):
${link}

Install the .pkg, open your DAW, drop StreamDAW on the master bus, press GO LIVE.

You can re-download anytime from your account at ${SITE} — StreamDAW is tied to
this email, the same login you use for Mutra and everything else by Snowstar.

— Snowstar.Company`;
  const html =
`<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
  <h2 style="font-family:Anton,sans-serif;text-transform:uppercase;letter-spacing:.02em">Welcome to StreamDAW</h2>
  <p>Your private download link (good for 7 days):</p>
  <p><a href="${link}" style="display:inline-block;background:#1c2be0;color:#fff;font-weight:700;
     padding:12px 22px;border-radius:8px;text-decoration:none">Download StreamDAW</a></p>
  <p style="color:#666;font-size:14px">Install the .pkg, open your DAW, drop StreamDAW on the master bus,
     and press GO LIVE. Re-download anytime from your account at
     <a href="${SITE}">snowstar.company</a> — it's tied to this email, the same login as Mutra.</p>
  <p style="color:#999;font-size:12px">Powered by Snowstar.Company</p>
</div>`;
  return sendMail(env, { to, subject, text, html });
}
