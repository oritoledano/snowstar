/**
 * Audioctor: sell the app, deliver the installer, sign the keys (2026-10-21).
 *
 * The second app of the house, sold the way StreamDAW is (streamdaw.js, copied and kept in step): the site-wide
 * account, `entitlements` (product 'audioctor'), HYP for the money (hyp.js verifies the return and dispatches here
 * by the AD- reference prefix: nothing is granted on the redirect's word alone), keys signed here with Audioctor's
 * own pair (audioctor-keys.js), at most MAX_MACS Macs a purchase, Audioctor Monthly in audioctor-subs.js.
 * StreamDAW's code is not touched: its own tables stay its own. Audioctor's: schema-audioctor.sql.
 *
 * Prices are dollars, charged in shekels at the day's rate (fx.js): Audioctor once ($49) at checkout time, Monthly
 * ($5.99) locked for the subscriber. Coupons: its own `audioctor_coupons`, then the shared `coupons` (scope 'audioctor' or 'all').
 * The app: SNOWSTAR-ENHANCE repo (app/licence: the key check, "AD" machine ids, the 7-day trial in the app).
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { sha256b64, randB64 } from './crypto.js';
import { parseHyp, verifyReturn } from './hyp.js';
import { applyCoupon, couponProblem, normCode } from './coupons.js';
import { cachedRates, FALLBACK } from './fx.js';
import { checkKey, mintKey } from './audioctor-keys.js';

const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const SITE = 'https://snowstar.company';
const PRODUCT = 'audioctor';
const ASSET = 'audioctor-macos';
const TOKEN_TTL = 7 * 24 * 3600;         // emailed download link good for 7 days
const PAGE = `${SITE}/apps/audioctor.html`;

// Audioctor once: $49, VAT included, charged in shekels at the day's rate (Ori, 2026-10-20).
export const ONCE_USD_CENTS = 4900;
const isMonthly = (plan) => plan === 'monthly';
const ends = (plan) => isMonthly(plan);                       // a plan whose key has an end
const dayOf = (sec) => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
const subsMod = () => import('./audioctor-subs.js');          // Audioctor Monthly (imports this file: no static cycle)
const paddleMod = () => import('./audioctor-paddle.js');      // Paddle, the merchant of record (2026-10-27; imports this file too)
const newRef = () => 'AD-' + urlToken(9).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10).padEnd(6, 'X');
/* A dollar code ('usd', cents off: e.g. $49 -> $39) on HYP's shekel price: the same dollars at today's rate. */
async function inShekels(env, c) {
  if (!c || c.kind !== 'usd') return c;
  const rate = (await shekelsFor(env, 100)).rate;
  return { ...c, kind: 'amount', value: Math.round(c.value / rate) };
}

/** Shekels (agorot) for `usdCents` today, at the site's daily rate. */
export async function shekelsFor(env, usdCents) {
  const r = await cachedRates(env);
  let usd = Number(r && r.rates && r.rates.USD);
  if (!(usd > 0.2 && usd < 0.5)) usd = FALLBACK.USD;          // a broken feed, not the market
  return { amount: Math.round(usdCents / usd), usdCents, rate: usd, source: (r && r.source) || 'fallback' };
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
const adLog = (env, actor, action, subject, detail) => env.DB.prepare(
  'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
).bind(actor, action, subject, JSON.stringify(detail), now()).run().catch(() => null);

// ── coupons: Audioctor's own table, then the shared one (StreamDAW's findSdawCoupon) ──
/* Its own codes stay Audioctor-only (a software discount never opens a music licence); a code in the
   Snowstar-level `coupons` table scoped to audioctor or to all works here too. */
function findCoupon(env, code) {
  const c = normCode(code);
  if (!c) return Promise.resolve(null);
  return env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note
       FROM audioctor_coupons WHERE code = ?`
  ).bind(c).first().catch(() => null).then((own) => own || env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note
       FROM coupons WHERE code = ? AND (scope = 'audioctor' OR scope = 'all')`
  ).bind(c).first().catch(() => null));
}
/* Burnt wherever it lives: a shared code counts against its own limit. */
function burnCoupon(env, code) {
  const c = normCode(code);
  if (!c) return Promise.resolve();
  return Promise.all([
    env.DB.prepare('UPDATE audioctor_coupons SET used = used + 1 WHERE code = ?').bind(c).run().catch(() => null),
    env.DB.prepare("UPDATE coupons SET used = used + 1 WHERE code = ? AND (scope = 'audioctor' OR scope = 'all')")
      .bind(c).run().catch(() => null),
  ]);
}

/** POST /audioctor/coupon — the owner makes, pauses or removes a code (StreamDAW's streamdawCouponCreate). */
export async function audioctorCouponCreate(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.remove) { await env.DB.prepare('DELETE FROM audioctor_coupons WHERE id = ?').bind(Number(b.remove)).run(); return json({ ok: true }); }
  if (b.toggle) { await env.DB.prepare('UPDATE audioctor_coupons SET active = 1 - active WHERE id = ?').bind(Number(b.toggle)).run(); return json({ ok: true }); }
  const kind = b.kind === 'amount' ? 'amount' : b.kind === 'usd' ? 'usd' : 'percent';
  let value = Math.round(Number(b.value) * (kind === 'usd' ? 100 : 1));
  if (!Number.isFinite(value) || value <= 0) return json({ error: 'bad_value' }, 400);
  if (kind === 'percent' && value > 100) return json({ error: 'percent_over_100' }, 400);
  if (kind === 'amount') value = value * 100;                 // shekels in, agorot stored; 'usd': dollars in, cents stored
  const code = normCode(b.code) || ('ADCT-' + urlToken(6).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  const exists = await env.DB.prepare('SELECT 1 FROM audioctor_coupons WHERE code = ?').bind(code).first().catch(() => null);
  if (exists) return json({ error: 'code_taken', code }, 409);
  await env.DB.prepare(
    `INSERT INTO audioctor_coupons (code, kind, value, min_amount, max_uses, used, expires_at, active, note, created_at)
     VALUES (?, ?, ?, 0, ?, 0, ?, 1, ?, ?)`
  ).bind(code, kind, value, Math.max(0, Math.round(Number(b.max_uses) || 0)),
         Number(b.expires_at) || null, String(b.note || '').slice(0, 200), now()).run();
  return json({ ok: true, code, kind, value });
}

