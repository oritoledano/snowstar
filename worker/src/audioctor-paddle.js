/**
 * Audioctor through Paddle (2026-10-27): Paddle is the merchant of record. The buyer pays in their own currency (Apple
 * Pay, PayPal, cards), Paddle files the VAT and sales tax, and the Worker still makes every key. Why Paddle, the fees
 * and the law: SNOWSTAR-ENHANCE marketing/BILLING-MOR.md.
 *
 * On when the var AUDIOCTOR_BILLING is 'paddle' and its secrets are set (PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET,
 * PADDLE_PRICE_ONCE; PADDLE_PRODUCT_ID for a coupon's one-off price; PADDLE_CLIENT_TOKEN for the page's Paddle.js;
 * PADDLE_ENV 'live', anything else is the sandbox). Off, everything stays on HYP as before: nothing here runs.
 *
 * Phase 1: Audioctor once ($49, in dollars). Monthly stays closed under Paddle until its own phase (renewals,
 * cancel-now with the unused days refunded, Consumer Protection Law §13D: Paddle's portal only cancels at the end).
 *
 *   1. POST /audioctor/checkout (audioctor.js hands over here): a Paddle transaction for this order (the catalog
 *      price, or a one-off price when a coupon applies), our AD- reference in its custom_data. The page opens
 *      Paddle.js on its id. Nothing is granted on the page's word.
 *   2. POST /audioctor/paddle/webhook: signed by Paddle (Paddle-Signature, HMAC-SHA256 over "ts:body", 5 minutes
 *      of tolerance), recorded once per event id. transaction.completed grants exactly as a verified HYP return
 *      does (audioctor.js fulfilPaid: the entitlement, the coupon, the download link, the key for the Mac, the
 *      receipt), after checking that what was paid for is this order's price. An approved full refund ends it.
 *   3. Reconcile: an order whose webhook never came asks Paddle for its transaction.
 */

import { sendMail } from './mail.js';
import { safeEqual } from './crypto.js';
import { couponProblem } from './coupons.js';
import * as SD from './audioctor.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => (e || '').trim().toLowerCase();
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';
const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const REF_RE = /^AD-[A-Z0-9]{4,20}$/;
const TOLERANCE = 300;                         // seconds a signed webhook stays good (Paddle's own suggestion)

