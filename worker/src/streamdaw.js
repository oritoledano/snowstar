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
import { sha256b64, randB64, safeEqual, ipTag } from './crypto.js';
import { parseHyp, verifyReturn } from './hyp.js';
import { applyCoupon, couponProblem, normCode } from './coupons.js';
import { checkKey, mintKey } from './streamdaw-keys.js';

const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const SITE = 'https://snowstar.company';
const PRODUCT = 'streamdaw';
const ASSET = 'streamdaw-macos';
const TOKEN_TTL = 7 * 24 * 3600;         // emailed download link good for 7 days

// Price in agorot INCL VAT — HYP charges shekels, so StreamDAW is priced in ₪.
// ₪249 ≈ $69. Change here and on the buy page together.
const PRICE_GROSS = 24900;

// The 7-day Pro pass (2026-10-12) is RETIRED (2026-10-14, Ori): checkout refuses plan 'pass', and
// Pro Monthly (streamdaw-subs.js) is the middle card now. What stays is only what passes already
// sold are owed: a pass order paid after this change is still granted, its key still ends with it
// (format 3), and what was paid for a pass in the PASS_CREDIT_DAYS before a Pro purchase still
// comes off Pro, as its emails promised (nothing left to honour after 2026-11-13).
const PASS_DAYS = 7;
const PASS_CREDIT_DAYS = 30;
const PASS_MIN_APP = '0.5.8';   // keys the Worker signs (its own pair): 0.5.8 on trusts it
const isPass = (plan) => plan === 'pass';
const isMonthly = (plan) => plan === 'monthly';
const ends = (plan) => isPass(plan) || isMonthly(plan);       // a plan whose key has an end
const dayOf = (sec) => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
const subsMod = () => import('./streamdaw-subs.js');           // Pro Monthly (imports this file: no static cycle)

/* Pass money paid by this buyer that a Pro purchase now may use: passes settled in the last
   PASS_CREDIT_DAYS and after their last Pro purchase (a credit is used once). */
async function passCredit(env, email) {
  try {
    const lastPro = ((await env.DB.prepare(
      `SELECT MAX(settled_at) AS t FROM streamdaw_orders WHERE email = ? AND plan = 'lifetime' AND status = 'granted'`
    ).bind(lc(email)).first()) || {}).t || 0;
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM streamdaw_orders
        WHERE email = ? AND plan = 'pass' AND status = 'granted' AND settled_at > ? AND settled_at > ?`
    ).bind(lc(email), now() - PASS_CREDIT_DAYS * 86400, lastPro).first();
    return Math.max(0, Math.min(PRICE_GROSS, (r && r.n) || 0));
  } catch { return 0; }
}

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
// HYP's text for a log: credentials blanked (HYP does not echo them; this is so it never can).
const redactHyp = (s) => String(s || '').replace(/(KEY|PassP)=[^&]*/gi, '$1=***');
// A row in admin_log. Never throws: a log that fails must not unwind a payment.
const sdLog = (env, actor, action, subject, detail) => env.DB.prepare(
  'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
).bind(actor, action, subject, JSON.stringify(detail), now()).run().catch(() => null);

// ── presence tokens (listener identity for the relay) ───────────────────────
// A signed-in listener exchanges their Snowstar session for a short-lived token
// {name, sub, aud, exp} the relay trusts without touching the account DB.
//
// Since 2026-10-15 the token is SIGNED (ES256) with PRESENCE_SIGNING_KEY, a private key only
// this Worker holds (a Worker secret, a JWK); every StreamDAW relay checks it with the public
// key the app carries (server/presence.js in the StreamDAW repo). So "Require sign-in" works on
// a customer's Mac too, and no secret of ours is on anyone's Mac. `aud` names the relay a token
// is for, so a token handed to one studio is refused by every other:
//   - Ori's relay: the player is on stream.snowstar.company, SAME SITE as this Worker, so its
//     credentialed fetch carries the SameSite=Lax session cookie: POST /presence-token below,
//     aud = the page's host, 5 minutes (the page refreshes it every 90 s).
//   - a customer's Mac: the player is on https://<words>.trycloudflare.com, ANOTHER site. No
//     cross-site fetch carries a Lax cookie (and Safari sends no third-party cookie at all), so
//     CORS cannot do it. The page goes to snowstar.company/live/<id>/signin instead (a top-level
//     page: the cookie goes), the listener says yes, and comes back through /live/<id>/… with the
//     token in the URL fragment (never sent to any server). aud = the live-link id, 12 hours
//     (one sitting: there is no way to refresh it from the tunnel's page), and `sub` is a tag of
//     the account for that id only, so two studios cannot match up their listeners.
// The old HMAC token (PRESENCE_SECRET, shared with Ori's relay only) is still what `token` holds
// while that secret is set, so an old relay and an old player go on working; `signed` is the new
// one. Remove PRESENCE_SECRET once Ori's relay runs presence.js, and `token` becomes the signed one.
const PRESENCE_ORIGINS = ['https://stream.snowstar.company', 'http://localhost:8787', 'http://127.0.0.1:8787'];
const PRESENCE_SITTING_S = 12 * 3600;
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
// The signing key, imported once per isolate (and again if the secret changes).
let presenceSigner = null;
async function presenceKey(env) {
  const src = env.PRESENCE_SIGNING_KEY;
  if (!src) return null;
  if (presenceSigner && presenceSigner.src === src) return presenceSigner;
  let jwk = null;
  try { jwk = JSON.parse(src); } catch {}
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    presenceSigner = { src, key, kid: String(jwk.kid || '') };
    return presenceSigner;
  } catch { return null; }
}
/** A compact JWS (ES256): header.payload.signature. null without a signing key. */
async function signPresenceJwt(env, claims) {
  const k = await presenceKey(env);
  if (!k) return null;
  const enc = new TextEncoder();
  const head = b64urlBytes(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: k.kid })));
  const body = b64urlBytes(enc.encode(JSON.stringify({ iss: 'snowstar.company', ...claims, iat: now() })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64urlBytes(sig);
}
const presenceName = (user) => ((user.name && user.name.trim()) || lc(user.email).split('@')[0] || 'Listener').slice(0, 40);

/** POST /streamdaw/presence-token — signed-in listener → short-lived token the relay verifies
 *  to trust the listener's name. CORS + credentials for the stream.snowstar.company player.
 *  {token, signed, name}: `token` the old HMAC one while PRESENCE_SECRET is set (else the signed
 *  one), `signed` the ES256 one for the page's own host. */
export async function streamdawPresenceToken(req, env) {
  const origin = req.headers.get('origin') || '';
  const cors = presenceCors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.PRESENCE_SECRET && !env.PRESENCE_SIGNING_KEY) return json({ error: 'presence not configured' }, 501, cors);
  const user = await currentUser(req, env);
  if (!user) return json({ error: 'sign in required' }, 401, cors);
  const name = presenceName(user);
  const exp = now() + 300;
  const aud = PRESENCE_ORIGINS.includes(origin) ? new URL(origin).host : null;
  const signed = aud ? await signPresenceJwt(env, { name, sub: String(user.id), aud, exp }) : null;
  const legacy = env.PRESENCE_SECRET ? await signPresence(env.PRESENCE_SECRET, { name, sub: String(user.id), exp }) : null;
  const token = legacy || signed;
  if (!token) return json({ error: 'origin not allowed' }, 403, cors);
  return json({ token, signed, name }, 200, cors);
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
  // A Snowstar account first, always (2026-10-13, Ori): no session, no order and no HYP page.
  // The email is the account's, never the body's: a typed email used to be enough to reach HYP.
  // The sale page answers sign_in_required by opening the shared sign-up, then comes back here.
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const body = await req.json().catch(() => ({}));
  const email = lc(user.email);
  if (!validEmail(email)) return json({ error: 'sign_in_required' }, 401);

  // Pro (once), or Pro Monthly (streamdaw-subs.js). The 7-day pass is no longer sold. Pro takes
  // the buyer's recent pass money off first (passes sold before 2026-10-14), then a coupon.
  if (isPass(body.plan))
    return json({ error: 'plan_retired', reason: 'The 7-day pass is no longer sold. Try Pro free for 7 days in the app, or take Pro Monthly.' }, 410);
  if (isMonthly(body.plan)) return (await subsMod()).monthlyCheckout(env, user, body);
  const plan = 'lifetime';
  const credit = await passCredit(env, email);
  let amount = PRICE_GROSS - credit, couponCode = null;
  if (body.coupon && String(body.coupon).trim()) {
    // Coupon (optional). Invalid code entered → tell them, don't silently charge full.
    const c = await findSdawCoupon(env, body.coupon);
    const problem = couponProblem(c, amount);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ amount } = applyCoupon(amount, c));
    couponCode = c.code;
  }

  const ref = 'SD-' + urlToken(9).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10).padEnd(6, 'X');
  // Bought from inside the app ("Get Pro" opens this page with ?machine=SD…): the order
  // carries that Mac, and the key request files itself once the money is in. No sign-in
  // to the page afterwards, no machine ID to copy and paste.
  const machine = normMachine(body.machine);
  const ownerName = String(user.name || body.name || '').trim().slice(0, 60) || null;

  // ── free (a coupon covered the whole price): grant now, no HYP ──
  if (amount <= 0) {
    if (!hypConfigured(env)) { /* free path needs no gateway, continue */ }
    await insertOrder(env, { ref, userId: user.id, email, plan, amount: 0, status: 'granted', coupon: couponCode, machine, ownerName });
    const ent = await grantEntitlement(env, { email, ext_ref: ref, amount: 0, plan, source: credit ? 'pass-credit' : 'coupon' });
    if (couponCode) await burnSdawCoupon(env, couponCode);
    const link = await mintDownloadLink(env, ent.id, email);
    if (machine) await requestKey(env, { entId: ent.id, email, machine, name: ownerName || email, via: 'checkout' }).catch(() => {});
    await emailReceipt(env, email, link, machine, { ref, amount: 0, coupon: couponCode, plan, credit, expiresAt: ent.expires_at }).catch(() => {});
    await env.DB.prepare('UPDATE streamdaw_orders SET entitlement_id = ?, settled_at = ? WHERE ref = ?')
      .bind(ent.id, now(), ref).run().catch(() => {});
    await (await subsMod()).cancelForUpgrade(env, email, user.id).catch(() => {});   // Pro for good: a Pro Monthly stops
    return json({ ok: true, free: true, ref, download: link, redirect: `${SITE}/apps/streamdaw.html?bought=1&free=1` });
  }

  // ── paid (full price, or partially discounted): send to HYP ──
  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  await insertOrder(env, { ref, userId: user.id, email, plan, amount, status: 'started', coupon: couponCode, machine, ownerName });

  // APISign — mirrors the music checkout's signing, including the gotchas the
  // comments in hyp.js were written in blood for: Sign=True, and using HYP's
  // response VERBATIM as the pay URL.
  const p = payPageParams(env, { ref, amount, user, email, item: 'StreamDAW Pro (one payment)', info: `StreamDAW Pro ${ref}` });
  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);
  // A page whose return cannot be verified is never handed out: HYP echoes what it signed, so a
  // signed page without Sign=True would charge a card that nothing here could then confirm.
  if (d.Sign !== 'True') {
    await sdLog(env, 'system:hyp', 'sd.sign_unverifiable', ref, { hypReturned: redactHyp(text).slice(0, 900) });
    return json({ error: 'hyp_sign_failed', reason: 'no_sign' }, 502);
  }
  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, plan, amount_gross: amount, credit });
}

/* HYP's payment page, as both checkouts ask for it (Pro once here, Pro Monthly in
   streamdaw-subs.js). The look, from developers.hyp.co.il/pay/common-use-cases/customizing-payment-page-design
   (read 2026-10-14):
   - Pritim=True + heshDesc: the page lists what is bought ([code~description~quantity~unit price],
     the sum equal to Amount; no ~ [ ] in a description). The same lines go on HYP's invoice.
   - PageLang=ENG: English, left to right; the Israeli ID field shows only for an Israeli card.
   - tmp, the template (1–15; the docs show each):
       1, 2  name, surname, phone, email, address, card; the cart on the left
       3     name, surname, phone, email, card; the cart on the left
       4     the cart on the left, the card only: no name fields   ← HYP_TEMPLATE
       5     the card only, the business name and amount, no cart
       6, 7  the card only, no amount (for a frame that says the rest itself)
       8–15  the same layouts worded as donations ("donor"): not for a sale
     4 is the cleanest with the cart: an account already knows the name and email, so they are
     sent (ClientName, ClientLName, email) instead of asked for again. Ori can switch it here; the
     names are sent whatever the template, so a template without name fields never errors.
   - Apple Pay / Google Pay stay visible (no hideBtns). */
const HYP_TEMPLATE = '4';
function payPageParams(env, { ref, amount, user, email, item, info }) {
  const shekels = (amount / 100).toFixed(2);
  const words = String((user && user.name) || '').replace(/[~\[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const first = (words[0] || lc(email).split('@')[0] || 'StreamDAW').slice(0, 40), last = words.slice(1).join(' ').slice(0, 60);
  const p = new URLSearchParams({
    action: 'APISign', What: 'SIGN',
    Masof: env.HYP_TERMINAL, KEY: env.HYP_API_KEY, PassP: env.HYP_PASSP,
    Amount: shekels, Coin: '1',
    Info: info, Order: ref,
    // Sign=True (not the old signMe=1, which HYP ignores): the redirect then carries Sign, which
    // VERIFY needs (hyp.js, startCheckout).
    UTF8: 'True', UTF8out: 'True', Sign: 'True', MoreData: 'True',
    PageLang: 'ENG', tmp: HYP_TEMPLATE,
    Pritim: 'True', heshDesc: `[0~${String(item).replace(/[~\[\]]/g, ' ')}~1~${shekels}]`,
    ClientName: first, email,
    SendHesh: 'True', Postpone: 'False', J5: 'False',
  });
  if (last) p.set('ClientLName', last);
  return p;
}

// ── 2. The verified return (dispatched from hyp.js by the SD- prefix) ───────
//
// The sale page opens HYP's payment page in an iframe inside its checkout lightbox
// (js/streamdaw-checkout.js). HYP sends the buyer back to the ONE success URL set in its portal,
// so a payment made in the lightbox comes back here inside that iframe. The browser says so
// (Sec-Fetch-Dest: iframe), or ?frame=1 says it by hand; then the answer is a small page that
// tells the lightbox (postMessage to snowstar.company only) instead of a 302 that would load the
// whole sale page inside the frame. A top-level return keeps its 302, word for word.
const inFrame = (req, q) => q.frame === '1' || (req.headers.get('sec-fetch-dest') || '') === 'iframe';

/** The return page for a payment made in the lightbox: posts {type, bought, ref, plan} (or
 *  {pay, reason}) to the parent at `origin` and nowhere else, and only if it is framed; loaded
 *  as a whole page it goes on to `dest`, the same place the 302 sends a full-page buyer. Only our
 *  own site may frame it. */
export function checkoutFramePage(msg, dest, origin = SITE) {
  const nonce = urlToken(16);
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const say = msg.bought ? 'Payment received. Back to StreamDAW…'
    : msg.pay === 'confirming' ? 'Your payment is being confirmed. Back to StreamDAW…'
    : 'The payment did not go through. Back to StreamDAW…';
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + '<title>StreamDAW checkout</title><style>html,body{margin:0;height:100%;background:#f7f3e8;color:#17140d;'
    + 'font:500 15px/1.5 Inter,system-ui,-apple-system,sans-serif}body{display:grid;place-content:center;text-align:center;padding:24px}'
    + 'a{color:#1c2be0}</style></head><body>'
    + `<p>${esc(say)}</p><p><a href="${esc(dest)}" target="_top">Continue</a></p>`
    + `<script nonce="${nonce}">(function(){var m=${js(msg)},o=${js(origin)},d=${js(dest)};`
    + 'if(window.parent&&window.parent!==window){window.parent.postMessage(m,o);return;}location.replace(d);})();</script>'
    + '</body></html>';
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; `
        + `frame-ancestors ${origin}; base-uri 'none'; form-action 'none'`,
    },
  });
}