/** POST /audioctor/coupon/check — { code } → what it does to Audioctor's price (once). Public. */
export async function audioctorCouponCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const P = await paddleMod();
  if (P.paddleOn(env)) return P.paddleCouponCheck(env, b.code);
  const price = (await shekelsFor(env, ONCE_USD_CENTS)).amount;
  const c = await inShekels(env, await findCoupon(env, b.code));
  const problem = couponProblem(c, price);
  if (problem) return json({ ok: false, reason: problem });
  const { amount: after, off } = applyCoupon(price, c);
  return json({
    ok: true, code: c.code, kind: c.kind, value: c.value, off,
    amount: after, free: after <= 0,
    label: c.kind === 'percent' ? `${c.value}% off` : `₪${(c.value / 100).toFixed(0)} off`,
  });
}

// ── 1. Checkout: apply any coupon, then free-grant or send to HYP ───────────
export async function audioctorCheckout(req, env) {
  // A Snowstar account first, always: no session, no order and no HYP page. The email is the account's.
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const body = await req.json().catch(() => ({}));
  const email = lc(user.email);
  if (!validEmail(email)) return json({ error: 'sign_in_required' }, 401);

  const P = await paddleMod();
  if (isMonthly(body.plan)) {
    if (P.paddleOn(env)) return json({ error: 'monthly_not_ready', reason: 'Monthly is not sold through Paddle yet' }, 503);
    return (await subsMod()).monthlyCheckout(env, user, body);
  }
  const plan = 'lifetime';
  const owns = await env.DB.prepare(
    `SELECT id FROM entitlements WHERE product = ? AND status = 'active' AND plan = 'lifetime' AND (user_id = ? OR email = ?) LIMIT 1`
  ).bind(PRODUCT, user.id, email).first().catch(() => null);
  if (owns) return json({ error: 'owns_it', reason: 'You already own Audioctor. Get a key for another Mac on the unlock page.' }, 409);
  if (P.paddleOn(env)) return P.paddleCheckout(env, user, body);
  let amount = (await shekelsFor(env, ONCE_USD_CENTS)).amount, couponCode = null;
  if (body.coupon && String(body.coupon).trim()) {
    // Coupon (optional). Invalid code entered → tell them, don't silently charge full.
    const c = await inShekels(env, await findCoupon(env, body.coupon));
    const problem = couponProblem(c, amount);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ amount } = applyCoupon(amount, c));
    couponCode = c.code;
  }

  const ref = newRef();
  // Bought from inside the app ("Get Audioctor" opens the page with ?machine=AD…): the order carries that Mac, and
  // its key is made the moment the money is in. No machine ID to copy and paste.
  const machine = normMachine(body.machine);
  const ownerName = String(user.name || body.name || '').trim().slice(0, 60) || null;

  // ── free (a coupon covered the whole price): grant now, no HYP ──
  if (amount <= 0) return grantFree(env, { ref, user, email, couponCode, machine, ownerName });

  // ── paid: send to HYP ──
  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  await insertOrder(env, { ref, userId: user.id, email, plan, amount, status: 'started', coupon: couponCode, machine, ownerName });
  const p = payPageParams(env, { ref, amount, user, email, item: 'Audioctor (one payment)', info: `Audioctor ${ref}` });
  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);
  // A page whose return cannot be verified is never handed out (HYP echoes what it signed).
  if (d.Sign !== 'True') {
    await adLog(env, 'system:hyp', 'ad.sign_unverifiable', ref, { hypReturned: redactHyp(text).slice(0, 900) });
    return json({ error: 'hyp_sign_failed', reason: 'no_sign' }, 502);
  }
  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, plan, amount_gross: amount });
}

/* A coupon that covers the whole price: granted at once, no payment page (HYP's or Paddle's). */
async function grantFree(env, { ref, user, email, couponCode, machine, ownerName, currency = 'ILS' }) {
  const plan = 'lifetime';
  await insertOrder(env, { ref, userId: user.id, email, plan, amount: 0, currency, status: 'granted', coupon: couponCode, machine, ownerName });
  const ent = await grantEntitlement(env, { email, ext_ref: ref, amount: 0, currency, plan, source: 'coupon' });
  if (couponCode) await burnCoupon(env, couponCode);
  const link = await mintDownloadLink(env, ent.id, email);
  if (machine) await requestKey(env, { entId: ent.id, email, machine, name: ownerName || email, via: 'checkout' }).catch(() => {});
  await emailReceipt(env, email, link, machine, { ref, amount: 0, currency, coupon: couponCode, plan }).catch(() => {});
  await env.DB.prepare('UPDATE audioctor_orders SET entitlement_id = ?, settled_at = ? WHERE ref = ?')
    .bind(ent.id, now(), ref).run().catch(() => {});
  await (await subsMod()).cancelForUpgrade(env, email, user.id).catch(() => {});   // for good: a Monthly stops
  return json({ ok: true, free: true, ref, download: link, redirect: `${PAGE}?bought=1&free=1` });
}

/* HYP's payment page, as both checkouts ask for it (Audioctor once here, Monthly in
   audioctor-subs.js). The look, from developers.hyp.co.il/pay/common-use-cases/customizing-payment-page-design
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
  const first = (words[0] || lc(email).split('@')[0] || 'Audioctor').slice(0, 40), last = words.slice(1).join(' ').slice(0, 60);
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
// (the site's checkout lightbox). HYP sends the buyer back to the ONE success URL set in its portal,
// so a payment made in the lightbox comes back here inside that iframe. The browser says so
// (Sec-Fetch-Dest: iframe), or ?frame=1 says it by hand; then the answer is a small page that
// tells the lightbox (postMessage to snowstar.company only) instead of a 302 that would load the
// whole sale page inside the frame. A top-level return keeps its 302, word for word.
const inFrame = (req, q) => q.frame === '1' || (req.headers.get('sec-fetch-dest') || '') === 'iframe';

/** The return page for a payment made in the lightbox: posts {type, bought, ref, plan} (or
 *  {pay, reason}) to the parent at `origin` and nowhere else, and only if it is framed; loaded
 *  as a whole page it goes on to `dest`, the same place the 302 sends a full-page buyer. Only our
 *  own site may frame it. */