const live = (env) => String(env.PADDLE_ENV || '') === 'live';
const API = (env) => (live(env) ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');

/** Is Audioctor sold through Paddle right now? */
export function paddleOn(env) {
  return String(env.AUDIOCTOR_BILLING || '') === 'paddle'
    && !!(env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET && env.PADDLE_PRICE_ONCE);
}

/** What the page needs for Paddle.js: never a secret (the client-side token is public by design). */
export function paddleClient(env) {
  return { environment: live(env) ? 'production' : 'sandbox', clientToken: env.PADDLE_CLIENT_TOKEN || null,
           prices: { lifetime: env.PADDLE_PRICE_ONCE || null, monthly: env.PADDLE_PRICE_MONTHLY || null } };
}

async function api(env, method, path, body) {
  const res = await fetch(API(env) + path, {
    method,
    headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, 'content-type': 'application/json', 'paddle-version': '1' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let d = null;
  try { d = JSON.parse(text); } catch { /* an HTML error page */ }
  if (!res.ok) {
    const why = d && d.error ? `${d.error.code || ''} ${d.error.detail || ''}`.trim() : text.slice(0, 200);
    const e = new Error(`Paddle ${method} ${path}: ${res.status} ${why}`);
    e.status = res.status;
    throw e;
  }
  return d && d.data;
}

// ── coupons, in dollars ──────────────────────────────────────────────────
/* A code's discount on a dollar price: percent as it is; 'usd' is cents off; 'amount' (agorot, the HYP-era kind)
   at today's rate. couponProblem's checks (active, expiry, uses, minimum) stay as they are, in shekels. */
export async function usdAfterCoupon(env, c, cents) {
  if (!c) return { cents, off: 0 };
  let off;
  if (c.kind === 'percent') off = Math.round((cents * Math.min(100, Math.max(0, c.value))) / 100);
  else if (c.kind === 'usd') off = Math.max(0, c.value);
  else off = Math.round(Math.max(0, c.value) * (await SD.shekelsFor(env, 100)).rate);   // agorot × USD per ILS
  off = Math.min(cents, off);
  return { cents: cents - off, off };
}
export const couponLabel = (c) => (c.kind === 'percent' ? `${c.value}% off` : c.kind === 'usd' ? `${usd(c.value)} off` : `₪${(c.value / 100).toFixed(0)} off`);

/** POST /audioctor/coupon/check under Paddle: the same answer, in dollars. */
export async function paddleCouponCheck(env, code) {
  const shekels = (await SD.shekelsFor(env, SD.ONCE_USD_CENTS)).amount;
  const c = await SD.findCoupon(env, code);
  const problem = couponProblem(c, shekels);
  if (problem) return json({ ok: false, reason: problem });
  const { cents, off } = await usdAfterCoupon(env, c, SD.ONCE_USD_CENTS);
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value, currency: 'USD', off, amount: cents, usdCents: cents,
                free: cents <= 0, label: couponLabel(c) });
}

// ── 1. checkout ──────────────────────────────────────────────────────────
/** Audioctor once, through Paddle. The caller (audioctorCheckout) has signed the person in and checked they don't
 *  own it already. Answers the page with the transaction Paddle.js opens. */
export async function paddleCheckout(env, user, body) {
  const email = lc(user.email);
  let cents = SD.ONCE_USD_CENTS, couponCode = null;
  if (body.coupon && String(body.coupon).trim()) {
    const c = await SD.findCoupon(env, body.coupon);
    const problem = couponProblem(c, (await SD.shekelsFor(env, SD.ONCE_USD_CENTS)).amount);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ cents } = await usdAfterCoupon(env, c, cents));
    couponCode = c.code;
  }
  const ref = SD.newRef();
  const machine = SD.normMachine(body.machine);
  const ownerName = String(user.name || body.name || '').trim().slice(0, 60) || null;

  // A coupon that covers it all: granted here, as on HYP, and Paddle never sees it.
  if (cents <= 0) return SD.grantFree(env, { ref, user, email, couponCode, machine, ownerName, currency: 'USD' });

  // The catalog price, or this order's own price (a coupon): Paddle charges what the order says, in dollars.
  let items;
  if (cents === SD.ONCE_USD_CENTS) items = [{ price_id: env.PADDLE_PRICE_ONCE, quantity: 1 }];
  else {
    if (!env.PADDLE_PRODUCT_ID) return json({ error: 'paddle_not_configured', reason: 'PADDLE_PRODUCT_ID' }, 503);
    items = [{ quantity: 1, price: {
      description: `Audioctor, one payment (code ${couponCode})`, name: 'Audioctor',
      product_id: env.PADDLE_PRODUCT_ID, tax_mode: 'account_setting',
      unit_price: { amount: String(cents), currency_code: 'USD' },
    } }];
  }
  await SD.insertOrder(env, { ref, userId: user.id, email, plan: 'lifetime', amount: cents, currency: 'USD', status: 'started',
                              coupon: couponCode, machine, ownerName });
  let txn;
  try {
    txn = await api(env, 'POST', '/transactions', {
      items, collection_mode: 'automatic',
      custom_data: { product: 'audioctor', ref, plan: 'lifetime', user_id: user.id || null, machine: machine || null },
    });
  } catch (e) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'declined' WHERE ref = ?`).bind(ref).run().catch(() => {});
    return json({ error: 'paddle_error', reason: String(e.message).slice(0, 200) }, 502);
  }
  if (!txn || !/^txn_[a-z0-9]+$/.test(String(txn.id || ''))) return json({ error: 'paddle_error', reason: 'no transaction id' }, 502);
  await env.DB.prepare('UPDATE audioctor_orders SET paddle_txn = ? WHERE ref = ?').bind(txn.id, ref).run();
  return json({ ok: true, ref, plan: 'lifetime', amount_gross: cents, currency: 'USD', email,
                paddle: { transactionId: txn.id, ...paddleClient(env) } });
}

// ── 2. the webhook ───────────────────────────────────────────────────────
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Paddle-Signature: "ts=…;h1=…" (more than one h1 while a secret is being rotated). */
export async function verifySignature(secret, header, raw, t = now()) {
  const parts = String(header || '').split(';').map((kv) => kv.trim().split('='));
  const ts = (parts.find(([k]) => k === 'ts') || [])[1];
  const h1s = parts.filter(([k]) => k === 'h1').map(([, v]) => v);
  if (!/^\d{9,11}$/.test(ts || '') || !h1s.length || Math.abs(t - Number(ts)) > TOLERANCE) return false;
  const mac = await hmacHex(secret, `${ts}:${raw}`);
  return h1s.some((h) => safeEqual(h, mac));
}

export async function audioctorPaddleWebhook(req, env) {
  if (!paddleOn(env)) return json({ error: 'not_configured' }, 503);
  const raw = await req.text();
  if (!(await verifySignature(env.PADDLE_WEBHOOK_SECRET, req.headers.get('paddle-signature'), raw))) return json({ error: 'bad_signature' }, 401);
  let ev;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  const id = String(ev.event_id || ''), type = String(ev.event_type || '');
  if (!/^evt_[a-z0-9]+$/.test(id)) return json({ error: 'bad_event' }, 400);
  // Once per event: Paddle sends again until it hears 200, and may send the same event twice.
  const ins = await env.DB.prepare(
    'INSERT INTO audioctor_paddle_events (event_id, type, received_at) VALUES (?, ?, ?) ON CONFLICT(event_id) DO NOTHING'
  ).bind(id, type, now()).run();
  if (!(ins.meta && ins.meta.changes === 1)) return json({ ok: true, duplicate: true });
  let outcome;
  try {
    if (type === 'transaction.completed') outcome = await onCompleted(env, ev.data || {});
    else if (type === 'adjustment.created' || type === 'adjustment.updated') outcome = await onAdjustment(env, ev.data || {});
    else outcome = 'ignored';
  } catch (e) {
    // Not handled: forget the event, so Paddle's next try is handled from the start (the grant is idempotent).
    await env.DB.prepare('DELETE FROM audioctor_paddle_events WHERE event_id = ?').bind(id).run().catch(() => {});
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Paddle): a webhook failed, Paddle will retry',
      text: `${type} ${id}: ${String(e && e.message || e).slice(0, 300)}\nPaddle retries on its own. If it keeps failing, Reconcile the order in the dashboard.` }).catch(() => {});
    return json({ error: 'failed' }, 500);
  }
  await env.DB.prepare('UPDATE audioctor_paddle_events SET outcome = ? WHERE event_id = ?').bind(String(outcome).slice(0, 200), id).run().catch(() => {});
  return json({ ok: true, outcome });
}

/* What the transaction paid for must be this order: the catalog price at $49, or the one-off price this order
   asked for (its dollars, our product). Anything else is not granted and the owner hears. */
function paidForOrder(env, t, order) {
  const it = (t.items || [])[0] || {}, pr = it.price || {};
  const priceId = pr.id || it.price_id;
  if (priceId === env.PADDLE_PRICE_ONCE && order.amount === SD.ONCE_USD_CENTS) return true;
  const u = pr.unit_price || {};
  return !!(env.PADDLE_PRODUCT_ID && pr.product_id === env.PADDLE_PRODUCT_ID && u.currency_code === 'USD' && Number(u.amount) === order.amount);
}

async function onCompleted(env, t) {
  const cd = t.custom_data || {};
  if (cd.product !== 'audioctor') return 'not audioctor';
  if (t.subscription_id || t.origin === 'subscription_recurring') return 'subscription: not sold under Paddle yet';
  const ref = String(cd.ref || '');
  if (!REF_RE.test(ref)) return 'no ref';
  const order = await env.DB.prepare('SELECT * FROM audioctor_orders WHERE ref = ?').bind(ref).first();
  if (!order) {
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Paddle): a payment for an order we do not have',
      text: `Paddle transaction ${t.id} completed with reference ${ref}, which is not in audioctor_orders. Nothing was granted. Check Paddle.` }).catch(() => {});
    return 'unknown ref';
  }
  if (order.paddle_txn && order.paddle_txn !== t.id) {
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Paddle): a second transaction for one order',
      text: `Order ${ref} belongs to ${order.paddle_txn}, and ${t.id} completed with the same reference. Nothing more was granted. `
          + `If the buyer paid twice, refund ${t.id} in Paddle.` }).catch(() => {});
    return 'other transaction';
  }
  if (order.status === 'granted' || order.status === 'granting') return 'already';
  if (!paidForOrder(env, t, order)) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'verify_failed', paddle_txn = COALESCE(paddle_txn, ?) WHERE ref = ?`).bind(t.id, ref).run();
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Paddle): paid for something other than the order',
      text: `Order ${ref} (${order.email}) is ${usd(order.amount)}; Paddle transaction ${t.id} paid for ${JSON.stringify((t.items || []).map((i) => i.price && (i.price.id || i.price.unit_price)))}. `
          + `Nothing was granted. Check it in Paddle, then Reconcile or refund.` }).catch(() => {});
    return 'item mismatch';
  }
  await env.DB.prepare('UPDATE audioctor_orders SET paddle_txn = COALESCE(paddle_txn, ?) WHERE ref = ?').bind(t.id, ref).run();
  const out = await SD.fulfilPaid(env, { ...order, paddle_txn: order.paddle_txn || t.id }, {}, 'paddle');
  return out && out.already ? 'already' : 'granted';
}