export async function streamdawReturn(req, env, raw, q) {
  const ref = String(q.Order || '');
  // ?frame=1 is ours, not HYP's: VERIFY compares the parameter set HYP sent, so it never goes along.
  raw = String(raw || '').split('&').filter((kv) => kv.split('=')[0] !== 'frame').join('&');
  const framed = inFrame(req, q);
  // Where a full-page buyer goes, unchanged; in the lightbox, the same answer as a message.
  const back = (query, msg) => {
    const dest = `${SITE}/apps/streamdaw.html?${query}`;
    if (!framed) return Response.redirect(dest, 302);
    const okRef = /^SD-[A-Z0-9]{4,20}$/.test(ref) ? ref : null;   // the query is anyone's to type
    return checkoutFramePage({ type: 'sd-checkout', ref: okRef, ...msg }, dest);
  };
  const planOf = (o) => (o && (o.plan === 'pass' || o.plan === 'monthly') ? o.plan : 'lifetime');
  const fail = (why, o) => back(`pay=failed&reason=${encodeURIComponent(why)}`, { bought: false, pay: 'failed', reason: why, plan: o ? planOf(o) : null });
  const bought = (o) => back(`bought=1&ref=${encodeURIComponent(ref)}`, { bought: true, plan: planOf(o) });

  if (q.CCode !== '0') {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='declined' WHERE ref=?`).bind(ref).run().catch(() => {});
    return fail('declined');
  }
  const order = await env.DB.prepare(`SELECT * FROM streamdaw_orders WHERE ref=?`).bind(ref).first();
  if (!order) return fail('unknown_ref');
  // Granted, or being granted by a return a moment ago (the frame and a reload): nothing to ask.
  if (order.status === 'granted' || order.status === 'granting') return bought(order);

  // HYP is asked once more only when it did not answer at all (network, its HTML error page).
  let v = await verifyReturn(env, raw);
  if (!v.ok && v.transient) v = await verifyReturn(env, raw);
  const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
  const looksCharged = /^[0-9]{4,}$/.test(String(q.ACode || '')) && paid === order.amount;
  const outcome = v.ok ? (paid !== order.amount ? 'amount_mismatch' : q.Coin && q.Coin !== '1' ? 'bad_currency' : 'verified')
    : looksCharged ? 'charged_unverified' : 'verify_failed';
  await logVerify(env, ref, raw, v, outcome);

  if (!v.ok) {
    if (looksCharged) {
      await env.DB.prepare(`UPDATE streamdaw_orders SET status='charged_unverified', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'StreamDAW: card charged but not verified',
        text: `Order ${ref}: HYP Id ${q.Id || ''}, auth ${q.ACode || ''}, ${q.Amount || ''} ILS.\n`
            + `Charged, but HYP's VERIFY did not confirm it (CCode ${v.ccode || v.error || '?'}${v.signed ? '' : ', the return carried no Sign'}), `
            + `so nothing was granted yet.\n\nPress Reconcile on this order: ${SITE}/dashboard.html#streamdaw/sdaw/orders\n`
            + `It asks HYP again when it can; otherwise it asks you to confirm the transaction in the HYP portal first.` }).catch(() => {});
      return back(`pay=confirming&ref=${encodeURIComponent(ref)}`, { bought: false, pay: 'confirming', plan: planOf(order) });
    }
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='verify_failed', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
    return fail('unverified', order);
  }

  if (paid !== order.amount) return fail('amount_mismatch', order);
  if (q.Coin && q.Coin !== '1') return fail('bad_currency', order);
  try {
    await fulfilPaid(env, order, q, 'hyp');
  } catch {
    // Verified and paid, and the grant broke: the honest answer is "being confirmed", and the owner hears.
    await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'StreamDAW: paid and verified, but the grant failed',
      text: `Order ${ref}: HYP Id ${q.Id || ''}, ${q.Amount || ''} ILS. HYP verified it; granting then failed (admin_log sd.grant_failed).\n`
          + `Press Reconcile on this order: ${SITE}/dashboard.html#streamdaw/sdaw/orders` }).catch(() => {});
    return back(`pay=confirming&ref=${encodeURIComponent(ref)}`, { bought: false, pay: 'confirming', plan: planOf(order) });
  }
  return bought(order);
}

/* Every StreamDAW return leaves HYP's VERIFY answer in admin_log ('sd.verify'): CCode, HYP's reply
   (credentials blanked), whether the redirect carried Sign, and the names of what it carried.
   SD-JQYOOWJOEP (2026-10-14) was charged, VERIFY said no, and nothing recorded why.
   It also keeps the redirect itself (`ret`) until the order is granted: Reconcile sends it to
   VERIFY again (HYP checks it only byte for byte), and fulfilPaid removes it once granted. */
async function logVerify(env, ref, raw, v, outcome) {
  const keys = String(raw || '').split('&').map((kv) => kv.split('=')[0]).filter(Boolean);
  const detail = { outcome, ccode: v.ccode == null ? null : String(v.ccode), error: v.error || null,
    reply: redactHyp(v.raw).slice(0, 300), signed: !!v.signed, keys };
  if (raw.length <= 3000) detail.ret = raw;
  await sdLog(env, 'system:hyp', 'sd.verify', ref, detail);
}

/** The redirect a failed return kept, newest first. */
async function keptReturn(env, ref) {
  const rows = (await env.DB.prepare(
    `SELECT detail FROM admin_log WHERE action = 'sd.verify' AND subject = ? ORDER BY id DESC LIMIT 5`
  ).bind(ref).all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) { try { const d = JSON.parse(r.detail); if (d && d.ret) return d.ret; } catch { /* not ours */ } }
  return null;
}

/* What a paid order gets, from a verified return or from Reconcile, the same either way: the
   entitlement (Pro Monthly: its subscription first, streamdaw-subs.js), the coupon burnt, a
   download link, the key request when the order came from the app, the receipt. The order is
   claimed first ('granting', one UPDATE), so two at once (the frame and a reload, a return and
   Reconcile) grant it once. */