export function audioctorFramePage(msg, dest, origin = SITE) {
  const nonce = urlToken(16);
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const say = msg.bought ? 'Payment received. Back to Audioctor…'
    : msg.pay === 'confirming' ? 'Your payment is being confirmed. Back to Audioctor…'
    : 'The payment did not go through. Back to Audioctor…';
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + '<title>Audioctor checkout</title><style>html,body{margin:0;height:100%;background:#f7f3e8;color:#17140d;'
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

export async function audioctorReturn(req, env, raw, q) {
  const ref = String(q.Order || '');
  // ?frame=1 is ours, not HYP's: VERIFY compares the parameter set HYP sent, so it never goes along.
  raw = String(raw || '').split('&').filter((kv) => kv.split('=')[0] !== 'frame').join('&');
  const framed = inFrame(req, q);
  // Where a full-page buyer goes, unchanged; in the lightbox, the same answer as a message.
  const back = (query, msg) => {
    const dest = `${PAGE}?${query}`;
    if (!framed) return Response.redirect(dest, 302);
    const okRef = /^AD-[A-Z0-9]{4,20}$/.test(ref) ? ref : null;   // the query is anyone's to type
    return audioctorFramePage({ type: 'ad-checkout', ref: okRef, ...msg }, dest);
  };
  const planOf = (o) => (o && (o.plan === 'pass' || o.plan === 'monthly') ? o.plan : 'lifetime');
  const fail = (why, o) => back(`pay=failed&reason=${encodeURIComponent(why)}`, { bought: false, pay: 'failed', reason: why, plan: o ? planOf(o) : null });
  const bought = (o) => back(`bought=1&ref=${encodeURIComponent(ref)}`, { bought: true, plan: planOf(o) });

  if (q.CCode !== '0') {
    await env.DB.prepare(`UPDATE audioctor_orders SET status='declined' WHERE ref=?`).bind(ref).run().catch(() => {});
    return fail('declined');
  }
  const order = await env.DB.prepare(`SELECT * FROM audioctor_orders WHERE ref=?`).bind(ref).first();
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
      await env.DB.prepare(`UPDATE audioctor_orders SET status='charged_unverified', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'Audioctor: card charged but not verified',
        text: `Order ${ref}: HYP Id ${q.Id || ''}, auth ${q.ACode || ''}, ${q.Amount || ''} ILS.\n`
            + `Charged, but HYP's VERIFY did not confirm it (CCode ${v.ccode || v.error || '?'}${v.signed ? '' : ', the return carried no Sign'}), `
            + `so nothing was granted yet.\n\nPress Reconcile on this order: ${SITE}/dashboard.html (Audioctor › Orders)\n`
            + `It asks HYP again when it can; otherwise it asks you to confirm the transaction in the HYP portal first.` }).catch(() => {});
      return back(`pay=confirming&ref=${encodeURIComponent(ref)}`, { bought: false, pay: 'confirming', plan: planOf(order) });
    }
    await env.DB.prepare(`UPDATE audioctor_orders SET status='verify_failed', hyp_id=? WHERE ref=?`).bind(String(q.Id || ''), ref).run().catch(() => {});
    return fail('unverified', order);
  }

  if (paid !== order.amount) return fail('amount_mismatch', order);
  if (q.Coin && q.Coin !== '1') return fail('bad_currency', order);
  try {
    await fulfilPaid(env, order, q, 'hyp');
  } catch {
    // Verified and paid, and the grant broke: the honest answer is "being confirmed", and the owner hears.
    await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'Audioctor: paid and verified, but the grant failed',
      text: `Order ${ref}: HYP Id ${q.Id || ''}, ${q.Amount || ''} ILS. HYP verified it; granting then failed (admin_log ad.grant_failed).\n`
          + `Press Reconcile on this order: ${SITE}/dashboard.html (Audioctor › Orders)` }).catch(() => {});
    return back(`pay=confirming&ref=${encodeURIComponent(ref)}`, { bought: false, pay: 'confirming', plan: planOf(order) });
  }
  return bought(order);
}

/* Every Audioctor return leaves HYP's VERIFY answer in admin_log ('ad.verify'): CCode, HYP's reply
   (credentials blanked), whether the redirect carried Sign, and the names of what it carried.
   SD-JQYOOWJOEP (2026-10-14) was charged, VERIFY said no, and nothing recorded why.
   It also keeps the redirect itself (`ret`) until the order is granted: Reconcile sends it to
   VERIFY again (HYP checks it only byte for byte), and fulfilPaid removes it once granted. */
async function logVerify(env, ref, raw, v, outcome) {
  const keys = String(raw || '').split('&').map((kv) => kv.split('=')[0]).filter(Boolean);
  const detail = { outcome, ccode: v.ccode == null ? null : String(v.ccode), error: v.error || null,
    reply: redactHyp(v.raw).slice(0, 300), signed: !!v.signed, keys };
  if (raw.length <= 3000) detail.ret = raw;
  await adLog(env, 'system:hyp', 'ad.verify', ref, detail);
}

/** The redirect a failed return kept, newest first. */
async function keptReturn(env, ref) {
  const rows = (await env.DB.prepare(
    `SELECT detail FROM admin_log WHERE action = 'ad.verify' AND subject = ? ORDER BY id DESC LIMIT 5`
  ).bind(ref).all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) { try { const d = JSON.parse(r.detail); if (d && d.ret) return d.ret; } catch { /* not ours */ } }
  return null;
}

/* What a paid order gets, from a verified return or from Reconcile, the same either way: the
   entitlement (Monthly: its subscription first, audioctor-subs.js), the coupon burnt, a
   download link, the key request when the order came from the app, the receipt. The order is
   claimed first ('granting', one UPDATE), so two at once (the frame and a reload, a return and
   Reconcile) grant it once. */
async function fulfilPaid(env, order, q, source) {
  const ref = order.ref;
  const claim = await env.DB.prepare(
    `UPDATE audioctor_orders SET status='granting' WHERE ref=? AND status NOT IN ('granted','granting')`
  ).bind(ref).run();
  if (!claim.meta || claim.meta.changes !== 1) return { already: true };
  try {
    const plan = order.plan || 'lifetime';
    const subs = await subsMod();
    const monthly = isMonthly(plan) ? await subs.monthlyGranted(env, order, q, ref) : null;
    const ent = monthly ? monthly.ent : await grantEntitlement(env, { email: order.email, ext_ref: ref, amount: order.amount, currency: order.currency || 'ILS', plan, source });
    if (order.coupon) await burnCoupon(env, order.coupon);
    const link = await mintDownloadLink(env, ent.id, order.email);
    if (order.machine_id)
      await requestKey(env, { entId: ent.id, email: order.email, machine: order.machine_id, name: order.owner_name || order.email, via: 'checkout' }).catch(() => {});
    if (monthly) await subs.mailWelcome(env, monthly.sub, { link, machine: order.machine_id || null, ref }).catch(() => {});
    else await emailReceipt(env, order.email, link, order.machine_id || null,
      { ref, amount: order.amount, currency: order.currency || 'ILS', coupon: order.coupon || null, plan, expiresAt: ent.expires_at }).catch(() => {});
    // Granted from here on: the receipt has gone, so nothing below may send the order back.
    await env.DB.prepare(`UPDATE audioctor_orders SET status='granted', hyp_id=COALESCE(?, hyp_id), entitlement_id=?, settled_at=? WHERE ref=?`)
      .bind(q && q.Id ? String(q.Id) : null, ent.id, now(), ref).run().catch(() => {});
    // Settled: the kept redirect (card details, the buyer's ID) has done its job.
    await env.DB.prepare(`UPDATE admin_log SET detail = json_remove(detail, '$.ret') WHERE action = 'ad.verify' AND subject = ?`)
      .bind(ref).run().catch(() => {});
    if (plan === 'lifetime') await subs.cancelForUpgrade(env, order.email, order.user_id).catch(() => {});   // for good: a Monthly stops
    return { ok: true, ent };
  } catch (e) {
    // Paid and not granted: charged_unverified, which Reconcile finishes (the kept redirect, or the portal).
    await env.DB.prepare(`UPDATE audioctor_orders SET status='charged_unverified', hyp_id=COALESCE(hyp_id, ?) WHERE ref=? AND status='granting'`)
      .bind(q && q.Id ? String(q.Id) : null, ref).run().catch(() => {});
    await adLog(env, 'system:hyp', 'ad.grant_failed', ref, { error: String(e && e.message || e).slice(0, 300), source });
    throw e;
  }
}

