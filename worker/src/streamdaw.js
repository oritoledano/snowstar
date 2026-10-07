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
  /* StreamDAW's own codes first — they stay StreamDAW-only, which is the rule
     the schema has always stated: a software discount must never be redeemable
     against a music licence. What is new is the fallback to the Snowstar-level
     table for a code explicitly scoped to streamdaw or to all, so one code can
     be issued once and work across the properties you chose. */
  return env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note
       FROM streamdaw_coupons WHERE code = ?`
  ).bind(c).first().catch(() => null).then((own) => own || env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note
       FROM coupons WHERE code = ? AND (scope = 'streamdaw' OR scope = 'all')`
  ).bind(c).first().catch(() => null));
}
function burnSdawCoupon(env, code) {
  const c = normCode(code);
  if (!c) return Promise.resolve();
  /* Burn wherever it lives. A shared code redeemed here must count against its
     own limit, or 'twenty uses' would mean twenty per property. */
  return Promise.all([
    env.DB.prepare('UPDATE streamdaw_coupons SET used = used + 1 WHERE code = ?').bind(c).run().catch(() => null),
    env.DB.prepare(
      "UPDATE coupons SET used = used + 1 WHERE code = ? AND (scope = 'streamdaw' OR scope = 'all')"
    ).bind(c).run().catch(() => null),
  ]);
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
  // Bought from inside the app ("Get Pro" opens this page with ?machine=SD…): the order
  // carries that Mac, and the key request files itself once the money is in. No sign-in
  // to the page afterwards, no machine ID to copy and paste.
  const machine = normMachine(body.machine);
  const ownerName = String(user?.name || body.name || '').trim().slice(0, 60) || null;

  // ── free (a coupon covered the whole price): grant now, no HYP ──
  if (amount <= 0) {
    if (!hypConfigured(env)) { /* free path needs no gateway, continue */ }
    await insertOrder(env, { ref, userId: user?.id || null, email, amount: 0, status: 'granted', coupon: couponCode, machine, ownerName });
    const ent = await grantEntitlement(env, { email, ext_ref: ref, amount: 0, plan: 'lifetime', source: 'coupon' });
    if (couponCode) await burnSdawCoupon(env, couponCode);
    const link = await mintDownloadLink(env, ent.id, email);
    if (machine) await requestKey(env, { entId: ent.id, email, machine, name: ownerName || email, via: 'checkout' }).catch(() => {});
    await emailReceipt(env, email, link, machine).catch(() => {});
    await env.DB.prepare('UPDATE streamdaw_orders SET entitlement_id = ?, settled_at = ? WHERE ref = ?')
      .bind(ent.id, now(), ref).run().catch(() => {});
    return json({ ok: true, free: true, ref, download: link, redirect: `${SITE}/apps/streamdaw.html?bought=1&free=1` });
  }

  // ── paid (full price, or partially discounted): send to HYP ──
  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  const shekels = (amount / 100).toFixed(2);
  await insertOrder(env, { ref, userId: user?.id || null, email, amount, status: 'started', coupon: couponCode, machine, ownerName });

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
  if (order.machine_id)
    await requestKey(env, { entId: ent.id, email: order.email, machine: order.machine_id, name: order.owner_name || order.email, via: 'checkout' }).catch(() => {});
  await emailReceipt(env, order.email, link, order.machine_id || null).catch(() => {});
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

/** GET /streamdaw/download/free — the free version: the same installer, for anyone.
 *  Pro switches on later with a key made for one Mac, so the build itself is not the thing
 *  being sold, and a free user who cannot download is a customer who never starts.
 *  Counted from req_log (route + status 200) for the dashboard's funnel. */
export async function streamdawDownloadFree(req, env) {
  const rel = await env.DB.prepare(
    'SELECT * FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(ASSET).first();
  if (!rel) return json({ error: 'no_release' }, 404);
  const obj = await env.APPS.get(rel.r2_key);
  if (!obj) return json({ error: 'file_missing' }, 404);
  return new Response(req.method === 'HEAD' ? null : obj.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${rel.filename}"`,
      'content-length': String(rel.bytes || obj.size || ''),
      'cache-control': 'public, max-age=300',
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

// ── licence activation: machine id in, key file out ────────────────────────
//
// The paid features are unlocked by an RSA-signed key bound to ONE machine, and
// signing needs the private key — which stays on the owner's Mac and never comes
// near a Worker. So this is a queue with a human at the end: the buyer submits the
// id their plug-in shows, the owner mints with `streamdaw-keygen`, and pastes the
// key back through /streamdaw/activation/issue, which emails it on.
//
// The machine id format is fixed by the plug-in (License.cpp): "SD" + 16 hex.
const MACHINE_ID_RE = /^SD[0-9A-F]{12,20}$/;
const normMachine = (v) => { const m = String(v || '').trim().toUpperCase(); return MACHINE_ID_RE.test(m) ? m : null; };

/* An order row, with the Mac it was bought for. The two columns arrive with
   schema-streamdaw-order-machine.sql; until that has run, the order is written without
   them (and the key request is then made the old way, on the page), so a deploy before
   the migration cannot break checkout. */
async function insertOrder(env, { ref, userId, email, amount, status, coupon, machine, ownerName }) {
  try {
    await env.DB.prepare(
      `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, machine_id, owner_name, created_at)
       VALUES (?, ?, ?, 'lifetime', ?, 'ILS', ?, ?, ?, ?, ?)`
    ).bind(ref, userId, email, amount, status, coupon, machine, ownerName, now()).run();
  } catch (e) {
    if (!/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, created_at)
       VALUES (?, ?, ?, 'lifetime', ?, 'ILS', ?, ?, ?)`
    ).bind(ref, userId, email, amount, status, coupon, now()).run();
  }
}

/* A key request for one Mac under one purchase: queued for minting, the owner told.
   From the page's activation form, and on its own when the purchase came from the app. */
async function requestKey(env, { entId, email, machine, name, via }) {
  // Already issued for this machine? Hand back the same key rather than queueing a
  // duplicate — re-installing must not need a new request.
  const prior = await env.DB.prepare(
    'SELECT status, key_text FROM streamdaw_activations WHERE entitlement_id = ? AND machine_id = ?'
  ).bind(entId, machine).first();
  if (prior && prior.status === 'issued' && prior.key_text) return { status: 'issued', key: prior.key_text };

  await env.DB.prepare(
    `INSERT INTO streamdaw_activations (entitlement_id, email, machine_id, owner_name, status, requested_at)
     VALUES (?, ?, ?, ?, 'pending', ?)
     ON CONFLICT (entitlement_id, machine_id) DO UPDATE SET
       owner_name = excluded.owner_name, requested_at = excluded.requested_at,
       status = CASE WHEN streamdaw_activations.status = 'issued' THEN 'issued' ELSE 'pending' END`
  ).bind(entId, lc(email), machine, name, now()).run();

  // Tell the owner there is something to mint. Never fail the request over mail.
  try {
    await sendMail(env, {
      to: env.ALERT_TO || 'oritoledano@gmail.com',
      subject: `StreamDAW licence request — ${name}${via === 'checkout' ? ' (bought in the app)' : ''}`,
      text: `${name} <${email}> ${via === 'checkout' ? 'bought StreamDAW from inside the app; their Mac came with the order.' : 'asked for a licence key.'}\n\n`
          + `Machine ID: ${machine}\n\n`
          + `Mint it:\n`
          + `  StreamDAWKeyGen --key "$(awk '/^private /{print $2}' ~/.cache/streamdaw/license-keypair.txt)" \\\n`
          + `    --name "${name}" --machines ${machine}\n\n`
          + `Then paste the key into the StreamDAW admin page to send it.`,
    });
  } catch {}
  return { status: 'pending' };
}

async function activeEntitlement(env, user) {
  return env.DB.prepare(
    `SELECT id, email FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC LIMIT 1`
  ).bind(PRODUCT, user.id, lc(user.email), now()).first();
}

/** The buyer asks for a key for this machine. */
export async function streamdawActivate(req, env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);

  const ent = await activeEntitlement(env, user);
  if (!ent) return json({ error: 'no StreamDAW purchase on this account' }, 403);

  let body = {};
  try { body = await req.json(); } catch {}
  const machine = String(body.machineId || '').trim().toUpperCase();
  const name = String(body.name || user.name || '').trim().slice(0, 60);

  if (!MACHINE_ID_RE.test(machine))
    return json({ error: 'That does not look like a machine ID. Copy it from the plug-in: ⓘ → Copy my machine ID.' }, 400);
  if (!name)
    return json({ error: 'Tell us the name that should appear on the licence.' }, 400);

  return json(await requestKey(env, { entId: ent.id, email: ent.email, machine, name, via: 'page' }));
}

/** The buyer polls after submitting, so the key lands without another email. */
export async function streamdawActivationStatus(env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);
  const ent = await activeEntitlement(env, user);
  if (!ent) return json({ owned: false });

  const rows = (await env.DB.prepare(
    `SELECT machine_id, status, key_text, serial, requested_at, issued_at
       FROM streamdaw_activations WHERE entitlement_id = ? ORDER BY requested_at DESC LIMIT 10`
  ).bind(ent.id).all()).results || [];
  return json({ owned: true, activations: rows });
}

/** Owner only: paste the minted key back in; the buyer gets it by email. */
export async function streamdawActivationIssue(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  let body = {};
  try { body = await req.json(); } catch {}
  const id = Number(body.id || 0);
  const key = String(body.key || '').trim();
  const reject = String(body.reject || '').trim();

  const row = await env.DB.prepare('SELECT * FROM streamdaw_activations WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'no such request' }, 404);

  if (reject) {
    await env.DB.prepare("UPDATE streamdaw_activations SET status = 'rejected', note = ? WHERE id = ?")
      .bind(reject.slice(0, 300), id).run();
    return json({ ok: true, status: 'rejected' });
  }

  // A key file is a multi-line base64 blob. Anything short is a paste accident,
  // and storing it would tell the buyer their licence is ready when it is not.
  if (key.length < 40) return json({ error: 'that key looks truncated' }, 400);

  const serial = String(body.serial || '').trim().slice(0, 40) || null;
  await env.DB.prepare(
    "UPDATE streamdaw_activations SET status = 'issued', key_text = ?, serial = ?, issued_at = ? WHERE id = ?"
  ).bind(key, serial, now(), id).run();

  try {
    await sendMail(env, {
      to: row.email,
      subject: 'Your StreamDAW licence key',
      text: `Here is your StreamDAW licence key.\n\n`
          + `Open StreamDAW, click ⓘ, paste this into "paste your licence key" and press Unlock.\n`
          + `It is tied to machine ${row.machine_id}, so it only works on that Mac — tell us if you change computers.\n\n`
          + `${key}\n\n— Snowstar.Company`,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="font-family:Anton,sans-serif;text-transform:uppercase;letter-spacing:.02em">Your StreamDAW licence</h2>
  <p>Open StreamDAW, click <b>&#9432;</b>, paste this into <i>paste your licence key</i> and press <b>Unlock</b>.</p>
  <pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f6;border-radius:8px;padding:14px;font-size:12px">${key.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</pre>
  <p style="color:#666;font-size:14px">Tied to machine <code>${row.machine_id}</code> — it only unlocks that Mac.
     Changing computers? Reply to this email and we'll reissue it.</p>
</div>`,
    });
  } catch {}

  return json({ ok: true, status: 'issued' });
}

// ── bug reports ────────────────────────────────────────────────────────────
//
// Open to anyone, no account. A report arrives at the moment something breaks;
// asking the person to sign in first is asking them to close the tab instead.
// Rate limited on a hash of the ip so one stuck client cannot flood the table.
const REPORT_MAX = 4000;

export async function streamdawReport(req, env) {
  // Same cross-origin story as the presence token: the listener page and the plug-in's
  // WebView are not this origin, so without CORS the browser refuses the POST outright.
  const cors = presenceCors(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let b = {};
  try { b = await req.json(); } catch {}

  const body = String(b.body || '').trim().slice(0, REPORT_MAX);
  if (body.length < 4) return json({ error: 'Tell us what went wrong.' }, 400, cors);

  const source = ['plugin', 'listener', 'console'].includes(b.source) ? b.source : 'plugin';
  const email = validEmail(b.email) ? lc(b.email) : null;
  // Context is whatever the surface knew (version, DAW, engine up, licence state).
  // Capped, because a runaway client should not be able to post a megabyte of state.
  let context = null;
  try { context = JSON.stringify(b.context || {}).slice(0, 4000); } catch {}

  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? (await sha256b64(ip)).slice(0, 24) : null;

  if (ipHash) {
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM streamdaw_reports WHERE ip_hash = ? AND created_at > ?'
    ).bind(ipHash, now() - 3600).first();
    if ((recent?.n || 0) >= 10) return json({ error: 'That is a lot of reports in an hour — email us instead.' }, 429, cors);
  }

  await env.DB.prepare(
    `INSERT INTO streamdaw_reports (source, email, body, context, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(source, email, body, context, ipHash, now()).run();

  try {
    await sendMail(env, {
      to: env.ALERT_TO || 'oritoledano@gmail.com',
      subject: `StreamDAW bug report (${source})`,
      text: `${body}\n\n--\nfrom: ${email || 'anonymous'}\nsource: ${source}\ncontext: ${context || '{}'}`,
      replyTo: email || undefined,
    });
  } catch {}

  return json({ ok: true }, 200, cors);
}

/** Owner only: read and triage them. */
export async function streamdawReports(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (req.method === 'POST') {
    let b = {};
    try { b = await req.json(); } catch {}
    const id = Number(b.id || 0);
    const status = ['new', 'seen', 'closed'].includes(b.status) ? b.status : 'seen';
    await env.DB.prepare('UPDATE streamdaw_reports SET status = ? WHERE id = ?').bind(status, id).run();
    return json({ ok: true });
  }
  const rows = (await env.DB.prepare(
    `SELECT id, source, email, body, context, status, created_at FROM streamdaw_reports
      ORDER BY (status = 'new') DESC, created_at DESC LIMIT 200`
  ).all()).results || [];
  return json({ reports: rows });
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

function emailReceipt(env, to, link, machine) {
  const subject = 'Your StreamDAW download — by Snowstar';
  const keyLine = machine
    ? `Your Pro key for this Mac (${machine}) is being made now. It arrives by email, usually within a few hours: paste it into StreamDAW › Settings › Licence.\n\n`
    : '';
  const text =
`Thanks for getting StreamDAW.

${keyLine}Download it here (link is private to you, good for 7 days):
${link}

Install the .pkg, open your DAW, drop StreamDAW on the master bus, press GO LIVE.

You can re-download anytime from your account at ${SITE} — StreamDAW is tied to
this email, the same login you use for Mutra and everything else by Snowstar.

— Snowstar.Company`;
  const html =
`<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
  <h2 style="font-family:Anton,sans-serif;text-transform:uppercase;letter-spacing:.02em">Welcome to StreamDAW</h2>
  ${machine ? `<p>Your Pro key for this Mac (<code>${machine}</code>) is being made now. It arrives by email, usually within a few hours: paste it into StreamDAW › Settings › Licence.</p>` : ''}
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

/* ═══════════ Admin ════════════════════════════════════════════════════════
   StreamDAW has had a checkout, entitlements, download tokens and a coupon
   endpoint for weeks, and no way to look at any of it. The coupon creator was
   admin-gated and reachable, with nothing in the dashboard calling it — a door
   with no handle on this side.

   The first thing this screen has to say is the thing nobody could see:
   app_releases is empty, so /streamdaw/download answers `no_release` to every
   entitled customer. Two people hold an active entitlement and neither can
   install the app. That is not a statistic to bury under a table of orders. */
export async function streamdawAdmin(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const soft = async (sql, ...binds) => {
    try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; }
    catch { return []; }
  };

  const orders = await soft(
    `SELECT o.ref, o.email, o.plan, o.amount, o.currency, o.status, o.coupon,
            o.hyp_id, o.entitlement_id, o.created_at, o.settled_at,
            u.name AS user_name
       FROM streamdaw_orders o LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 200`);

  const entitlements = await soft(
    `SELECT e.id, e.email, e.plan, e.status, e.source, e.amount, e.created_at,
            e.expires_at, e.revoked_at,
            (SELECT COUNT(*) FROM download_tokens t WHERE t.entitlement_id = e.id) AS tokens,
            (SELECT COALESCE(SUM(t.uses), 0) FROM download_tokens t WHERE t.entitlement_id = e.id) AS downloads
       FROM entitlements e WHERE e.product = 'streamdaw'
      ORDER BY e.created_at DESC LIMIT 200`);

  const coupons = await soft(
    `SELECT id, code, kind, value, max_uses, used, expires_at, active, note, created_at
       FROM streamdaw_coupons ORDER BY created_at DESC`);

  const releases = await soft(
    `SELECT asset, version, r2_key, filename, bytes, sha256, notarized, is_latest, created_at
       FROM app_releases ORDER BY created_at DESC LIMIT 50`);

  /* An order that never settled is not a sale and must not be counted as one.
     `started` means the buyer reached HYP and did not come back — five of the
     eight rows here — so revenue counts settled money only. */
  const paid = orders.filter((o) => o.status === 'granted' && (o.amount || 0) > 0);
  const stats = {
    orders: orders.length,
    abandoned: orders.filter((o) => o.status === 'started').length,
    granted: orders.filter((o) => o.status === 'granted').length,
    free: orders.filter((o) => o.status === 'granted' && !(o.amount || 0)).length,
    revenue: paid.reduce((n, o) => n + (o.amount || 0), 0),
    active: entitlements.filter((e) => e.status === 'active' && !e.revoked_at).length,
    downloads: entitlements.reduce((n, e) => n + (e.downloads || 0), 0),
    // the free version, from the request log (req_log keeps a fortnight)
    freeDownloads14d: ((await soft(
      `SELECT COUNT(*) AS n FROM req_log WHERE route = '/streamdaw/download/free' AND status = 200 AND ts > ?`,
      Math.floor(Date.now() / 1000) - 14 * 86400))[0] || {}).n || 0,
  };

  return json({
    orders, entitlements, coupons, releases, stats,
    /* Licence keys waiting to be minted. Oldest first: these are people who have
       paid and cannot use what they bought until someone runs the keygen. */
    activations: await soft(
      `SELECT a.id, a.email, a.machine_id, a.owner_name, a.status, a.serial,
              a.requested_at, a.issued_at
         FROM streamdaw_activations a
        ORDER BY (a.status = 'pending') DESC, a.requested_at ASC LIMIT 100`),

    /* The one blocking fact, stated rather than implied. */
    blocked: releases.some((r) => r.is_latest)
      ? null
      : { why: 'no_release',
          says: stats.active
            ? `${stats.active} ${stats.active === 1 ? 'person holds' : 'people hold'} an active `
              + `entitlement and cannot install the app: no release is marked latest, so every `
              + `download answers "no_release".`
            : 'No release is marked latest, so any download would fail. Nobody is entitled yet, '
              + 'so nobody has hit it — but a sale today would.' },
  });
}

/**
 * POST /streamdaw/release — register a build that is already in the APPS bucket.
 *
 * The file is uploaded with wrangler (installers are hundreds of megabytes and
 * have no business travelling through a Worker); this records which key is the
 * one to serve. Marking a release latest un-marks the previous one in the same
 * statement, because two rows claiming `is_latest` is a coin toss over which
 * build a customer gets.
 */
export async function streamdawRelease(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  // MUST default to the same ASSET the download route looks up, or a release
  // registered without an explicit asset is invisible to every buyer.
  const asset = String(b.asset || ASSET).slice(0, 60);

  if (b.promote) {
    const key = String(b.promote).slice(0, 300);
    const row = await env.DB.prepare('SELECT asset FROM app_releases WHERE r2_key = ?').bind(key).first();
    if (!row) return json({ error: 'not_found' }, 404);
    await env.DB.batch([
      env.DB.prepare('UPDATE app_releases SET is_latest = 0 WHERE asset = ?').bind(row.asset),
      env.DB.prepare('UPDATE app_releases SET is_latest = 1 WHERE r2_key = ?').bind(key),
    ]);
    return json({ ok: true, promoted: key });
  }
  if (b.remove) {
    await env.DB.prepare('DELETE FROM app_releases WHERE r2_key = ?').bind(String(b.remove).slice(0, 300)).run();
    return json({ ok: true });
  }

  const r2_key = String(b.r2_key || '').trim().slice(0, 300);
  const version = String(b.version || '').trim().slice(0, 40);
  if (!r2_key || !version) return json({ error: 'need_key_and_version' }, 400);

  /* Check the object is actually there before pointing customers at it — the
     whole reason this screen exists is a pointer to nothing. */
  const obj = await env.APPS.head(r2_key).catch(() => null);
  if (!obj) return json({ error: 'not_in_bucket', hint: `No object at ${r2_key} in snowstar-apps.` }, 404);

  const filename = String(b.filename || r2_key.split('/').pop()).slice(0, 200);
  const latest = b.is_latest !== false;
  const stmts = [];
  if (latest) stmts.push(env.DB.prepare('UPDATE app_releases SET is_latest = 0 WHERE asset = ?').bind(asset));
  stmts.push(env.DB.prepare(
    `INSERT OR REPLACE INTO app_releases
       (asset, version, r2_key, filename, bytes, sha256, notarized, is_latest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(asset, version, r2_key, filename, obj.size || 0,
         String(b.sha256 || '').slice(0, 64), b.notarized ? 1 : 0, latest ? 1 : 0, now()));
  await env.DB.batch(stmts);
  return json({ ok: true, asset, version, r2_key, bytes: obj.size || 0, is_latest: latest });
}