async function fulfilPaid(env, order, q, source) {
  const ref = order.ref;
  const claim = await env.DB.prepare(
    `UPDATE streamdaw_orders SET status='granting' WHERE ref=? AND status NOT IN ('granted','granting')`
  ).bind(ref).run();
  if (!claim.meta || claim.meta.changes !== 1) return { already: true };
  try {
    const plan = order.plan || 'lifetime';
    const subs = await subsMod();
    const monthly = isMonthly(plan) ? await subs.monthlyGranted(env, order, q, ref) : null;
    const ent = monthly ? monthly.ent : await grantEntitlement(env, { email: order.email, ext_ref: ref, amount: order.amount, plan, source });
    if (order.coupon) await burnSdawCoupon(env, order.coupon);
    const link = await mintDownloadLink(env, ent.id, order.email);
    if (order.machine_id)
      await requestKey(env, { entId: ent.id, email: order.email, machine: order.machine_id, name: order.owner_name || order.email, via: 'checkout' }).catch(() => {});
    if (monthly) await subs.mailWelcome(env, monthly.sub, { link, machine: order.machine_id || null, ref }).catch(() => {});
    else await emailReceipt(env, order.email, link, order.machine_id || null,
      { ref, amount: order.amount, coupon: order.coupon || null, plan, expiresAt: ent.expires_at }).catch(() => {});
    // Granted from here on: the receipt has gone, so nothing below may send the order back.
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='granted', hyp_id=COALESCE(?, hyp_id), entitlement_id=?, settled_at=? WHERE ref=?`)
      .bind(q && q.Id ? String(q.Id) : null, ent.id, now(), ref).run().catch(() => {});
    // Settled: the kept redirect (card details, the buyer's ID) has done its job.
    await env.DB.prepare(`UPDATE admin_log SET detail = json_remove(detail, '$.ret') WHERE action = 'sd.verify' AND subject = ?`)
      .bind(ref).run().catch(() => {});
    if (plan === 'lifetime') await subs.cancelForUpgrade(env, order.email, order.user_id).catch(() => {});   // Pro for good: a Pro Monthly stops
    return { ok: true, ent };
  } catch (e) {
    // Paid and not granted: charged_unverified, which Reconcile finishes (the kept redirect, or the portal).
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='charged_unverified', hyp_id=COALESCE(hyp_id, ?) WHERE ref=? AND status='granting'`)
      .bind(q && q.Id ? String(q.Id) : null, ref).run().catch(() => {});
    await sdLog(env, 'system:hyp', 'sd.grant_failed', ref, { error: String(e && e.message || e).slice(0, 300), source });
    throw e;
  }
}

/**
 * POST /streamdaw/reconcile {ref, hyp_id?, portal_checked?} — the owner, for an order that was
 * charged and not verified (charged_unverified, verify_failed). Grants exactly as a verified
 * return does, or not at all.
 *
 * 1. HYP's own answer when it can be asked: the redirect the return kept goes to What=VERIFY
 *    again. Its CCode decides; when HYP says no, nothing here overrides it.
 * 2. Hyp Pay has no API that looks a transaction up by Id or Order (its actions are APISign,
 *    CancelTrans, commitTrans, getToken, HKStatus, payRequest, soft, zikoyAPI:
 *    developers.hyp.co.il/pay/reference/actions). So for a return that carried no Sign (every
 *    order signed before Sign=True, SD-JQYOOWJOEP among them) HYP's portal is the record: the
 *    owner finds the transaction there and confirms with its Id, which must equal the Id the
 *    return recorded, on an order whose amount and authorisation code already matched ours.
 */
export async function streamdawReconcile(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref || '').trim();
  if (!/^SD-[A-Z0-9]{4,20}$/.test(ref)) return json({ error: 'bad_ref' }, 400);
  const order = await env.DB.prepare('SELECT * FROM streamdaw_orders WHERE ref = ?').bind(ref).first();
  if (!order) return json({ error: 'not_found' }, 404);
  if (order.status === 'granted') return json({ ok: true, already: true, ref, entitlement_id: order.entitlement_id || null });
  if (order.status !== 'charged_unverified' && order.status !== 'verify_failed')
    return json({ error: 'not_reconcilable', status: order.status }, 409);
  const actor = `admin:${user.id || user.email || '?'}`;
  const done = (out, via) => json({ ok: true, via, ref, already: !!out.already,
    entitlement_id: out.ent ? out.ent.id : null });

  const kept = await keptReturn(env, ref);
  if (kept && kept.split('&').some((kv) => kv.split('=')[0] === 'Sign')) {
    const q = parseHyp(kept);
    const v = await verifyReturn(env, kept);
    await sdLog(env, actor, 'sd.reconcile', ref, { via: 'verify', ccode: v.ccode == null ? null : String(v.ccode),
      error: v.error || null, reply: redactHyp(v.raw).slice(0, 300) });
    if (!v.ok) return json({ error: v.transient ? 'hyp_unreachable' : 'hyp_says_no', ccode: v.ccode || null }, v.transient ? 502 : 409);
    const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
    if (String(q.Order || '') !== ref || q.CCode !== '0') return json({ error: 'not_this_order' }, 409);
    if (paid !== order.amount) return json({ error: 'amount_mismatch', paid, expected: order.amount }, 409);
    if (q.Coin && q.Coin !== '1') return json({ error: 'bad_currency' }, 409);
    return done(await fulfilPaid(env, order, q, 'hyp'), 'verify');
  }

  // No signed redirect to show HYP: only an order whose return already looked charged (our amount,
  // an authorisation code, HYP's transaction Id), confirmed by the owner in HYP's portal.
  if (order.status !== 'charged_unverified' || !/^\d{1,20}$/.test(String(order.hyp_id || '')))
    return json({ error: 'cannot_confirm', status: order.status }, 409);
  const shekels = (order.amount / 100).toFixed(2);
  if (b.portal_checked !== true || String(b.hyp_id || '').trim() !== String(order.hyp_id)) {
    return json({ error: 'confirm_in_portal', ref, hyp_id: order.hyp_id, amount: order.amount,
      says: `HYP cannot be asked about ${ref} by API: its return carried no signature, and Hyp Pay has no `
          + `transaction lookup. In the HYP portal (Transactions), find transaction ${order.hyp_id}: `
          + `it must show approved, ₪${shekels}, order ${ref}.` }, 409);
  }
  const out = await fulfilPaid(env, order, { Id: order.hyp_id, CCode: '0', Amount: shekels, Order: ref, Coin: '1' }, 'hyp-portal');
  await sdLog(env, actor, 'sd.reconcile', ref, { via: 'portal', hyp_id: order.hyp_id, amount: order.amount, already: !!out.already });
  return done(out, 'portal');
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

/** GET /streamdaw/download/free — the free version: the same installer, for anyone with a
 *  Snowstar account (2026-10-13, Ori). Pro switches on later with a key made for one Mac, so
 *  the build itself is not the thing being sold; the account is how we know who has it.
 *  Signed out: back to the sale page with the sign-up open (?get=free; js/streamdaw-page.js
 *  starts the download once they are in), or a 401 for a caller that asks for JSON.
 *  Each download is filed with who took it (streamdaw_free_downloads,
 *  schema-streamdaw-free-downloads.sql); req_log still counts route + 200 for the funnel. */
const FREE_SIGNUP_URL = `${SITE}/apps/streamdaw.html?get=free`;
export async function streamdawDownloadFree(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user) {
    if (/application\/json/.test(req.headers.get('accept') || '')) return json({ error: 'sign_in_required', signup: FREE_SIGNUP_URL }, 401);
    return new Response(null, { status: 302, headers: { location: FREE_SIGNUP_URL, 'cache-control': 'no-store' } });
  }
  const rel = await env.DB.prepare(
    'SELECT * FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(ASSET).first();
  if (!rel) return json({ error: 'no_release' }, 404);
  const obj = await env.APPS.get(rel.r2_key);
  if (!obj) return json({ error: 'file_missing' }, 404);
  // Who took it (a HEAD takes nothing). Soft: before the migration the file is still served.
  if (req.method !== 'HEAD') {
    await env.DB.prepare('INSERT INTO streamdaw_free_downloads (user_id, version, created_at) VALUES (?, ?, ?)')
      .bind(user.id, rel.version || null, now()).run().catch(() => {});
  }
  return new Response(req.method === 'HEAD' ? null : obj.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${rel.filename}"`,
      'content-length': String(rel.bytes || obj.size || ''),
      // one person's download now, not a public file: no shared cache may keep it
      'cache-control': 'private, no-store',
    },
  });
}

// ── 4. Dashboard: does this member own StreamDAW? ──────────────────────────
export async function myStreamdaw(env, user) {
  if (!user) return json({ owned: false }, 401);
  const ent = await env.DB.prepare(
    `SELECT id, plan, created_at, expires_at FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY (expires_at IS NULL) DESC, created_at DESC LIMIT 1`
  ).bind(PRODUCT, user.id, lc(user.email), now()).first();
  // What Pro costs this buyer now: less what their recent passes paid (the page shows it).
  const proPrice = PRICE_GROSS - await passCredit(env, user.email);
  // Pro Monthly: its state (renews / cancelled / payment due), for the account page and the sale page.
  const subscription = await (await subsMod()).subFor(env, user).catch(() => null);
  if (!ent) return json({ owned: false, proPrice, subscription });
  const rel = await env.DB.prepare('SELECT version, filename, bytes, sha256 FROM app_releases WHERE asset = ? AND is_latest = 1')
    .bind(ASSET).first();
  return json({ owned: true, since: ent.created_at, plan: ent.plan, expiresAt: ent.expires_at || null, proPrice, subscription,
                release: rel, download: `${SITE}/api/streamdaw/download` });
}

// ── licence activation: machine id in, key file out ────────────────────────
//
// The paid features are unlocked by a signed key bound to ONE machine (P-256 since
// StreamDAW 0.5.0; streamdaw-keys.js). Since 2026-10-15 the Worker signs them itself, with its
// own pair (STREAMDAW_SIGNING_KEY; the app trusts it next to the offline pair on Ori's Mac): a
// request within the purchase's MAX_MACS Macs gets its key in the answer and by email, at once.
// The exceptions (a third Mac, a failure) wait in the dashboard, where the owner signs here or
// pastes a key minted by hand with `streamdaw-keygen` (/streamdaw/activation/issue).
//
// The machine id format is fixed by the plug-in (License.cpp): "SD" + 16 hex.
const MACHINE_ID_RE = /^SD[0-9A-F]{12,20}$/;
const normMachine = (v) => { const m = String(v || '').trim().toUpperCase(); return MACHINE_ID_RE.test(m) ? m : null; };

/* A licence key as a person should see it: only the signed hex, in lines of 64. Whatever was
   pasted — keygen's whole printout, JUCE's old key file with its "Keyfile for…" comment lines,
   or the bare hex — comes down to the same thing; the app accepts that in every version
   (2026-10-08: a buyer got the comment block and could not tell what to paste). */