/**
 * POST /audioctor/reconcile {ref, hyp_id?, portal_checked?} — the owner, for an order that was
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
export async function audioctorReconcile(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref || '').trim();
  if (!/^AD-[A-Z0-9]{4,20}$/.test(ref)) return json({ error: 'bad_ref' }, 400);
  const order = await env.DB.prepare('SELECT * FROM audioctor_orders WHERE ref = ?').bind(ref).first();
  if (!order) return json({ error: 'not_found' }, 404);
  if (order.status === 'granted') return json({ ok: true, already: true, ref, entitlement_id: order.entitlement_id || null });
  if (order.paddle_txn) {                         // Paddle's own record of the transaction decides (audioctor-paddle.js)
    const r = await (await paddleMod()).paddleReconcile(env, order).catch((e) => ({ error: String(e.message).slice(0, 200) }));
    await adLog(env, `admin:${user.id || user.email || '?'}`, 'ad.reconcile_paddle', ref, r);
    const o2 = await env.DB.prepare('SELECT entitlement_id FROM audioctor_orders WHERE ref = ?').bind(ref).first();
    return json(r.ok ? { ok: true, via: 'paddle', ref, outcome: r.outcome, entitlement_id: o2 && o2.entitlement_id } : { error: r.error, status: r.status || null }, r.ok ? 200 : 409);
  }
  if (order.status !== 'charged_unverified' && order.status !== 'verify_failed')
    return json({ error: 'not_reconcilable', status: order.status }, 409);
  const actor = `admin:${user.id || user.email || '?'}`;
  const done = (out, via) => json({ ok: true, via, ref, already: !!out.already,
    entitlement_id: out.ent ? out.ent.id : null });

  const kept = await keptReturn(env, ref);
  if (kept && kept.split('&').some((kv) => kv.split('=')[0] === 'Sign')) {
    const q = parseHyp(kept);
    const v = await verifyReturn(env, kept);
    await adLog(env, actor, 'ad.reconcile', ref, { via: 'verify', ccode: v.ccode == null ? null : String(v.ccode),
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
  await adLog(env, actor, 'ad.reconcile', ref, { via: 'portal', hyp_id: order.hyp_id, amount: order.amount, already: !!out.already });
  return done(out, 'portal');
}


export async function audioctorDownload(req, env) {
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
  // Audioctor's own: a StreamDAW link (the same download_tokens table) never serves this installer.
  if (!entitlement || entitlement.status !== 'active' || entitlement.product !== PRODUCT) return json({ error: 'not_entitled' }, 403);

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

/** GET /audioctor/download/free — the 7-day trial: the same installer, for anyone with a
 *  Snowstar account (as StreamDAW). A key made for one Mac keeps it going after the trial, so
 *  the build itself is not the thing being sold; the account is how we know who has it.
 *  Signed out: back to the sale page with the sign-up open (?get=free; the page
 *  starts the download once they are in), or a 401 for a caller that asks for JSON.
 *  Each download is filed with who took it (audioctor_free_downloads,
 *  schema-audioctor.sql); req_log still counts route + 200 for the funnel. */