/* A refund approved in Paddle (by Ori, or Paddle's own fraud team): a full one ends the purchase here too.
   The keys already on a Mac are for good (offline, they cannot be called back); no new Mac, no new download. */
async function onAdjustment(env, a) {
  if (a.action !== 'refund' || a.status !== 'approved') return 'not an approved refund';
  const order = await env.DB.prepare('SELECT * FROM audioctor_orders WHERE paddle_txn = ?').bind(String(a.transaction_id || '')).first();
  if (!order) return 'not ours';
  const full = a.type === 'full' || (a.totals && Number(a.totals.total) >= order.amount);
  if (full) {
    if (order.entitlement_id) await env.DB.prepare(`UPDATE entitlements SET status = 'refunded' WHERE id = ?`).bind(order.entitlement_id).run();
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'refunded' WHERE ref = ?`).bind(order.ref).run();
  }
  await sendMail(env, { to: owner(env), subject: `Audioctor (Paddle): ${full ? 'refunded' : 'part refunded'}, ${order.ref}`,
    text: `${order.email}, order ${order.ref} (${a.transaction_id}): ${full ? 'a full refund. The purchase is ended here: no new Mac and no new download.'
        + ' Keys already pasted into a Mac stay working (they cannot be called back offline).' : 'a partial refund; nothing changed here.'}` }).catch(() => {});
  return full ? 'refunded' : 'partial refund';
}

// ── 3. reconcile: the webhook never came ─────────────────────────────────
/** For audioctorReconcile: Paddle's own record of the order's transaction decides. */
export async function paddleReconcile(env, order) {
  if (!order.paddle_txn) return { error: 'no_transaction' };
  const t = await api(env, 'GET', `/transactions/${encodeURIComponent(order.paddle_txn)}`);
  if (!t || (t.status !== 'completed' && t.status !== 'paid')) return { error: 'not_paid', status: t && t.status };
  const outcome = await onCompleted(env, { ...t, custom_data: { ...(t.custom_data || {}), product: 'audioctor', ref: order.ref } });
  return { ok: outcome === 'granted' || outcome === 'already', outcome };
}