function keyHex(k) {
  let s = String(k || '');
  if (s.includes('#')) return s.slice(s.lastIndexOf('#') + 1).replace(/\s/g, '').toLowerCase();
  let best = '';
  for (const run of s.match(/[0-9a-fA-F\s]+/g) || []) { const h = run.replace(/\s/g, ''); if (h.length > best.length) best = h; }
  return best.toLowerCase();
}
const keyLines = (k) => (keyHex(k).match(/.{1,64}/g) || []).join('\n');

/* Keys: format, check and signing live in streamdaw-keys.js (checkKey, mintKey). */
const MIN_APP = '0.5.8';        // keys the Worker signs (its own pair): 0.5.8 on trusts it
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const escHtml = (t) => String(t || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/* The mint command, ready to paste in Terminal on the owner's Mac. The name is what listeners
   see as the host; the email rides in the key for this Mac's licence panel only. */
const mintCommand = ({ name, email, machine, expiresAt }) =>
  `~/.cache/streamdaw/bin/streamdaw-keygen --keyfile ~/.cache/streamdaw/license-keypair-v2.txt `
  + `--name "${String(name || '').replace(/["$`\\]/g, '')}" --email "${lc(email).replace(/["$`\\]/g, '')}" --machines ${machine}`
  + (expiresAt ? ` --expires ${Number(expiresAt) * 1000}` : '');   // a Pro pass: its end (seconds here, ms for the keygen)

/* One look for every StreamDAW licence email to a buyer. */
/* Every StreamDAW email has the same shape (2026-10-10, Ori: "do what other big brands do and
   close all loose ends"): a title, one line, the steps, at most one main button, the key in a
   box when there is one, the details, and the same links at the foot: get a key for a Mac,
   your account and downloads, help, the terms. The text part says the same, links spelled out. */
const UNLOCK_URL = `${SITE}/apps/streamdaw-unlock.html`;
const ACCOUNT_URL = `${SITE}/account.html`;
const TERMS_URL = `${SITE}/apps/streamdaw-terms.html`;
const HELP_MAIL = 'hello@snowstar.company';
const mailLinksHtml = () =>
  `<a href="${UNLOCK_URL}" style="color:#16140f">Get a key for a Mac</a> · <a href="${ACCOUNT_URL}" style="color:#16140f">Your account and downloads</a>`
  + ` · <a href="mailto:${HELP_MAIL}" style="color:#16140f">Help</a> · <a href="${TERMS_URL}" style="color:#16140f">Terms</a>`;
const mailLinksText = () =>
  `Get a key for a Mac: ${UNLOCK_URL}\nYour account and downloads: ${ACCOUNT_URL}\nHelp: ${HELP_MAIL}\nTerms: ${TERMS_URL}`;
function licenceMail({ title, intro, steps, key, footer, button }) {
  const html =
`<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#16140f;line-height:1.5">
  <h2 style="font-family:Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em;margin:0 0 12px">${escHtml(title)}</h2>
  <p style="margin:0 0 14px">${intro}</p>
  ${steps && steps.length ? `<ol style="margin:0 0 16px;padding-left:22px">${steps.map((t) => `<li style="margin:0 0 6px">${t}</li>`).join('')}</ol>` : ''}
  ${button ? `<p style="margin:0 0 18px"><a href="${button.href}" style="display:inline-block;background:#16140f;color:#c8f23a;font-weight:700;padding:12px 22px;border-radius:999px;text-decoration:none">${escHtml(button.label)}</a></p>` : ''}
  ${key ? `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.45;background:#f4f0e4;border:1px solid #d3cbb6;border-radius:10px;padding:14px 16px;margin:0 0 16px;white-space:pre;overflow-x:auto">${escHtml(key)}</pre>` : ''}
  ${footer ? `<p style="color:#6f6a5c;font-size:13px;margin:0 0 16px">${footer}</p>` : ''}
  <p style="font-size:13px;margin:0;padding-top:12px;border-top:1px solid #e3dccb">${mailLinksHtml()}</p>
  <p style="color:#a59f8c;font-size:12px;margin:14px 0 0">StreamDAW · by Snowstar.Company · Ori Toledano, 22 Eilat Street, Tel Aviv</p>
</div>`;
  return html;
}

/* An order row, with the Mac it was bought for. The two columns arrive with
   schema-streamdaw-order-machine.sql; until that has run, the order is written without
   them (and the key request is then made the old way, on the page), so a deploy before
   the migration cannot break checkout. */
async function insertOrder(env, { ref, userId, email, plan, amount, status, coupon, machine, ownerName }) {
  plan = isPass(plan) || isMonthly(plan) ? plan : 'lifetime';
  try {
    await env.DB.prepare(
      `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, machine_id, owner_name, created_at)
       VALUES (?, ?, ?, ?, ?, 'ILS', ?, ?, ?, ?, ?)`
    ).bind(ref, userId, email, plan, amount, status, coupon, machine, ownerName, now()).run();
  } catch (e) {
    if (!/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, coupon, created_at)
       VALUES (?, ?, ?, ?, ?, 'ILS', ?, ?, ?)`
    ).bind(ref, userId, email, plan, amount, status, coupon, now()).run();
  }
}

/* A key request for one Mac under one purchase: queued for minting, the owner told.
   From the page's activation form, and on its own when the purchase came from the app. */
async function requestKey(env, { entId, email, machine, name, via }) {
  // The name on a licence is what listeners see as the host: never an email address. A purchase
  // made in the app may come without one; then the part before the @ stands in.
  if (!name || name.includes('@')) name = String(email || '').split('@')[0] || 'StreamDAW user';
  // Already issued for this machine? Hand back the same key rather than queueing a
  // duplicate — re-installing must not need a new request. (A Mac deactivated on the unlock page
  // asks again like a new one: it takes a place again.)
  const prior = await env.DB.prepare(
    'SELECT status, key_text FROM streamdaw_activations WHERE entitlement_id = ? AND machine_id = ?'
  ).bind(entId, machine).first();
  if (prior && prior.status === 'issued' && prior.key_text) return { status: 'issued', key: keyLines(prior.key_text) };

  // A plan with an end (Pro Monthly; a pass sold before 2026-10-14): its key ends when the
  // entitlement does (seconds, as every table here; the minter turns it into the keygen's
  // --expires in ms, and issueKey refuses a key whose end differs). For Pro Monthly that is the
  // paid month plus 3 days, moved on by each renewal (streamdaw-subs.js).
  const ent = await env.DB.prepare('SELECT plan, expires_at FROM entitlements WHERE id = ?').bind(entId).first().catch(() => null);
  const expiresAt = ent && ends(ent.plan) && ent.expires_at ? Number(ent.expires_at) : null;
  if (ent && ends(ent.plan) && (!expiresAt || expiresAt <= now())) return { status: 'expired' };
  // At most MAX_MACS Macs per purchase (Ori, 2026-10-15): another is refused until one is
  // deactivated on the unlock page. It is still filed, as 'limit', so the owner can let it through
  // from the dashboard (the exception, by hand).
  const others = ((await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM streamdaw_activations WHERE entitlement_id = ? AND machine_id != ?
        AND status IN ('issued','renewing','pending')`
  ).bind(entId, machine).first()) || {}).n || 0;
  const full = others >= MAX_MACS;
  const status = full ? 'limit' : 'pending';
  try {
    await env.DB.prepare(
      `INSERT INTO streamdaw_activations (entitlement_id, email, machine_id, owner_name, status, requested_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (entitlement_id, machine_id) DO UPDATE SET
         owner_name = excluded.owner_name, requested_at = excluded.requested_at, expires_at = excluded.expires_at,
         status = CASE WHEN streamdaw_activations.status = 'issued' THEN 'issued' ELSE excluded.status END`
    ).bind(entId, lc(email), machine, name, status, now(), expiresAt).run();
  } catch (e) {
    // Before schema-streamdaw-pass.sql ran: Pro requests still file; a pass waits (never permanent).
    if (expiresAt || !/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO streamdaw_activations (entitlement_id, email, machine_id, owner_name, status, requested_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (entitlement_id, machine_id) DO UPDATE SET
         owner_name = excluded.owner_name, requested_at = excluded.requested_at,
         status = CASE WHEN streamdaw_activations.status = 'issued' THEN 'issued' ELSE excluded.status END`
    ).bind(entId, lc(email), machine, name, status, now()).run();
  }

  if (full) {
    try {
      await sendMail(env, {
        to: env.ALERT_TO || 'oritoledano@gmail.com',
        subject: `[Admin] StreamDAW: ${name} asked for a key for Mac number ${others + 1} (refused)`,
        text: `ADMIN NOTE, NOT A KEY. ${name} <${email}> asked for a key for ${machine}, but the purchase already has keys for ${others} Macs (the limit is ${MAX_MACS}).
`
            + `They were told to deactivate one of their Macs first (${UNLOCK_URL}).

`
            + `To let it through anyway: ${SITE}/dashboard (StreamDAW › Keys), "Sign here" on this row.`,
      });
    } catch {}
    return { status: 'limit', macs: others, error: `This purchase already has keys for ${others} Macs. Deactivate one of your Macs first, then ask again.` };
  }

  // Signed here, now, with the Worker's pair: the key is in this answer and in the buyer's email.
  const row = await env.DB.prepare('SELECT * FROM streamdaw_activations WHERE entitlement_id = ? AND machine_id = ?').bind(entId, machine).first();
  const signed = row ? await autoIssue(env, row) : { error: 'the request was not filed' };
  if (signed.ok) {
    const done = await env.DB.prepare('SELECT * FROM streamdaw_activations WHERE id = ?').bind(row.id).first();
    return { status: 'issued', key: withRenewal(keyLines(done.key_text), done.renew_code) };
  }

  // Not signed here (no secret, or an error): the old way — the minter on the owner's Mac if it
  // runs, else the owner by hand.
  const auto = !!env.MINTER_TOKEN;
  // Tell the owner. Never fail the request over mail. The subject says ADMIN: the owner is
  // often the buyer too (testing), and this is not a key.
  const byHand = `Run this in Terminal on your Mac:\n\n${mintCommand({ name, email, machine, expiresAt })}\n\n`
    + `Then open ${SITE}/dashboard (StreamDAW › Keys), press "Paste key…" on this row and paste everything it printed.\n`
    + `The buyer gets the key by email at once.`;
  try {
    await sendMail(env, {
      to: env.ALERT_TO || 'oritoledano@gmail.com',
      subject: auto ? `[Admin] StreamDAW key request: ${name} (sent automatically)`
                    : `[Admin] Mint a StreamDAW key for ${name}${via === 'checkout' ? ' (bought in the app)' : ''}`,
      text: `ADMIN NOTE, NOT A KEY. ${name} <${email}> ${via === 'checkout' ? 'bought StreamDAW from inside the app; their Mac came with the order.' : 'asked for a licence key.'}\n`
          + `Machine ID: ${machine}\n`
          + `The Worker could not sign it: ${signed.error}\n\n`
          + (auto
            ? `The minter on your Mac signs and sends it within a minute while your Mac is awake. Nothing to do.\n\n`
              + `If the dashboard (StreamDAW › Keys) still says "waiting" later, do it by hand. ${byHand}`
            : byHand),
    });
  } catch {}

  // And tell the buyer what happens next, so the wait is not a silence. (A purchase made in the
  // app already says this in its receipt.)
  if (via !== 'checkout') {
    const hi = firstName(name);
    try {
      await sendMail(env, {
        to: email,
        subject: 'We got your StreamDAW key request',
        text: `${hi ? `Hi ${hi},\n\n` : ''}We got your request for a StreamDAW Pro key for this Mac:\n${machine}\n\n`
            + `What happens next:\n`
            + `1. We make your key, ${auto ? 'usually within minutes' : 'usually within a day'}.\n`
            + `2. It arrives in a second email, "Your StreamDAW Pro key", and on ${UNLOCK_URL} when you are signed in.\n`
            + `3. Paste it into StreamDAW › Settings › Licence and press Unlock.\n\n`
            + `Nothing to do until then. StreamDAW keeps working in the meantime.\n\n${mailLinksText()}\n\n— Snowstar.Company`,
        html: licenceMail({
          title: 'Your key is on its way',
          intro: `${hi ? `Hi ${escHtml(hi)}, we` : 'We'} got your request for a StreamDAW Pro key for this Mac: <code>${escHtml(machine)}</code>`,
          steps: [
            `We make your key, ${auto ? 'usually within minutes' : 'usually within a day'}.`,
            `It arrives in a second email, <b>Your StreamDAW Pro key</b>, and on <a href="${UNLOCK_URL}">your unlock page</a> when you are signed in.`,
            'Paste it into <b>StreamDAW › Settings › Licence</b> and press <b>Unlock</b>.',
          ],
          footer: 'Nothing to do until then. StreamDAW keeps working in the meantime.',
        }),
      });
    } catch {}
  }
  return { status: 'pending', soon: auto };
}

async function activeEntitlement(env, user) {
  return env.DB.prepare(
    `SELECT id, email, plan, expires_at FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY (expires_at IS NULL) DESC, created_at DESC LIMIT 1`
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
    `SELECT machine_id, status, key_text, serial, requested_at, issued_at, renew_code
       FROM streamdaw_activations WHERE entitlement_id = ? ORDER BY requested_at DESC LIMIT 10`
  ).bind(ent.id).all().catch(() => env.DB.prepare(
    `SELECT machine_id, status, key_text, serial, requested_at, issued_at
       FROM streamdaw_activations WHERE entitlement_id = ? ORDER BY requested_at DESC LIMIT 10`).bind(ent.id).all())).results || [];
  // A Pro Monthly key is shown with its Renewal line: copied together, the app renews it by itself.
  for (const r of rows) {
    if (r.key_text) r.key_text = withRenewal(keyLines(r.key_text), r.renew_code);
    if (r.status === 'renewing') r.status = 'issued';           // the key it has still works; the next one is on its way
    delete r.renew_code;
  }
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

  // "Sign here": the Worker signs this one now, whatever the Mac limit says (the owner's exception).
  if (body.mint) {
    const r = await autoIssue(env, row, true);
    return json(r.error ? { error: r.error } : { ok: true, status: 'issued' }, r.error ? (r.code || 400) : 200);
  }

  const r = await issueKey(env, row, key, false);
  return json(r.error ? { error: r.error } : { ok: true, status: 'issued' }, r.error ? (r.code || 400) : 200);
}