const FREE_SIGNUP_URL = `${PAGE}?get=free`;
export async function audioctorDownloadFree(req, env) {
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
    await env.DB.prepare('INSERT INTO audioctor_free_downloads (user_id, version, created_at) VALUES (?, ?, ?)')
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

/** The models (launch gate A3): the app's first run fetches its ~2.3 GB set here, part by part. SNOWSTAR-ENHANCE's
 *  app/models/pack.py cuts and uploads them as APPS keys audioctor/models/<set>/<path>.p<i> (R2 takes 300 MiB a put).
 *  Public and immutable: the app pins every file's sha256, so a set's bytes never change under its name and are
 *  worth nothing without the app. A Range request resumes a part that was cut off. */
const MODEL_REL = /^[a-z0-9]+(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)+\.p\d{1,2}$/;
export async function audioctorModel(req, env, rel) {
  if (!MODEL_REL.test(rel) || rel.includes('..')) return json({ error: 'not_found' }, 404);
  const key = 'audioctor/models/' + rel;
  const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': 'application/octet-stream',
                                'cache-control': 'public, max-age=31536000, immutable' });
  const range = req.method === 'HEAD' ? null : req.headers.get('range');
  const m = range && range.match(/^bytes=(\d+)-(\d*)$/);
  if (m) {
    const info = await env.APPS.head(key);
    if (!info) return json({ error: 'not_found' }, 404);
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), info.size - 1) : info.size - 1;
    if (start >= info.size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${info.size}` } });
    const obj = await env.APPS.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return json({ error: 'not_found' }, 404);
    headers.set('content-range', `bytes ${start}-${end}/${info.size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  const obj = req.method === 'HEAD' ? await env.APPS.head(key) : await env.APPS.get(key);
  if (!obj) return json({ error: 'not_found' }, 404);
  headers.set('content-length', String(obj.size));
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
}

// ── 4. Account: does this member own Audioctor? ─────────────────────────────
export async function myAudioctor(env, user) {
  if (!user) return json({ owned: false }, 401);
  const ent = await env.DB.prepare(
    `SELECT id, plan, created_at, expires_at FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY (expires_at IS NULL) DESC, created_at DESC LIMIT 1`
  ).bind(PRODUCT, user.id, lc(user.email), now()).first();
  // What Audioctor once costs today (the page shows it), in shekels at the day's rate.
  const proPrice = (await shekelsFor(env, ONCE_USD_CENTS)).amount;
  // Monthly: its state (renews / cancelled / payment due), for the account page and the sale page.
  const subscription = await (await subsMod()).subFor(env, user).catch(() => null);
  if (!ent) return json({ owned: false, proPrice, subscription });
  const rel = await env.DB.prepare('SELECT version, filename, bytes, sha256 FROM app_releases WHERE asset = ? AND is_latest = 1')
    .bind(ASSET).first();
  return json({ owned: true, since: ent.created_at, plan: ent.plan, expiresAt: ent.expires_at || null, proPrice, subscription,
                release: rel, download: `${SITE}/api/audioctor/download` });
}

// ── licence activation: machine id in, key file out ────────────────────────
//
// The paid features are unlocked by a signed key bound to ONE machine (P-256 since
// audioctor-keys.js). The Worker signs them itself, with its
// own pair (AUDIOCTOR_SIGNING_KEY; the app trusts it next to the offline pair on Ori's Mac): a
// request within the purchase's MAX_MACS Macs gets its key in the answer and by email, at once.
// The exceptions (a third Mac, a failure) wait in the dashboard, where the owner signs here or
// pastes a key minted by hand with `AudioctorKeyGen` (/audioctor/activation/issue).
//
// The machine id format is fixed by the app (app/licence/Licence.cpp): "AD" + 12–20 hex.
const MACHINE_ID_RE = /^AD[0-9A-F]{12,20}$/;
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

/* Keys: format, check and signing live in audioctor-keys.js (checkKey, mintKey). */
const MIN_APP = '0.1.0';        // reads keys with an end and trusts the Worker's pair
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const escHtml = (t) => String(t || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/* The mint command, ready to paste in Terminal on the owner's Mac. The name is what listeners
   see as the host; the email rides in the key for this Mac's licence panel only. */
const mintCommand = ({ name, email, machine, expiresAt }) =>
  `~/.cache/snowstar-enhance/build-app/AudioctorKeyGen_artefacts/Release/AudioctorKeyGen --keyfile ~/.cache/snowstar-enhance/licence-keypair.txt `
  + `--name "${String(name || '').replace(/["$`\\]/g, '')}" --email "${lc(email).replace(/["$`\\]/g, '')}" --machines ${machine}`
  + (expiresAt ? ` --expires ${Number(expiresAt) * 1000}` : '');   // Monthly: its end (seconds here, ms for the keygen)

/* Every Audioctor email has StreamDAW's shape (2026-10-10, Ori: "do what other big brands do and
   close all loose ends"): a title, one line, the steps, at most one main button, the key in a
   box when there is one, the details, and the same links at the foot: get a key for a Mac,
   your account and downloads, help, the terms. The text part says the same, links spelled out. */
const UNLOCK_URL = `${SITE}/apps/audioctor-unlock.html`;
const ACCOUNT_URL = `${SITE}/account.html`;
const TERMS_URL = `${SITE}/apps/audioctor-terms.html`;
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
  <p style="color:#a59f8c;font-size:12px;margin:14px 0 0">Audioctor · by Snowstar.Company · Ori Toledano, 22 Eilat Street, Tel Aviv</p>
</div>`;
  return html;
}

/* An order row, with the Mac it was bought for. The two columns arrive with
   schema-audioctor.sql; until that has run, the order is written without
   them (and the key request is then made the old way, on the page), so a deploy before
   the migration cannot break checkout. */
async function insertOrder(env, { ref, userId, email, plan, amount, currency = 'ILS', status, coupon, machine, ownerName }) {
  plan = isMonthly(plan) ? plan : 'lifetime';
  try {
    await env.DB.prepare(
      `INSERT INTO audioctor_orders (ref, user_id, email, plan, amount, currency, status, coupon, machine_id, owner_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(ref, userId, email, plan, amount, currency, status, coupon, machine, ownerName, now()).run();
  } catch (e) {
    if (!/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO audioctor_orders (ref, user_id, email, plan, amount, currency, status, coupon, created_at)
       VALUES (?, ?, ?, ?, ?, 'ILS', ?, ?, ?)`
    ).bind(ref, userId, email, plan, amount, status, coupon, now()).run();
  }
}

/* A key request for one Mac under one purchase: queued for minting, the owner told.
   From the page's activation form, and on its own when the purchase came from the app. */
async function requestKey(env, { entId, email, machine, name, via }) {
  // The name on a licence is what listeners see as the host: never an email address. A purchase
  // made in the app may come without one; then the part before the @ stands in.
  if (!name || name.includes('@')) name = String(email || '').split('@')[0] || 'Audioctor user';
  // Already issued for this machine? Hand back the same key rather than queueing a
  // duplicate — re-installing must not need a new request. (A Mac deactivated on the unlock page
  // asks again like a new one: it takes a place again.)
  const prior = await env.DB.prepare(
    'SELECT status, key_text FROM audioctor_activations WHERE entitlement_id = ? AND machine_id = ?'
  ).bind(entId, machine).first();
  if (prior && prior.status === 'issued' && prior.key_text) return { status: 'issued', key: keyLines(prior.key_text) };

  // Monthly: its key ends when the entitlement does (seconds, as every table here; issueKey refuses a
  // key whose end differs): the paid month plus 3 days, moved on by each renewal (audioctor-subs.js).
  const ent = await env.DB.prepare('SELECT plan, expires_at FROM entitlements WHERE id = ?').bind(entId).first().catch(() => null);
  const expiresAt = ent && ends(ent.plan) && ent.expires_at ? Number(ent.expires_at) : null;
  if (ent && ends(ent.plan) && (!expiresAt || expiresAt <= now())) return { status: 'expired' };
  // At most MAX_MACS Macs per purchase (Ori, 2026-10-15): another is refused until one is
  // deactivated on the unlock page. It is still filed, as 'limit', so the owner can let it through
  // from the dashboard (the exception, by hand).
  const others = ((await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM audioctor_activations WHERE entitlement_id = ? AND machine_id != ?
        AND status IN ('issued','renewing','pending')`
  ).bind(entId, machine).first()) || {}).n || 0;
  const full = others >= MAX_MACS;
  const status = full ? 'limit' : 'pending';
  try {
    await env.DB.prepare(
      `INSERT INTO audioctor_activations (entitlement_id, email, machine_id, owner_name, status, requested_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (entitlement_id, machine_id) DO UPDATE SET
         owner_name = excluded.owner_name, requested_at = excluded.requested_at, expires_at = excluded.expires_at,
         status = CASE WHEN audioctor_activations.status = 'issued' THEN 'issued' ELSE excluded.status END`
    ).bind(entId, lc(email), machine, name, status, now(), expiresAt).run();
  } catch (e) {
    // An older table without expires_at: a permanent request still files; one with an end waits.
    if (expiresAt || !/no column|no such column|has no column/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(
      `INSERT INTO audioctor_activations (entitlement_id, email, machine_id, owner_name, status, requested_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (entitlement_id, machine_id) DO UPDATE SET
         owner_name = excluded.owner_name, requested_at = excluded.requested_at,
         status = CASE WHEN audioctor_activations.status = 'issued' THEN 'issued' ELSE excluded.status END`
    ).bind(entId, lc(email), machine, name, status, now()).run();
  }

  if (full) {
    try {
      await sendMail(env, {
        to: env.ALERT_TO || 'oritoledano@gmail.com',
        subject: `[Admin] Audioctor: ${name} asked for a key for Mac number ${others + 1} (refused)`,
        text: `ADMIN NOTE, NOT A KEY. ${name} <${email}> asked for a key for ${machine}, but the purchase already has keys for ${others} Macs (the limit is ${MAX_MACS}).
`
            + `They were told to deactivate one of their Macs first (${UNLOCK_URL}).

`
            + `To let it through anyway: ${SITE}/dashboard (Audioctor › Keys), "Sign here" on this row.`,
      });
    } catch {}
    return { status: 'limit', macs: others, error: `This purchase already has keys for ${others} Macs. Deactivate one of your Macs first, then ask again.` };
  }

  // Signed here, now, with the Worker's pair: the key is in this answer and in the buyer's email.
  const row = await env.DB.prepare('SELECT * FROM audioctor_activations WHERE entitlement_id = ? AND machine_id = ?').bind(entId, machine).first();
  const signed = row ? await autoIssue(env, row) : { error: 'the request was not filed' };
  if (signed.ok) {
    const done = await env.DB.prepare('SELECT * FROM audioctor_activations WHERE id = ?').bind(row.id).first();
    return { status: 'issued', key: withRenewal(keyLines(done.key_text), done.renew_code) };
  }

  // Not signed here (no secret yet, or an error): the owner signs it by hand (Audioctor has no minter).
  const auto = false;
  // Tell the owner. Never fail the request over mail. The subject says ADMIN: the owner is
  // often the buyer too (testing), and this is not a key.
  const byHand = `Run this in Terminal on your Mac:\n\n${mintCommand({ name, email, machine, expiresAt })}\n\n`
    + `Then open ${SITE}/dashboard (Audioctor › Keys), press "Paste key…" on this row and paste everything it printed.\n`
    + `The buyer gets the key by email at once.`;
  try {
    await sendMail(env, {
      to: env.ALERT_TO || 'oritoledano@gmail.com',
      subject: auto ? `[Admin] Audioctor key request: ${name} (sent automatically)`
                    : `[Admin] Mint an Audioctor key for ${name}${via === 'checkout' ? ' (bought in the app)' : ''}`,
      text: `ADMIN NOTE, NOT A KEY. ${name} <${email}> ${via === 'checkout' ? 'bought Audioctor from inside the app; their Mac came with the order.' : 'asked for a licence key.'}\n`
          + `Machine ID: ${machine}\n`
          + `The Worker could not sign it: ${signed.error}\n\n`
          + (auto
            ? `The minter on your Mac signs and sends it within a minute while your Mac is awake. Nothing to do.\n\n`
              + `If the dashboard (Audioctor › Keys) still says "waiting" later, do it by hand. ${byHand}`
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
        subject: 'We got your Audioctor key request',
        text: `${hi ? `Hi ${hi},\n\n` : ''}We got your request for an Audioctor key for this Mac:\n${machine}\n\n`
            + `What happens next:\n`
            + `1. We make your key, ${auto ? 'usually within minutes' : 'usually within a day'}.\n`
            + `2. It arrives in a second email, "Your Audioctor key", and on ${UNLOCK_URL} when you are signed in.\n`
            + `3. Paste it into Audioctor (the licence line at the bottom left of its window) and press Unlock.\n\n`
            + `Nothing to do until then. Audioctor keeps working in the meantime.\n\n${mailLinksText()}\n\n— Snowstar.Company`,
        html: licenceMail({
          title: 'Your key is on its way',
          intro: `${hi ? `Hi ${escHtml(hi)}, we` : 'We'} got your request for an Audioctor key for this Mac: <code>${escHtml(machine)}</code>`,
          steps: [
            `We make your key, ${auto ? 'usually within minutes' : 'usually within a day'}.`,
            `It arrives in a second email, <b>Your Audioctor key</b>, and on <a href="${UNLOCK_URL}">your unlock page</a> when you are signed in.`,
            'Paste it into Audioctor (<b>the licence line</b> at the bottom left of its window) and press <b>Unlock</b>.',
          ],
          footer: 'Nothing to do until then. Audioctor keeps working in the meantime.',
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
export async function audioctorActivate(req, env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);

  const ent = await activeEntitlement(env, user);
  if (!ent) return json({ error: 'no Audioctor purchase on this account' }, 403);

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
export async function audioctorActivationStatus(env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);
  const ent = await activeEntitlement(env, user);
  if (!ent) return json({ owned: false });

  const rows = (await env.DB.prepare(
    `SELECT machine_id, status, key_text, serial, requested_at, issued_at, renew_code
       FROM audioctor_activations WHERE entitlement_id = ? ORDER BY requested_at DESC LIMIT 10`
  ).bind(ent.id).all().catch(() => env.DB.prepare(
    `SELECT machine_id, status, key_text, serial, requested_at, issued_at
       FROM audioctor_activations WHERE entitlement_id = ? ORDER BY requested_at DESC LIMIT 10`).bind(ent.id).all())).results || [];
  // A Monthly key is shown with its Renewal line: copied together, the app renews it by itself.
  for (const r of rows) {
    if (r.key_text) r.key_text = withRenewal(keyLines(r.key_text), r.renew_code);
    if (r.status === 'renewing') r.status = 'issued';           // the key it has still works; the next one is on its way
    delete r.renew_code;
  }
  return json({ owned: true, activations: rows });
}

/** Owner only: paste the minted key back in; the buyer gets it by email. */
export async function audioctorActivationIssue(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  let body = {};
  try { body = await req.json(); } catch {}
  const id = Number(body.id || 0);
  const key = String(body.key || '').trim();
  const reject = String(body.reject || '').trim();

  const row = await env.DB.prepare('SELECT * FROM audioctor_activations WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'no such request' }, 404);

  if (reject) {
    await env.DB.prepare("UPDATE audioctor_activations SET status = 'rejected', note = ? WHERE id = ?")
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
   from the Worker's own signing. `onlyPending`: signing by itself never overwrites a key the
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
  // Monthly: the renewal code goes out with the first key and stays the same after (the app
  // keeps it, and fetches every later key with it).
  const code = monthly ? (row.renew_code || (await subsMod()).newRenewCode()) : null;
  const renewal = row.status === 'renewing';
  const res = await env.DB.prepare(
    "UPDATE audioctor_activations SET status = 'issued', key_text = ?, serial = ?, issued_at = ?" + (monthly ? ', renew_code = ?' : '') + ' WHERE id = ?'
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
  const what = monthly ? 'Audioctor Monthly key' : 'Audioctor key';
  const minApp = MIN_APP;
  const copy = monthly ? `Copy everything in the box below (all ${n} lines: the key and its Renewal line) and paste it into the box.`
                       : `Copy the key below (all ${n} lines) and paste it into the box.`;
  const renewText = monthly ? `Audioctor Monthly: this key runs to ${until}, 3 days past the month you paid for. Audioctor ${subs.RENEW_APP} or newer fetches the next one by itself every month while it is online (that is what the Renewal line is for). Manage or cancel: ${subs.MANAGE_URL}\n`
    : '';
  const renewHtml = monthly ? `This key runs to ${until}, 3 days past the month you paid for. Audioctor ${subs.RENEW_APP} or newer fetches the next one by itself every month while it is online: that is what the Renewal line is for. <a href="${subs.MANAGE_URL}">Manage or cancel</a>.<br>`
    : '';
  try {
    await sendMail(env, {
      to: row.email,
      subject: monthly ? 'Your Audioctor Monthly key' : 'Your Audioctor key',
      text: `${hi ? `Hi ${hi}, your` : 'Your'} ${what} is ready.\n\n`
          + `1. Open Audioctor and click the licence line at the bottom left of its window.\n`
          + `2. ${copy}\n`
          + `3. Press Unlock.\n\n`
          + `${box}\n\n`
          + `Registered to: ${row.owner_name || row.email} · ${row.email}\n`
          + (serial ? `Serial: ${serial}\n` : '')
          + `Works on this Mac only: ${row.machine_id}\n`
          + renewText
          + `Needs Audioctor ${minApp} or newer. Older copy? Download the latest from your account first: ${ACCOUNT_URL}\n`
          + `Another Mac? Get a key for it here: ${UNLOCK_URL}\n`
          + `Keep this email: it is your licence. Lost it? The same page shows your keys when you sign in.\n\n${mailLinksText()}\n\n— Snowstar.Company`,
      html: licenceMail({
        title: monthly ? 'Your Audioctor Monthly key' : 'Your Audioctor key',
        intro: `${hi ? `Hi ${escHtml(hi)}, your` : 'Your'} key is ready${until ? `: Audioctor until <b>${until}</b>, renewed each month` : ''}.`,
        steps: [
          'Open Audioctor and click <b>the licence line</b> at the bottom left of its window.',
          monthly ? `Copy everything in the box below (all ${n} lines: the key <b>and its Renewal line</b>) and paste it into the box.`
                  : `Copy the key below (all ${n} lines) and paste it into the box.`,
          'Press <b>Unlock</b>.',
        ],
        key: box,
        footer: `Registered to <b>${escHtml(row.owner_name || row.email)}</b> · ${escHtml(row.email)}<br>`
          + (serial ? `Serial <code>${escHtml(serial)}</code><br>` : '')
          + `Works on this Mac only: <code>${escHtml(row.machine_id)}</code><br>`
          + renewHtml
          + `Needs Audioctor ${minApp} or newer. Older copy? <a href="${ACCOUNT_URL}">Download the latest</a> from your account first.<br>`
          + `Another Mac? <a href="${UNLOCK_URL}">Get a key for it</a>.<br>`
          + `Keep this email: it is your licence. Lost it? <a href="${UNLOCK_URL}">Sign in</a> to see your keys.`,
      }),
    });
  } catch {}
  return { ok: true };
}

/* A Monthly key as it is shown and pasted: the key, then its Renewal line. The line starts
   with a letter that is not hex ("R"), so every app version's paste cleaning (the longest stretch
   of hex) still finds the key alone; 0.5.6 on also keeps the code. */
const withRenewal = (lines, code) => (code ? `${lines}\n\nRenewal: ${code}` : lines);

/* Sign one request here, with the Worker's pair (audioctor-keys.js), and send it as issueKey does
   (checked again there like every key). `override`: the owner letting a request through by hand
   (a Mac over the limit), which may also replace a key already sent. No secret: nothing happens,
   the request waits for the owner. */
async function autoIssue(env, row, override = false) {
  if (!env.AUDIOCTOR_SIGNING_KEY) return { error: 'no AUDIOCTOR_SIGNING_KEY in this Worker' };
  const name = row.owner_name || String(row.email || '').split('@')[0] || 'Audioctor user';
  const minted = await mintKey(env.AUDIOCTOR_SIGNING_KEY, { name, email: row.email, machine: row.machine_id, expiresAt: row.expires_at });
  if (minted.error) return minted;
  return issueKey(env, row, minted.hex, !override);
}

/** Everything that may go out by itself and still waits — a Mac within MAX_MACS, a Monthly key
 *  a paid renewal moved on ('renewing') — signed now: for one purchase after its renewal
 *  (audioctor-subs.js, monthPaid), and for all once a day (the cron) for anything a failure left. */
export async function mintWaiting(env, entitlementId = null) {
  if (!env.AUDIOCTOR_SIGNING_KEY) return { signed: 0, errors: [] };
  const rows = (await env.DB.prepare(
    `SELECT a.* FROM audioctor_activations a
      WHERE (?1 IS NULL OR a.entitlement_id = ?1)
        AND (a.status = 'renewing'
             OR (a.status = 'pending'
                 AND (SELECT COUNT(*) FROM audioctor_activations b
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
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com', subject: `[Admin] Audioctor: ${errors.length} key(s) the Worker could not sign`,
        text: `ADMIN NOTE. These wait in the dashboard (Audioctor › Keys):\n\n${errors.join('\n')}` });
    } catch {}
  }
  return { signed, errors };
}

/** POST /audioctor/deactivate {machineId} — the buyer frees one of their MAX_MACS places, to put
 *  Audioctor on another Mac. The key on that Mac cannot be recalled (keys work offline): a
 *  permanent key goes on working there, a key with an end runs to its end; a Monthly key is
 *  not renewed any more (its renewal code goes). */
export async function audioctorDeactivate(req, env, user) {
  if (!user) return json({ error: 'sign in first' }, 401);
  let body = {};
  try { body = await req.json(); } catch {}
  const machine = normMachine(body.machineId);
  if (!machine) return json({ error: 'That does not look like a machine ID.' }, 400);
  const sql = (renew) =>
    `UPDATE audioctor_activations SET status = 'deactivated'${renew ? ', renew_code = NULL' : ''}
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

const MAX_MACS = 2;      // Macs a purchase unlocks (as StreamDAW): another waits, refused, until one is deactivated

/* A rate limit on the shared `attempts` table (StreamDAW's liveThrottle): seconds to wait, or 0. */
async function throttle(env, bucket, max, windowSec) {
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

// ── helpers ────────────────────────────────────────────────────────────────
// ── helpers ────────────────────────────────────────────────────────────────
async function grantEntitlement(env, { email, ext_ref, amount, currency = 'ILS', plan, source, expiresAt }) {
  const existing = await env.DB.prepare('SELECT * FROM entitlements WHERE ext_ref = ?').bind(ext_ref).first();
  if (existing) return existing;
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(lc(email)).first();
  // Audioctor once does not end. Monthly ends with its key (the caller says when).
  if (expiresAt == null) expiresAt = null;      // Audioctor once does not end; Monthly says when
  const ins = await env.DB.prepare(
    `INSERT INTO entitlements (user_id, email, product, plan, status, source, ext_ref, amount, currency, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
  ).bind(u?.id || null, lc(email), PRODUCT, plan, source || 'hyp', ext_ref, amount, currency, now(), expiresAt).run();
  return { id: ins.meta.last_row_id, email: lc(email), plan, expires_at: expiresAt };
}

async function mintDownloadLink(env, entitlementId, email) {
  const token = urlToken(32);
  const h = await sha256b64(token);
  await env.DB.prepare(
    `INSERT INTO download_tokens (token_hash, entitlement_id, email, product, asset, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(h, entitlementId, lc(email), PRODUCT, ASSET, now(), now() + TOKEN_TTL).run();
  return `${SITE}/api/audioctor/download?t=${token}`;
}

function emailReceipt(env, to, link, machine, order) {
  const o = order || {};
  const money = (a) => (o.currency === 'USD' ? `$${(a / 100).toFixed(2)}` : `₪${(a / 100).toFixed(2)}`);
  const paid = typeof o.amount === 'number' ? (o.amount > 0 ? money(o.amount) + (o.currency === 'USD' ? ' (charged by Paddle, our reseller)' : '') : 'free (coupon)') : '';
  const when = new Date().toISOString().slice(0, 10);
  const lines = [
    o.ref ? `Order: ${o.ref}` : '',
    'Product: Audioctor, one payment, every Audioctor 1 update included, on up to 2 Macs',
    paid ? `Paid: ${paid}${o.coupon ? ` (coupon ${o.coupon})` : ''}` : '',
    `Date: ${when}`,
  ].filter(Boolean);
  const keyLine = machine
    ? `Your key for this Mac (${machine}) arrives in a second email in a minute: paste it into Audioctor (the licence line at the bottom left of its window) and press Unlock.`
    : `Get your key for each Mac you use on ${UNLOCK_URL} (sign in with this email).`;
  const text =
`Thanks for getting Audioctor.

${lines.join('\n')}

Download (a private link, good for 7 days; after that, from your account):
${link}

${keyLine}

Then: install the .pkg, open Audioctor (or its plug-in in your DAW) and drop a recording on the lab.

${mailLinksText()}

— Snowstar.Company`;
  const html = licenceMail({
    title: 'Welcome to Audioctor',
    intro: 'Thanks for getting Audioctor. Your download is below; your key follows.',
    steps: [
      'Download Audioctor and install the .pkg.',
      escHtml(keyLine),
      'Open Audioctor (or its plug-in in your DAW) and drop a recording on the lab.',
    ],
    button: { href: link, label: 'Download Audioctor' },
    footer: lines.map(escHtml).join('<br>') + '<br>The download link is private to you and good for 7 days; after that, download from <a href="' + ACCOUNT_URL + '">your account</a>.',
  });
  return sendMail(env, { to, subject: 'Your Audioctor receipt and download', text, html });
}


export async function audioctorAdmin(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const soft = async (sql, ...binds) => {
    try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; }
    catch { return []; }
  };

  const orders = await soft(
    `SELECT o.ref, o.email, o.plan, o.amount, o.currency, o.status, o.coupon,
            o.hyp_id, o.entitlement_id, o.created_at, o.settled_at,
            u.name AS user_name
       FROM audioctor_orders o LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 200`);

  const entitlements = await soft(
    `SELECT e.id, e.email, e.plan, e.status, e.source, e.amount, e.created_at,
            e.expires_at, e.revoked_at,
            (SELECT COUNT(*) FROM download_tokens t WHERE t.entitlement_id = e.id) AS tokens,
            (SELECT COALESCE(SUM(t.uses), 0) FROM download_tokens t WHERE t.entitlement_id = e.id) AS downloads
       FROM entitlements e WHERE e.product = 'audioctor'
      ORDER BY e.created_at DESC LIMIT 200`);

  const coupons = await soft(
    `SELECT id, code, kind, value, max_uses, used, expires_at, active, note, created_at
       FROM audioctor_coupons ORDER BY created_at DESC`);

  const releases = await soft(
    `SELECT asset, version, r2_key, filename, bytes, sha256, notarized, is_latest, created_at
       FROM app_releases WHERE asset = ? ORDER BY created_at DESC LIMIT 50`, ASSET);

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
      `SELECT COUNT(*) AS n FROM req_log WHERE route = '/audioctor/download/free' AND status = 200 AND ts > ?`,
      Math.floor(Date.now() / 1000) - 14 * 86400))[0] || {}).n || 0,
  };

  return json({
    orders, entitlements, coupons, releases, stats,
    /* Licence keys waiting to be minted. Oldest first: these are people who have
       paid and cannot use what they bought until someone runs the keygen. */
    activations: (await soft(
      `SELECT a.id, a.email, a.machine_id, a.owner_name, a.status, a.serial,
              a.requested_at, a.issued_at, a.expires_at
         FROM audioctor_activations a
        ORDER BY (a.status IN ('pending','renewing','limit')) DESC, a.requested_at ASC LIMIT 100`))
      // The command for "by hand", the same as the [Admin] email's: the v2 pair, and the end a key
      // must carry (Monthly), which the Worker checks before emailing it.
      .map((a) => ({ ...a, mint: mintCommand({ name: a.owner_name || a.email, email: a.email, machine: a.machine_id, expiresAt: a.expires_at }) })),

    /* Monthly: every subscription, its charges, MRR, charges HYP never answered, refunds owed. */
    ...(await (await subsMod()).subsAdmin(env).catch(() => ({}))),

    /* Who took the free installer (the trial). */
    onTrial: await soft(`SELECT d.user_id, u.email, u.name, d.version, d.created_at FROM audioctor_free_downloads d
                           LEFT JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 100`),

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

export { findCoupon, burnCoupon, newRef, grantFree, fulfilPaid, emailReceipt };
export { licenceMail, mailLinksText, escHtml, firstName, grantEntitlement, mintDownloadLink, requestKey, insertOrder,
         keyHex, keyLines, normMachine, hypConfigured, payPageParams, throttle,
         SITE, ACCOUNT_URL, UNLOCK_URL, TERMS_URL, HELP_MAIL, BASE as HYP_PAGE, MIN_APP };