/* Store a minted key and email it to the buyer — from the dashboard (the owner pasting) or
   from the minter on the owner's Mac. `onlyPending`: the minter never overwrites a key the
   owner already sent by hand. */
async function issueKey(env, row, key, onlyPending) {
  // Keep only the signed hex (keygen's whole printout may be pasted), and check it is a whole
  // format-2 key for this request's Mac with a good signature: storing anything else would tell
  // the buyer their licence is ready when it is not. The serial is read from the signed payload.
  const hex = keyHex(key);
  const checked = await checkKey(hex, row.machine_id, row.expires_at);   // a row with an end carries it
  if (checked.error) return { error: checked.error };
  const lines = keyLines(hex);
  const serial = checked.serial;
  const ent = await env.DB.prepare('SELECT plan FROM entitlements WHERE id = ?').bind(row.entitlement_id).first().catch(() => null);
  const monthly = !!ent && isMonthly(ent.plan);
  // Pro Monthly: the renewal code goes out with the first key and stays the same after (the app
  // keeps it, and fetches every later key with it).
  const code = monthly ? (row.renew_code || (await subsMod()).newRenewCode()) : null;
  const renewal = row.status === 'renewing';
  const res = await env.DB.prepare(
    "UPDATE streamdaw_activations SET status = 'issued', key_text = ?, serial = ?, issued_at = ?" + (monthly ? ', renew_code = ?' : '') + ' WHERE id = ?'
    + (onlyPending ? " AND status IN ('pending','renewing')" : '')
  ).bind(...[lines, serial, now(), ...(monthly ? [code] : []), row.id]).run();
  if (onlyPending && !(res.meta && res.meta.changes)) return { error: 'not pending any more', code: 409 };
  // A month renewed: the app picks the key up by itself, and the month's receipt already went out.
  if (monthly && renewal && row.renew_code) return { ok: true, quiet: true };

  const hi = firstName(row.owner_name);
  const box = withRenewal(lines, code);
  const n = box.split('\n').filter(Boolean).length;
  const until = row.expires_at ? dayOf(row.expires_at) : '';
  const subs = monthly ? await subsMod() : null;
  const what = monthly ? 'StreamDAW Pro Monthly key' : until ? `StreamDAW Pro key (until ${until})` : 'StreamDAW Pro key';
  const minApp = until ? PASS_MIN_APP : MIN_APP;
  const copy = monthly ? `Copy everything in the box below (all ${n} lines: the key and its Renewal line) and paste it into the box.`
                       : `Copy the key below (all ${n} lines) and paste it into the box.`;
  const renewText = monthly ? `Pro Monthly: this key runs to ${until}, 3 days past the month you paid for. StreamDAW ${subs.RENEW_APP} or newer fetches the next one by itself every month while it is online (that is what the Renewal line is for). Manage or cancel: ${subs.MANAGE_URL}\n`
    : until ? `Every Pro feature until ${until}; then StreamDAW goes back to Free.\n` : '';
  const renewHtml = monthly ? `This key runs to ${until}, 3 days past the month you paid for. StreamDAW ${subs.RENEW_APP} or newer fetches the next one by itself every month while it is online: that is what the Renewal line is for. <a href="${subs.MANAGE_URL}">Manage or cancel</a>.<br>`
    : until ? `After ${until} StreamDAW goes back to Free.<br>` : '';
  try {
    await sendMail(env, {
      to: row.email,
      subject: monthly ? 'Your StreamDAW Pro Monthly key' : until ? `Your StreamDAW Pro key, until ${until}` : 'Your StreamDAW Pro key',
      text: `${hi ? `Hi ${hi}, your` : 'Your'} ${what} is ready.\n\n`
          + `1. Open StreamDAW › Settings › Licence.\n`
          + `2. ${copy}\n`
          + `3. Press Unlock.\n\n`
          + `${box}\n\n`
          + `Registered to: ${row.owner_name || row.email} · ${row.email}\n`
          + (serial ? `Serial: ${serial}\n` : '')
          + `Works on this Mac only: ${row.machine_id}\n`
          + renewText
          + `Needs StreamDAW ${minApp} or newer. Older copy? Download the latest from your account first: ${ACCOUNT_URL}\n`
          + `Another Mac? Get a key for it here: ${UNLOCK_URL}\n`
          + `Keep this email: it is your licence. Lost it? The same page shows your keys when you sign in.\n\n${mailLinksText()}\n\n— Snowstar.Company`,
      html: licenceMail({
        title: monthly ? 'Your Pro Monthly key' : 'Your StreamDAW Pro key',
        intro: `${hi ? `Hi ${escHtml(hi)}, your` : 'Your'} key is ready${until ? `: every Pro feature until <b>${until}</b>` : ''}.`,
        steps: [
          'Open <b>StreamDAW › Settings › Licence</b>.',
          monthly ? `Copy everything in the box below (all ${n} lines: the key <b>and its Renewal line</b>) and paste it into the box.`
                  : `Copy the key below (all ${n} lines) and paste it into the box.`,
          'Press <b>Unlock</b>.',
        ],
        key: box,
        footer: `Registered to <b>${escHtml(row.owner_name || row.email)}</b> · ${escHtml(row.email)}<br>`
          + (serial ? `Serial <code>${escHtml(serial)}</code><br>` : '')
          + `Works on this Mac only: <code>${escHtml(row.machine_id)}</code><br>`
          + renewHtml
          + `Needs StreamDAW ${minApp} or newer. Older copy? <a href="${ACCOUNT_URL}">Download the latest</a> from your account first.<br>`
          + `Another Mac? <a href="${UNLOCK_URL}">Get a key for it</a>.<br>`
          + `Keep this email: it is your licence. Lost it? <a href="${UNLOCK_URL}">Sign in</a> to see your keys.`,
      }),
    });
  } catch {}
  return { ok: true };
}

/* A Pro Monthly key as it is shown and pasted: the key, then its Renewal line. The line starts
   with a letter that is not hex ("R"), so every app version's paste cleaning (the longest stretch
   of hex) still finds the key alone; 0.5.6 on also keeps the code. */
const withRenewal = (lines, code) => (code ? `${lines}\n\nRenewal: ${code}` : lines);

/* Sign one request here, with the Worker's pair (streamdaw-keys.js), and send it as issueKey does
   (checked again there like every key). `override`: the owner letting a request through by hand
   (a Mac over the limit), which may also replace a key already sent. No secret: nothing happens,
   the request waits for the minter or the owner. */
async function autoIssue(env, row, override = false) {
  if (!env.STREAMDAW_SIGNING_KEY) return { error: 'no STREAMDAW_SIGNING_KEY in this Worker' };
  const name = row.owner_name || String(row.email || '').split('@')[0] || 'StreamDAW user';
  const minted = await mintKey(env.STREAMDAW_SIGNING_KEY, { name, email: row.email, machine: row.machine_id, expiresAt: row.expires_at });
  if (minted.error) return minted;
  return issueKey(env, row, minted.hex, !override);
}

/** Everything that may go out by itself and still waits — a Mac within MAX_MACS, a Pro Monthly key
 *  a paid renewal moved on ('renewing') — signed now: for one purchase after its renewal
 *  (streamdaw-subs.js, monthPaid), and for all once a day (the cron) for anything a failure left. */
export async function mintWaiting(env, entitlementId = null) {
  if (!env.STREAMDAW_SIGNING_KEY) return { signed: 0, errors: [] };
  const rows = (await env.DB.prepare(
    `SELECT a.* FROM streamdaw_activations a
      WHERE (?1 IS NULL OR a.entitlement_id = ?1)
        AND (a.status = 'renewing'
             OR (a.status = 'pending'
                 AND (SELECT COUNT(*) FROM streamdaw_activations b
                       WHERE b.entitlement_id = a.entitlement_id AND b.status IN ('issued','renewing')) < ?2))
      ORDER BY a.requested_at ASC LIMIT 50`
  ).bind(entitlementId, MAX_MACS).all()).results || [];
  let signed = 0;
  const errors = [];
  for (const row of rows) {
    const r = await autoIssue(env, row);
    if (r.ok) signed++; else errors.push(`#${row.id} ${row.machine_id}: ${r.error}`);
  }
  if (errors.length) {
    try {
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: `[Admin] StreamDAW: ${errors.length} key(s) the Worker could not sign`,
        text: `ADMIN NOTE. These wait in the dashboard (StreamDAW › Keys):\n\n${errors.join('\n')}` });
    } catch {}
  }
  return { signed, errors };
}

/** POST /streamdaw/deactivate {machineId} — the buyer frees one of their MAX_MACS places, to put
 *  StreamDAW on another Mac. The key on that Mac cannot be recalled (keys work offline): a
 *  permanent key goes on working there, a key with an end runs to its end; a Pro Monthly key is
 *  not renewed any more (its renewal code goes). */
export async function streamdawDeactivate(req, env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);
  let body = {};
  try { body = await req.json(); } catch {}
  const machine = normMachine(body.machineId);
  if (!machine) return json({ error: 'That does not look like a machine ID.' }, 400);
  const sql = (renew) =>
    `UPDATE streamdaw_activations SET status = 'deactivated'${renew ? ', renew_code = NULL' : ''}
      WHERE machine_id = ? AND status IN ('issued','renewing','pending','limit')
        AND entitlement_id IN (SELECT id FROM entitlements WHERE product = ? AND (user_id = ? OR email = ?))`;
  let res;
  try { res = await env.DB.prepare(sql(true)).bind(machine, PRODUCT, user.id, lc(user.email)).run(); }
  catch (e) {
    if (!/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    res = await env.DB.prepare(sql(false)).bind(machine, PRODUCT, user.id, lc(user.email)).run();
  }
  if (!(res.meta && res.meta.changes)) return json({ error: 'That Mac has no key on this account.' }, 404);
  return json({ ok: true, status: 'deactivated' });
}

// ── the minter: keys made on the owner's Mac, within a minute ─────────────
//
// The private key never leaves the owner's Mac, so a Worker cannot sign. Instead a small job
// there (STREAMDAW repo: scripts/licence-minter.mjs, run by launchd every 30 s) asks for the
// requests waiting, signs each with the local keygen, and hands the key back; the buyer is
// emailed at once. It authenticates with MINTER_TOKEN (a Worker secret, the same value in
// ~/.cache/streamdaw/minter.env on the Mac). Without the secret these routes are closed.
//
// Since 2026-10-15 the Worker signs (autoIssue, below); the minter stays usable until it is
// retired, and finds nothing waiting while the Worker signs.
//
// At most MAX_MACS Macs per purchase, a hard limit (Ori, 2026-10-15): a further Mac is refused
// ('limit') until one is deactivated, so one payment cannot quietly unlock a classroom; the owner
// may let one through from the dashboard.
const MAX_MACS = 2;

function minterAuthorised(req, env) {
  const want = String(env.MINTER_TOKEN || '');
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return want.length >= 32 && safeEqual(got, want);
}

/** GET /streamdaw/minter/pending — the requests the minter may sign now: a buyer's first
 *  MAX_MACS Macs, and every Pro Monthly key that a paid renewal moved on ('renewing': a Mac
 *  that already had a key, so no new Mac and no owner to ask). */
export async function streamdawMinterPending(req, env) {
  if (!minterAuthorised(req, env)) return json({ error: 'forbidden' }, 403);
  const rows = (await env.DB.prepare(
    `SELECT a.id, a.email, a.machine_id, a.owner_name, a.expires_at
       FROM streamdaw_activations a
      WHERE a.status = 'renewing'
         OR (a.status = 'pending'
             AND (SELECT COUNT(*) FROM streamdaw_activations b
                   WHERE b.entitlement_id = a.entitlement_id AND b.status IN ('issued','renewing')) < ?)
      ORDER BY a.requested_at ASC LIMIT 20`
  ).bind(MAX_MACS).all()).results || [];
  return json({ requests: rows });
}

/** POST /streamdaw/minter/issue {id, key} — a key the minter signed. */
export async function streamdawMinterIssue(req, env) {
  if (!minterAuthorised(req, env)) return json({ error: 'forbidden' }, 403);
  let body = {};
  try { body = await req.json(); } catch {}
  const row = await env.DB.prepare('SELECT * FROM streamdaw_activations WHERE id = ?').bind(Number(body.id || 0)).first();
  if (!row) return json({ error: 'no such request' }, 404);
  // The signed key carries the machine and the name it was made for; check the minter signed
  // what was asked (a bug there must not email one buyer a key for someone else's Mac).
  if (String(body.machine || '') !== row.machine_id) return json({ error: 'machine mismatch' }, 409);
  const r = await issueKey(env, row, String(body.key || ''), true);
  return json(r.error ? { error: r.error } : { ok: true }, r.error ? (r.code || 400) : 200);
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

  // A keyed tag of the address (crypto.js ipTag), never the address or a plain hash of it.
  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await ipTag(env, ip, 'sdreport') : null;

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
async function grantEntitlement(env, { email, ext_ref, amount, plan, source, expiresAt }) {
  const existing = await env.DB.prepare('SELECT * FROM entitlements WHERE ext_ref = ?').bind(ext_ref).first();
  if (existing) return existing;
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(lc(email)).first();
  // Pro does not end. Pro Monthly ends with its key (the caller says when); a pass sold before
  // 2026-10-14 ends 7 days after its payment.
  if (expiresAt == null) expiresAt = isPass(plan) ? now() + PASS_DAYS * 86400 : null;
  const ins = await env.DB.prepare(
    `INSERT INTO entitlements (user_id, email, product, plan, status, source, ext_ref, amount, currency, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 'ILS', ?, ?)`
  ).bind(u?.id || null, lc(email), PRODUCT, plan, source || 'hyp', ext_ref, amount, now(), expiresAt).run();
  return { id: ins.meta.last_row_id, email: lc(email), plan, expires_at: expiresAt };
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

function emailReceipt(env, to, link, machine, order) {
  const o = order || {};
  const pass = isPass(o.plan);
  const until = pass && o.expiresAt ? dayOf(o.expiresAt) : '';
  // Only a pass ordered before 2026-10-14 and paid after it can still land here: a plain receipt.
  const subject = pass ? 'Your StreamDAW Pro (7 days): receipt and download' : 'Your StreamDAW Pro receipt and download';
  const soon = env.MINTER_TOKEN ? 'usually within minutes' : 'usually within a day';
  const paid = typeof o.amount === 'number' ? (o.amount > 0 ? `₪${(o.amount / 100).toFixed(2)}` : (o.credit ? 'nothing more (your pass covered it)' : 'free (coupon)')) : '';
  const when = new Date().toISOString().slice(0, 10);
  const lines = [
    o.ref ? `Order: ${o.ref}` : '',
    pass ? `Product: StreamDAW Pro for 7 days, every Pro feature until ${until}, no renewal`
         : `Product: StreamDAW Pro, one payment, every StreamDAW 1 update included`,
    paid ? `Paid: ${paid}${o.coupon ? ` (coupon ${o.coupon})` : ''}${o.credit ? ` (₪${(o.credit / 100).toFixed(2)} from your pass taken off)` : ''}` : '',
    `Date: ${when}`,
  ].filter(Boolean);
  const keyWord = 'Pro key';
  const keyLine = machine
    ? `Your ${keyWord} for this Mac (${machine}) is being made now. It arrives in a second email, ${soon}: paste it into StreamDAW › Settings › Licence and press Unlock.`
    : `Get your ${keyWord} for each Mac you use on ${UNLOCK_URL} (sign in with this email).`;
  const upgrade = '';
  const text =
`Thanks for getting ${pass ? 'StreamDAW Pro for 7 days' : 'StreamDAW Pro'}.

${lines.join('\n')}

Download (a private link, good for 7 days; after that, from your account):
${link}

${keyLine}
${upgrade ? `\n${upgrade}\n` : ''}
Then: install the .pkg (StreamDAW ${pass ? PASS_MIN_APP : MIN_APP} or newer), open your DAW, put StreamDAW on the master bus, press GO LIVE.

${mailLinksText()}

— Snowstar.Company`;
  const html = licenceMail({
    title: pass ? `StreamDAW Pro until ${until}` : 'Welcome to StreamDAW Pro',
    intro: pass ? `Thanks: every Pro feature until <b>${until}</b>. Your download is below; your key follows.`
                : 'Thanks for getting StreamDAW Pro. Your download is below; your key follows.',
    steps: [
      'Download StreamDAW and install the .pkg.',
      escHtml(keyLine),
      'Open your DAW, put StreamDAW on the master bus, press <b>GO LIVE</b>.',
    ],
    button: { href: link, label: 'Download StreamDAW' },
    footer: lines.map(escHtml).join('<br>') + '<br>The download link is private to you and good for 7 days; after that, download from <a href="' + ACCOUNT_URL + '">your account</a>.',
  });
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
    activations: (await soft(
      `SELECT a.id, a.email, a.machine_id, a.owner_name, a.status, a.serial,
              a.requested_at, a.issued_at, a.expires_at
         FROM streamdaw_activations a
        ORDER BY (a.status IN ('pending','renewing','limit')) DESC, a.requested_at ASC LIMIT 100`))
      // The command for "by hand", the same as the [Admin] email's: the v2 pair, and the end a key
      // must carry (Pro Monthly, a pass), which the Worker checks before emailing it.
      .map((a) => ({ ...a, mint: mintCommand({ name: a.owner_name || a.email, email: a.email, machine: a.machine_id, expiresAt: a.expires_at }) })),

    /* Pro Monthly: every subscription, its charges, MRR, charges HYP never answered, refunds owed. */
    ...(await (await subsMod()).subsAdmin(env).catch(() => ({}))),

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

// ── Live links: https://snowstar.company/live/<id> (2026-10-13, "stream without you", phase 2) ──
//
// Every customer's Mac runs its own relay and reaches the internet through a Cloudflare QUICK
// tunnel, whose https://<four-words>.trycloudflare.com address is new each time the tunnel
// starts. A QR code on that address dies with it. So the relay registers its current address
// here under an id of its own, and the link it hands out is /live/<id>/s/<session>: online, a
// 302 to the tunnel with the same path and query; offline, a small page that waits and goes on
// by itself when the Mac is back. (The relay side: server/livelink.js in the StreamDAW repo.)
//
// No accounts, and no Snowstar secret on anyone's Mac. What the Mac has:
//   - the id (10 characters) and a secret (32 random bytes) it made on its first run. The
//     first registration of an id claims it (we keep sha256 of the secret); after that only
//     the same secret moves it;
//   - its machine: sha256("streamdaw-live:" + the licence machine id), made on the Mac. The same
//     id from another machine (a copied install) is refused with 409, and that Mac makes its
//     own: one id, one Mac.
// The address must be a quick tunnel's (https, one label of words, *.trycloudflare.com, no path):
// /live/ never sends anyone anywhere else. Rate limited per IP and per id (`attempts`).
// Blocking a link (abuse): UPDATE streamdaw_live SET status = 'blocked' WHERE id = '…'.
// Schema: schema-streamdaw-live.sql. Route: wrangler.toml snowstar.company/live/*.

const LIVE_ID = /^[a-hjkmnp-z2-9]{10}$/;
const LIVE_URL = /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com$/;
const LIVE_MACHINE = /^[0-9a-f]{64}$/;
const LIVE_REST = /^(\/[A-Za-z0-9._~%!$&'()*+,;=:@-]*)*$/;
const LIVE_KEEP_DAYS = 180;
const liveProbes = new Map();          // id -> { url, ok, at }: one look at a Mac per 2 s per isolate

async function liveThrottle(env, bucket, max, windowSec) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE bucket = ?').bind(bucket).first();
  if (row && row.reset_at > t) {
    if (row.count >= max) return row.reset_at - t;
    await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE bucket = ?').bind(bucket).run();
  } else {
    await env.DB.prepare('INSERT INTO attempts (bucket, count, reset_at) VALUES (?, 1, ?) '
      + 'ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = excluded.reset_at').bind(bucket, t + windowSec).run();
  }
  return 0;
}

/** POST /api/streamdaw/live/register  {id, machine, url|null, app?, relay?}, Authorization: Bearer <secret>.
 *  From a relay (no Origin, no cookie: CSRF-exempt in index.js). */
export async function streamdawLiveRegister(req, env) {
  let b = {};
  try { b = await req.json(); } catch {}
  const id = String(b.id || ''), machine = String(b.machine || '');
  const secret = (String(req.headers.get('authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{40,100})$/) || [])[1] || '';
  const url = b.url === null || b.url === undefined || b.url === '' ? null : String(b.url).replace(/\/+$/, '');
  if (!LIVE_ID.test(id)) return json({ error: 'bad_id' }, 400);
  if (!LIVE_MACHINE.test(machine)) return json({ error: 'bad_machine' }, 400);
  if (!secret) return json({ error: 'no_secret' }, 401);
  if (url !== null && (url.length > 120 || !LIVE_URL.test(url))) return json({ error: 'bad_url', hint: 'https://<name>.trycloudflare.com only' }, 400);
  const ver = (v) => (typeof v === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(v) ? v : null);

  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await ipTag(env, ip, 'sdlive') : 'none';     // keyed (crypto.js), never reversible
  let wait = await liveThrottle(env, 'sdlive-ip:' + ipHash, 120, 3600);
  if (wait) return json({ error: 'slow_down', retryAfter: wait }, 429);

  const secretHash = await sha256b64(secret);
  const t = now();
  let row = await env.DB.prepare('SELECT id, secret_hash, machine_hash, status FROM streamdaw_live WHERE id = ?').bind(id).first();
  if (!row) {
    wait = await liveThrottle(env, 'sdlive-new:' + ipHash, 10, 3600);       // new ids per network
    if (wait) return json({ error: 'slow_down', retryAfter: wait }, 429);
    const ins = await env.DB.prepare(
      `INSERT INTO streamdaw_live (id, secret_hash, machine_hash, url, url_at, status, app_version, relay_version, created_at, updated_at, ip_hash)
       VALUES (?, ?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
    ).bind(id, secretHash, machine, url, url ? t : null, ver(b.app), ver(b.relay), t, t, ipHash).run();
    if (ins.meta && ins.meta.changes === 1) { liveProbes.delete(id); return json({ ok: true, id, link: `${SITE}/live/${id}`, created: true }); }
    row = await env.DB.prepare('SELECT id, secret_hash, machine_hash, status FROM streamdaw_live WHERE id = ?').bind(id).first();   // lost a race
    if (!row) return json({ error: 'server_error' }, 500);
  }
  if (!safeEqual(secretHash, row.secret_hash)) return json({ error: 'taken' }, 403);
  if (machine !== row.machine_hash) return json({ error: 'machine' }, 409);
  if (row.status === 'blocked') return json({ error: 'blocked' }, 403);
  wait = await liveThrottle(env, 'sdlive-id:' + id, 60, 3600);
  if (wait) return json({ error: 'slow_down', retryAfter: wait }, 429);
  await env.DB.prepare(
    `UPDATE streamdaw_live SET url = ?, url_at = ?, app_version = COALESCE(?, app_version), relay_version = COALESCE(?, relay_version),
       updated_at = ?, ip_hash = ? WHERE id = ?`
  ).bind(url, url ? t : null, ver(b.app), ver(b.relay), t, ipHash, id).run();
  liveProbes.delete(id);
  return json({ ok: true, id, link: `${SITE}/live/${id}` });
}

/* Is the Mac there? Its relay answers /info on the tunnel (JSON with a publicBase). A tunnel
   that is gone answers with Cloudflare's error page (530/1033), or not at all. */
async function liveOnline(id, url) {
  const c = liveProbes.get(id);
  if (c && c.url === url && Date.now() - c.at < 2000) return c.ok;
  let ok = false;
  try {
    const r = await fetch(url + '/info', { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(2500) });
    if (r.ok) { const j = await r.json(); ok = !!j && typeof j.publicBase === 'string'; }
  } catch {}
  if (liveProbes.size > 500) liveProbes.clear();
  liveProbes.set(id, { url, ok, at: Date.now() });
  return ok;
}

async function liveRow(env, id) {
  if (!LIVE_ID.test(id)) return null;
  return env.DB.prepare('SELECT id, url, status FROM streamdaw_live WHERE id = ?').bind(id).first();
}

/** GET /api/streamdaw/live/<id>: {ok, online, url?} — what the waiting page asks. */
export async function streamdawLiveStatus(req, env, id) {
  const row = await liveRow(env, id);
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.status === 'blocked') return json({ error: 'gone' }, 410);
  const online = !!row.url && await liveOnline(id, row.url);
  return json(online ? { ok: true, online, url: row.url } : { ok: true, online: false });
}

function livePage(status, title, text, wait) {
  const nonce = urlToken(16);
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + `<title>${esc(title)} · StreamDAW</title><style>html,body{margin:0;min-height:100%;background:#12110e;color:#f3eddc;`
    + 'font:400 16px/1.5 Inter,system-ui,-apple-system,sans-serif}body{display:grid;place-content:center;text-align:center;padding:28px;min-height:100vh;box-sizing:border-box}'
    + 'h1{font:600 22px/1.3 Georgia,serif;margin:0 0 10px}p{margin:0 auto 8px;max-width:30em;color:#cfc7b2}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;'
    + 'background:#c8f04a;margin-right:8px;animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.25}}small{color:#8d8572}</style></head><body>'
    + `<h1>${wait ? '<span class="dot" aria-hidden="true"></span>' : ''}${esc(title)}</h1><p>${esc(text)}</p>`
    + (wait ? '<p><small id="s">Checking…</small></p>' : '')
    + (wait ? `<script nonce="${nonce}">(function(){var w=${js(wait)},n=0,s=document.getElementById('s');`
      + 'function go(u){location.replace(u+w.rest+w.q+location.hash);}'
      + 'function look(){fetch(w.api,{cache:"no-store"}).then(function(r){return r.json();}).then(function(j){'
      + 'if(j&&j.online&&/^https:\\/\\/[a-z0-9-]+\\.trycloudflare\\.com$/.test(j.url))return go(j.url);'
      + 'if(j&&j.error==="gone"){s.textContent="This link has been switched off.";return;}'
      + 's.textContent="Still waiting · checked "+new Date().toLocaleTimeString();next();})'
      + '.catch(function(){s.textContent="No answer · trying again";next();});}'
      + 'function next(){n++;setTimeout(look,n<75?4000:15000);}look();})();</script>' : '')
    + '</body></html>';
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; `
        + "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}

/** GET /live/<id>[/<path>][?query]: on to the Mac's tunnel, or a page that waits for it.
 *  /live/<id>/signin: a listener's sign-in for that Mac's sessions (liveSignin). */
export async function streamdawLivePage(req, env, url) {
  const m = url.pathname.match(/^\/live\/([^/]+)(\/.*)?$/);
  const id = m ? m[1].toLowerCase() : '';
  const rest = (m && m[2] ? m[2] : '').replace(/\/{2,}/g, '/');
  if (m && rest === '/signin') return liveSignin(req, env, url, id);
  const q = url.search.length <= 1024 ? url.search : '';
  const row = m && rest.length <= 512 && LIVE_REST.test(rest) ? await liveRow(env, id) : null;
  if (!row) return livePage(404, 'No such StreamDAW link', 'Check the link you were sent, or ask the studio for a new one.', null);
  if (row.status === 'blocked') return livePage(410, 'This link is switched off', 'Ask the studio for a new one.', null);
  if (row.url && await liveOnline(id, row.url)) {
    return new Response(null, { status: 302, headers: { location: row.url + (rest || '/') + q, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }
  return livePage(200, 'The studio is not on air yet', 'Keep this page open: it opens the session by itself as soon as the studio is back.',
    { api: `/api/streamdaw/live/${id}`, rest: rest || '/', q });
}

/** The daily cron: links unseen for half a year, and their rate-limit rows; TURN credentials past their end. */
export async function streamdawLiveCleanup(env) {
  await env.DB.prepare('DELETE FROM streamdaw_live WHERE updated_at < ?').bind(now() - LIVE_KEEP_DAYS * 86400).run();
  await env.DB.prepare("DELETE FROM attempts WHERE bucket LIKE 'sdlive%' AND reset_at < ?").bind(now()).run();
  await env.DB.prepare('DELETE FROM streamdaw_turn WHERE expires_at < ?').bind(now()).run().catch(() => null);   // before its migration: no table
}

// ── Sign-in for a customer's sessions: /live/<id>/signin (2026-10-15) ──
// The listener's page is on the Mac's tunnel (another site), so it sends the listener here, a
// top-level page on snowstar.company where the session cookie goes. Signed in, they are asked
// once ("Join as <name>": the studio will see the name; nothing goes to a studio without that
// click, and no other page can click it: same-origin POST, no framing). Then back through the
// live link, /live/<id><to>#sdaw_pt=<token>: the fragment rides the 302 to the tunnel (or the
// waiting page) and is never sent to a server; the page takes it out of the address bar. `to` is
// only ever a path on this live link: nobody is sent anywhere else. The POST answers with a page
// that goes there (location.replace), not a 303: a redirect chain started by a form is held to
// the form-action of the page (CSP 'self'), and the chain ends on the tunnel, another origin.
function liveBack(raw) {
  const s = String(raw || '/');
  if (s.length > 1600 || s[0] !== '/' || s.startsWith('//') || /[\\\s#]/.test(s)) return '/';
  let u;
  try { u = new URL(s, 'https://back.invalid'); } catch { return '/'; }
  if (u.origin !== 'https://back.invalid' || u.pathname.length > 512 || !LIVE_REST.test(u.pathname) || u.search.length > 1024) return '/';
  const p = u.pathname.replace(/\/{2,}/g, '/');
  return (p === '/signin' ? '/' : p) + u.search;
}
// referrer-policy same-origin, not no-referrer: with no-referrer a browser sends "Origin: null" on
// the page's own form post (Fetch: serializing a request origin), and the check below needs it.
function signinPage(status, { title, text, name = null, action = null, back = null, wait = false, go = null }) {
  const nonce = urlToken(16);
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + `<title>${esc(title)} · StreamDAW</title><style>html,body{margin:0;min-height:100%;background:#12110e;color:#f3eddc;`
    + 'font:400 16px/1.5 Inter,system-ui,-apple-system,sans-serif}body{display:grid;place-content:center;text-align:center;padding:28px;min-height:100vh;box-sizing:border-box}'
    + 'h1{font:600 22px/1.3 Georgia,serif;margin:0 0 10px}p{margin:0 auto 12px;max-width:30em;color:#cfc7b2}'
    + '.btn{display:inline-block;font:600 16px/1 Inter,system-ui,sans-serif;background:#c8f04a;color:#12110e;border:0;border-radius:999px;padding:14px 22px;cursor:pointer;text-decoration:none;margin:6px}'
    + 'a.alt{color:#cfc7b2;display:inline-block;margin-top:10px}small{color:#8d8572}</style></head><body>'
    + `<h1>${esc(title)}</h1><p>${esc(text)}</p>`
    + (action ? `<form method="post" action="${esc(action)}"><button class="btn" type="submit">Continue as ${esc(name)}</button></form>` : '')
    + (wait ? '<p><a class="btn" id="go" href="/apps/streamdaw.html?signin=1" target="_blank" rel="opener">Sign in or create an account</a></p>'
      + '<p><small id="s">Signed in? Come back to this tab: it goes on by itself.</small></p>' : '')
    + (back ? `<p><a class="alt" href="${esc(back)}">Not now: back to the session</a></p>` : '')
    + (go ? `<p><a class="btn" id="go" href="${esc(go)}">Back to the session</a></p><script nonce="${nonce}">location.replace(document.getElementById('go').href);</script>` : '')
    + (wait ? `<script nonce="${nonce}">(function(){var busy=false;function look(){if(busy)return;busy=true;`
      + 'fetch("/api/me",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){busy=false;if(j&&j.user)location.reload();})'
      + '.catch(function(){busy=false;});}setInterval(look,2500);document.addEventListener("visibilitychange",function(){if(!document.hidden)look();});'
      + 'window.addEventListener("focus",look);})();</script>' : '')
    + '</body></html>';
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; `
        + "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    },
  });
}
async function liveSignin(req, env, url, id) {
  const row = await liveRow(env, id);
  if (!row) return livePage(404, 'No such StreamDAW link', 'Check the link you were sent, or ask the studio for a new one.', null);
  if (row.status === 'blocked') return livePage(410, 'This link is switched off', 'Ask the studio for a new one.', null);
  const to = liveBack(url.searchParams.get('to'));
  const back = `/live/${id}${to}`;
  const action = `/live/${id}/signin?to=${encodeURIComponent(to)}`;
  if (!env.PRESENCE_SIGNING_KEY) return signinPage(501, { title: 'Sign-in is not available yet', text: 'Join the session without signing in, or ask the studio.', back });
  const user = await currentUser(req, env);
  if (req.method === 'POST') {
    // Only this page's own button: a form posted from anywhere else is refused (and carries no
    // Lax cookie anyway). Its Origin, or (a browser that sends "null") Sec-Fetch-Site.
    const origin = req.headers.get('origin') || '';
    const mine = origin === url.origin || ((origin === '' || origin === 'null') && req.headers.get('sec-fetch-site') === 'same-origin');
    if (!mine) return signinPage(403, { title: 'Start again from the session', text: 'This sign-in did not come from this page.', back });
    if (!user) return signinPage(200, { title: 'Sign in to join', text: 'This studio asks listeners to sign in with Snowstar.', back, wait: true });
    const wait = await liveThrottle(env, 'sdlive-signin:' + user.id, 60, 3600);
    if (wait) return signinPage(429, { title: 'Too many sign-ins', text: 'Wait a few minutes, then try again.', back });
    const token = await signPresenceJwt(env, {
      name: presenceName(user), sub: 'p' + await ipTag(env, String(user.id) + '|' + id, 'sdpresence'), aud: id, exp: now() + PRESENCE_SITTING_S });
    if (!token) return signinPage(501, { title: 'Sign-in is not available yet', text: 'Join the session without signing in, or ask the studio.', back });
    return signinPage(200, { title: 'Signed in', text: 'Going back to the session…', go: `${url.origin}${back}#sdaw_pt=${token}` });
  }
  if (!user) return signinPage(200, { title: 'Sign in to join', text: 'This studio asks listeners to sign in with Snowstar.', back, wait: true });
  return signinPage(200, { title: 'Join this session', text: 'The studio running this StreamDAW session will see your name. Your email stays with Snowstar.',
                           name: presenceName(user), action, back });
}

// ── TURN for a customer's Mac: POST /api/streamdaw/turn (2026-10-15) ──
// Video and talkback between a studio and a guest on cellular or behind a carrier's NAT need a
// TURN relay. Ori's relay mints Cloudflare TURN credentials from his own keys (turn.env); a
// customer's Mac has no keys and must never get them. So the Mac's relay asks here, proving which
// Mac it is with its live link (id + secret as the bearer + machine, the way a registration does:
// every Mac has one, Free or Pro). The keys are Worker secrets, STREAMDAW_TURN_KEY_ID and
// STREAMDAW_TURN_API_TOKEN (the names Ori's turn.env uses). The answer: credentials made for this
// Mac by Cloudflare's generate-ice-servers (developers.cloudflare.com/realtime/turn/generate-credentials,
// read 2026-10-15: POST, ttl in seconds, at most 48 h; an allocation is cut soon after its
// credential ends), 24 h, and the SAME ones again while they have 9 h or more left (cached per Mac
// for 15 of their 24 h, streamdaw_turn: schema-streamdaw-turn.sql). refreshAt (8 h before the
// end) is when the relay asks again, so a peer made just before still has 8 h. Port 53 URLs are
// dropped (browsers block them: Cloudflare's note). Rate limited per Mac and per network.
const TURN_TTL_S = 24 * 3600;
const TURN_REUSE_S = 9 * 3600;
const TURN_REFRESH_S = 8 * 3600;
const CF_RTC = 'https://rtc.live.cloudflare.com/v1';

function iceList(v) {
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
  const out = [];
  for (const s of arr) {
    if (!s || typeof s !== 'object') continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls])
      .filter((u) => typeof u === 'string' && u.length < 200 && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    const e = { urls };
    if (s.username) { e.username = String(s.username); e.credential = String(s.credential || ''); }
    out.push(e);
  }
  return out.slice(0, 4);
}

/** POST /api/streamdaw/turn {id, machine}, Authorization: Bearer <live secret> → {ok, iceServers,
 *  expiresAt, refreshAt, cached}. From a relay (no Origin, no cookie: CSRF-exempt in index.js). */
export async function streamdawTurn(req, env) {
  let b = {};
  try { b = await req.json(); } catch {}
  const id = String(b.id || ''), machine = String(b.machine || '');
  const secret = (String(req.headers.get('authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{40,100})$/) || [])[1] || '';
  if (!LIVE_ID.test(id)) return json({ error: 'bad_id' }, 400);
  if (!LIVE_MACHINE.test(machine)) return json({ error: 'bad_machine' }, 400);
  if (!secret) return json({ error: 'no_secret' }, 401);
  if (!env.STREAMDAW_TURN_KEY_ID || !env.STREAMDAW_TURN_API_TOKEN) return json({ error: 'turn_not_configured' }, 501);

  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await ipTag(env, ip, 'sdlive') : 'none';
  let wait = await liveThrottle(env, 'sdlive-turnip:' + ipHash, 240, 3600);
  if (wait) return json({ error: 'slow_down', retryAfter: wait }, 429);
  const row = await env.DB.prepare('SELECT id, secret_hash, machine_hash, status FROM streamdaw_live WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'unknown' }, 403);
  if (!safeEqual(await sha256b64(secret), row.secret_hash)) return json({ error: 'auth' }, 403);
  if (machine !== row.machine_hash) return json({ error: 'machine' }, 409);
  if (row.status === 'blocked') return json({ error: 'blocked' }, 403);
  wait = await liveThrottle(env, 'sdlive-turn:' + id, 30, 3600);
  if (wait) return json({ error: 'slow_down', retryAfter: wait }, 429);

  const t = now();
  const kept = await env.DB.prepare('SELECT ice_json, expires_at FROM streamdaw_turn WHERE id = ?').bind(id).first().catch(() => null);
  if (kept && kept.expires_at - t >= TURN_REUSE_S) {
    let ice = [];
    try { ice = iceList(JSON.parse(kept.ice_json)); } catch {}
    if (ice.length) return json({ ok: true, iceServers: ice, expiresAt: kept.expires_at, refreshAt: kept.expires_at - TURN_REFRESH_S, cached: true });
  }
  // New credentials: a handful a day per Mac at most (the cache makes it one every 15 h).
  wait = await liveThrottle(env, 'sdlive-turnmint:' + id, 6, 86400);
  if (wait) return json({ error: 'slow_down', retryAfter: Math.min(wait, 3600) }, 429);
  let r;
  try {
    r = await fetch(`${CF_RTC}/turn/keys/${encodeURIComponent(env.STREAMDAW_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.STREAMDAW_TURN_API_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_S }),
      signal: AbortSignal.timeout(6000),
    });
  } catch { return json({ error: 'turn_upstream', status: 0 }, 502); }
  if (!r.ok) return json({ error: 'turn_upstream', status: r.status }, 502);
  let j = {};
  try { j = await r.json(); } catch {}
  const ice = iceList(j && j.iceServers);
  if (!ice.some((x) => x.username)) return json({ error: 'turn_upstream', status: r.status }, 502);
  const expiresAt = t + TURN_TTL_S;
  const username = (ice.find((x) => x.username) || {}).username || null;
  await env.DB.prepare(
    `INSERT INTO streamdaw_turn (id, ice_json, username, expires_at, minted_at, mints) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET ice_json = excluded.ice_json, username = excluded.username, expires_at = excluded.expires_at,
       minted_at = excluded.minted_at, mints = mints + 1`
  ).bind(id, JSON.stringify(ice), username, expiresAt, t).run().catch(() => null);
  return json({ ok: true, iceServers: ice, expiresAt, refreshAt: expiresAt - TURN_REFRESH_S, cached: false });
}

// For streamdaw-subs.js (Pro Monthly), which builds on the same orders, keys and emails.
export { licenceMail, mailLinksText, escHtml, firstName, grantEntitlement, mintDownloadLink, requestKey, insertOrder,
         keyHex, keyLines, normMachine, hypConfigured, liveThrottle, payPageParams,
         SITE, ACCOUNT_URL, UNLOCK_URL, TERMS_URL, HELP_MAIL, BASE as HYP_PAGE, PRICE_GROSS, MIN_APP };
