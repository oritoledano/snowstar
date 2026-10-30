/**
 * Audioctor through Paddle: subscriptions only (2026-10-30, the founder). $7 a month or $60 a year, renewed by Paddle,
 * cancelled any time; the Free plan lives in the app. Paddle is the merchant of record (SNOWSTAR-ENHANCE
 * marketing/BILLING-MOR.md, PRICING.md): it takes the payment, files the VAT and sales tax, issues the invoice and
 * renews. The Worker still makes every key. StreamDAW's engine (streamdaw-paddle.js), for one product and two plans.
 *
 * On when the var AUDIOCTOR_BILLING is 'paddle' and the secret PADDLE_API_KEY is set. PADDLE_ENV 'live' takes real
 * money; anything else is Paddle's sandbox. PADDLE_CLIENT_TOKEN (public by design) lets the page open Paddle.js.
 * Everything else Paddle hands out lives in D1 (audioctor_paddle_conf), made by the owner's "Set up Paddle" in the
 * dashboard: the product, its two prices, the webhook destination and its signing secret.
 *
 *   1. POST /audioctor/checkout {plan, coupon?, machine?} (audioctor.js hands over here): a Paddle transaction for
 *      that plan, our AD- reference in its custom_data. The page opens Paddle.js on its id. Nothing is granted on
 *      the page's word. A code applies to the first year only; one that covers it all grants here, with no Paddle.
 *   2. POST /audioctor/paddle/webhook: signed by Paddle (Paddle-Signature, HMAC-SHA256 over "ts:body", 5 minutes of
 *      tolerance), each event recorded once. transaction.completed grants the plan to the end of the billing period
 *      it paid for (+3 days, as Monthly); a renewal moves that end on and re-signs the Macs' keys quietly, and the
 *      app fetches each one by itself (the Renewal line, /audioctor/licence/refresh). subscription.* keeps the row's
 *      status for the app and the account. A full refund ends it, at Paddle too; the app drops its key.
 *   3. POST /audioctor/paddle/portal: Paddle's customer portal for the signed-in buyer (cancel, card, invoices).
 *   4. Reconcile: an order whose webhook never came asks Paddle for its transaction.
 *   5. The daily cron: a notice two weeks before a year renews.
 */

import { sendMail } from './mail.js';
import { safeEqual } from './crypto.js';
import { currentUser } from './session.js';
import { couponProblem } from './coupons.js';
import * as SD from './audioctor.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => (e || '').trim().toLowerCase();
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';
const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const secs = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);
const dayOf = (sec) => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
const REF_RE = /^AD-[A-Z0-9]{4,20}$/;
const TOLERANCE = 300;                         // seconds a signed webhook stays good (Paddle's own suggestion)
const GRACE = 3 * 86400;                       // a key runs this long past the period paid for (as Monthly)
const NOTICE_DAYS = 14;                        // a year's renewal is announced this long before
const EVENTS = ['transaction.completed', 'subscription.created', 'subscription.updated', 'subscription.canceled',
                'subscription.past_due', 'subscription.activated', 'subscription.resumed', 'subscription.paused',
                'adjustment.created', 'adjustment.updated'];

const live = (env) => String(env.PADDLE_ENV || '') === 'live';
const API = (env) => (live(env) ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');
const envName = (env) => (live(env) ? 'live' : 'sandbox');

/** Is Audioctor sold through Paddle (switched on, with a key)? Its prices may still be missing: see ready(). */
export const paddleOn = (env) => String(env.AUDIOCTOR_BILLING || '') === 'paddle' && !!env.PADDLE_API_KEY;

// ── settings Paddle handed out (D1) ─────────────────────────────────────────
async function conf(env) {
  const rows = ((await env.DB.prepare('SELECT k, v FROM audioctor_paddle_conf WHERE env = ?').bind(envName(env)).all()
    .catch(() => ({ results: [] }))).results) || [];
  return Object.fromEntries(rows.map((r) => [r.k, r.v]));
}
const putConf = (env, k, v) => env.DB.prepare(
  `INSERT INTO audioctor_paddle_conf (env, k, v, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(envName(env), k, String(v), now()).run();

/** Sold now: switched on, both prices made, the webhook signed. */
export async function ready(env) {
  if (!paddleOn(env)) return false;
  const c = await conf(env);
  return !!c.webhook_secret && !!c['price:monthly'] && !!c['price:year'];
}

/** What the page needs for Paddle.js: never a secret (the client-side token is public by design). */
export function paddleClient(env) {
  return { environment: live(env) ? 'production' : 'sandbox', clientToken: env.PADDLE_CLIENT_TOKEN || null };
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

/** POST /audioctor/paddle/setup — the owner, once per environment (again is harmless): makes the product and its two
 *  prices in Paddle when they are not there yet, and the webhook destination with its secret. */
export async function paddleSetup(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!env.PADDLE_API_KEY) return json({ error: 'no_api_key', reason: 'Set the PADDLE_API_KEY secret first.' }, 400);
  const c = await conf(env);
  const made = [];
  try {
    let pro = c.product;
    if (!pro) {
      const d = await api(env, 'POST', '/products', { name: 'Audioctor', tax_category: 'standard',
        description: 'Takes any recording apart and cleans every part, on your Mac.', custom_data: { app: 'audioctor' } });
      pro = d.id; await putConf(env, 'product', pro); made.push(pro);
    }
    for (const [plan, p] of Object.entries(SD.PLANS)) {
      if (c[`price:${plan}`]) continue;
      const d = await api(env, 'POST', '/prices', {
        product_id: pro, name: p.every === 'year' ? 'Yearly' : 'Monthly',
        description: `${p.name}, billed ${p.every === 'year' ? 'yearly' : 'monthly'}`,
        unit_price: { amount: String(p.usdCents), currency_code: 'USD' },
        billing_cycle: { interval: p.every, frequency: 1 }, tax_mode: 'internal',
        custom_data: { app: 'audioctor', plan } });
      await putConf(env, `price:${plan}`, d.id); made.push(d.id);
    }
    if (!c.webhook_secret) {
      const d = await api(env, 'POST', '/notification-settings', {
        description: 'Audioctor (snowstar.company Worker)', destination: `${SD.SITE}/api/audioctor/paddle/webhook`,
        type: 'url', api_version: 1, include_sensitive_fields: false, subscribed_events: EVENTS });
      await putConf(env, 'webhook_id', d.id);
      await putConf(env, 'webhook_secret', d.endpoint_secret_key);
      made.push(d.id);
    }
  } catch (e) {
    return json({ error: 'paddle', reason: String(e.message || e).slice(0, 300), made }, 502);
  }
  return json({ ok: true, env: envName(env), made, ready: await ready(env) });
}

// ── coupons, in dollars ─────────────────────────────────────────────────────
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

/** POST /audioctor/coupon/check under Paddle: what a code does to the first year, in dollars. */
export async function paddleCouponCheck(env, code) {
  const year = SD.PLANS.year.usdCents;
  const c = await SD.findCoupon(env, code);
  const problem = couponProblem(c, (await SD.shekelsFor(env, year)).amount);
  if (problem) return json({ ok: false, reason: problem });
  const { cents, off } = await usdAfterCoupon(env, c, year);
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value, currency: 'USD', off, amount: cents, usdCents: cents,
                free: cents <= 0, label: `${couponLabel(c)} the first year` });
}

/** The Paddle discount behind a code, made the first time it is needed: the first payment of a year only. Never typed
 *  into Paddle's own checkout: only this Worker applies it, after its own checks. */
async function discountFor(env, c, off, cf) {
  const k = `discount:${c.code}`;
  if (cf[k]) return cf[k];
  const percent = c.kind === 'percent';
  const d = await api(env, 'POST', '/discounts', {
    description: `Audioctor code ${c.code}`, type: percent ? 'percentage' : 'flat', amount: String(percent ? c.value : off),
    ...(percent ? {} : { currency_code: 'USD' }), enabled_for_checkout: false, recur: false, restrict_to: [cf['price:year']],
    ...(c.expires_at ? { expires_at: new Date(c.expires_at * 1000).toISOString() } : {}) });
  await putConf(env, k, d.id);
  return d.id;
}

// ── 1. checkout ─────────────────────────────────────────────────────────────
async function subsOf(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT * FROM audioctor_paddle_subs WHERE (email = ? OR (? IS NOT NULL AND user_id = ?)) ORDER BY created_at DESC`
  ).bind(lc(email), userId || null, userId || null).all().catch(() => ({ results: [] }))).results) || [];
}
const running = (s) => s && ['active', 'trialing', 'past_due'].includes(s.status) && !s.cancel_at;

async function customerId(env, email, name) {
  try {
    return (await api(env, 'POST', '/customers', { email, ...(name ? { name } : {}) })).id;
  } catch (e) {
    const m = /ctm_[a-z0-9]+/.exec(String(e.message));           // "already exists": Paddle names it
    if (m) return m[0];
    const d = await api(env, 'GET', `/customers?email=${encodeURIComponent(email)}`);
    if (d && d[0]) return d[0].id;
    throw e;
  }
}

/** A plan, through Paddle. The caller (audioctorCheckout) has signed the person in and checked they don't own it for
 *  good already. Answers the page with the transaction Paddle.js opens. */
export async function paddleCheckout(env, user, body) {
  if (!(await ready(env))) return json({ error: 'not_ready', reason: 'Buying opens soon. The free download is there now.' }, 503);
  const email = lc(user.email);
  const plan = body.plan === 'monthly' ? 'monthly' : 'year';
  if ((await subsOf(env, email, user.id)).some(running))
    return json({ error: 'already_subscribed', reason: 'You have Audioctor already. Manage it in your account.' }, 409);
  const list = SD.PLANS[plan].usdCents;
  let cents = list, off = 0, c = null;
  if (body.coupon && String(body.coupon).trim()) {
    if (plan !== 'year') return json({ error: 'coupon', reason: 'Codes are for the Yearly plan.' }, 400);
    c = await SD.findCoupon(env, body.coupon);
    const problem = couponProblem(c, (await SD.shekelsFor(env, list)).amount);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ cents, off } = await usdAfterCoupon(env, c, list));
  }
  const ref = SD.newRef();
  const machine = SD.normMachine(body.machine);
  const ownerName = String(user.name || body.name || '').trim().slice(0, 60) || null;

  // A code that covers it all: the year, granted here, and Paddle never sees it. Nothing renews it.
  if (cents <= 0) return SD.grantFree(env, { ref, user, email, couponCode: c.code, machine, ownerName, currency: 'USD',
                                             plan, expiresAt: now() + 365 * 86400 + GRACE });
  const cf = await conf(env);
  await SD.insertOrder(env, { ref, userId: user.id, email, plan, amount: cents, currency: 'USD', status: 'started',
                              coupon: c ? c.code : null, machine, ownerName });
  let txn;
  try {
    const discountId = c ? await discountFor(env, c, off, cf) : null;
    const ctm = await customerId(env, email, ownerName);
    txn = await api(env, 'POST', '/transactions', {
      items: [{ price_id: cf[`price:${plan}`], quantity: 1 }], customer_id: ctm, collection_mode: 'automatic',
      ...(discountId ? { discount_id: discountId } : {}),
      custom_data: { product: 'audioctor', ref, plan, user_id: user.id || null, machine: machine || null },
    });
  } catch (e) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'declined' WHERE ref = ?`).bind(ref).run().catch(() => {});
    return json({ error: 'paddle_error', reason: 'Checkout could not open. Nothing was charged. Please try again.', detail: String(e.message).slice(0, 200) }, 502);
  }
  if (!txn || !/^txn_[a-z0-9]+$/.test(String(txn.id || ''))) return json({ error: 'paddle_error', reason: 'no transaction id' }, 502);
  await env.DB.prepare('UPDATE audioctor_orders SET paddle_txn = ? WHERE ref = ?').bind(txn.id, ref).run();
  return json({ ok: true, ref, plan, amount_gross: cents, currency: 'USD', email, paddle: { transactionId: txn.id, ...paddleClient(env) } });
}

// ── 2. the webhook ──────────────────────────────────────────────────────────
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Paddle-Signature: "ts=…;h1=…" (more than one h1 while a secret is being rotated). */
export async function verifySignature(secret, header, raw, t = now()) {
  if (!secret) return false;
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
  const cf = await conf(env);
  if (!(await verifySignature(cf.webhook_secret, req.headers.get('paddle-signature'), raw))) return json({ error: 'bad_signature' }, 401);
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
    if (type === 'transaction.completed') outcome = await periodPaid(env, ev.data || {}, cf);
    else if (type.startsWith('subscription.')) outcome = await subChanged(env, ev.data || {});
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

const planOfPrice = (cf, priceId) => (!priceId ? null : priceId === cf['price:monthly'] ? 'monthly' : priceId === cf['price:year'] ? 'year' : null);
const priceIdOf = (t) => { const it = (t.items || [])[0] || {}; return (it.price && it.price.id) || it.price_id || null; };

/* The row that ties a subscription to its entitlement. Written once; a repeat of the first payment finds it there. */
const keepSub = (env, t, sub, plan, ends, entId, email, userId, ref) => env.DB.prepare(
  `INSERT INTO audioctor_paddle_subs (sub_id, env, user_id, email, customer_id, plan, status, entitlement_id, period_end, first_ref, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?) ON CONFLICT (sub_id) DO NOTHING`
).bind(sub, envName(env), userId || null, lc(email), t.customer_id || null, plan, entId, ends, ref, now(), now()).run();

/** A paid billing period: the plan to its end (+3 days). The first payment grants as a verified return does (the
 *  entitlement, the code, the download link, the key for the Mac, the receipt); a renewal moves the end on and re-signs
 *  the keys quietly. */
async function periodPaid(env, t, cf) {
  const cd = t.custom_data || {};
  const plan = planOfPrice(cf, priceIdOf(t));
  if (!plan && cd.product !== 'audioctor') return 'not audioctor';            // StreamDAW's, on the same Paddle account
  const sub = t.subscription_id;
  const ends = secs(t.billing_period && t.billing_period.ends_at);
  const row = sub ? await env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE sub_id = ?').bind(sub).first() : null;
  if (row) {
    if (!ends || ends <= Number(row.period_end || 0)) return 'already';
    const expiresAt = ends + GRACE;
    await env.DB.prepare('UPDATE entitlements SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?').bind(expiresAt, row.entitlement_id).run();
    await env.DB.prepare(`UPDATE audioctor_paddle_subs SET period_end = ?, status = 'active', updated_at = ? WHERE sub_id = ?`).bind(ends, now(), sub).run();
    await env.DB.prepare(
      `UPDATE audioctor_activations SET expires_at = ?, status = CASE WHEN status IN ('issued','renewing') THEN 'renewing' ELSE status END
        WHERE entitlement_id = ? AND status IN ('issued','renewing','pending')`
    ).bind(expiresAt, row.entitlement_id).run();
    await SD.mintWaiting(env, row.entitlement_id).catch(() => {});
    return 'renewed';
  }
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
  if (order.status === 'granting') return 'already';
  if (order.status !== 'granted' && (plan !== order.plan || !sub || !ends)) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'verify_failed', paddle_txn = COALESCE(paddle_txn, ?) WHERE ref = ?`).bind(t.id, ref).run();
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Paddle): paid for something other than the order',
      text: `Order ${ref} (${order.email}) is ${order.plan}, ${usd(order.amount)}; Paddle transaction ${t.id} paid for ${JSON.stringify(priceIdOf(t))}`
          + `${sub ? '' : ', with no subscription'}. Nothing was granted. Check it in Paddle, then Reconcile or refund.` }).catch(() => {});
    return 'item mismatch';
  }
  await env.DB.prepare('UPDATE audioctor_orders SET paddle_txn = COALESCE(paddle_txn, ?) WHERE ref = ?').bind(t.id, ref).run();
  let entId = order.entitlement_id;
  if (order.status !== 'granted') {
    const out = await SD.fulfilPaid(env, { ...order, paddle_txn: order.paddle_txn || t.id }, {}, 'paddle', ends + GRACE);
    if (out.already) return 'already';
    entId = out.ent.id;
  }
  await keepSub(env, t, sub, plan, ends, entId, order.email, order.user_id, ref);
  return order.status === 'granted' ? 'already' : 'granted';
}

async function subChanged(env, s) {
  const sched = s.scheduled_change && s.scheduled_change.action === 'cancel' ? secs(s.scheduled_change.effective_at) : null;
  const res = await env.DB.prepare(
    `UPDATE audioctor_paddle_subs SET status = ?, cancel_at = ?, next_billed_at = ?, customer_id = COALESCE(customer_id, ?), updated_at = ? WHERE sub_id = ?`
  ).bind(String(s.status || 'active'), sched || (s.status === 'canceled' ? secs(s.canceled_at) || now() : null),
         secs(s.next_billed_at), s.customer_id || null, now(), String(s.id || '')).run();
  return res.meta && res.meta.changes ? 'subscription' : 'not ours';
}

/* A refund approved in Paddle (by Ori, or Paddle's own fraud team): a full one ends the plan here and at Paddle, and the
   app drops its key at its next check (the refresh route's revoke). */
async function onAdjustment(env, a) {
  if (a.action !== 'refund' || a.status !== 'approved') return 'not an approved refund';
  const order = await env.DB.prepare('SELECT * FROM audioctor_orders WHERE paddle_txn = ?').bind(String(a.transaction_id || '')).first();
  const sub = await env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE sub_id = ? OR entitlement_id = ?')
    .bind(String(a.subscription_id || ''), order && order.entitlement_id || -1).first();
  if (!order && !sub) return 'not ours';
  const full = a.type === 'full' || !!(order && a.totals && Number(a.totals.total) >= order.amount);
  let stopped = true;
  if (full) {
    const entId = (order && order.entitlement_id) || (sub && sub.entitlement_id);
    if (entId) await env.DB.prepare(`UPDATE entitlements SET status = 'refunded' WHERE id = ?`).bind(entId).run();
    if (order) await env.DB.prepare(`UPDATE audioctor_orders SET status = 'refunded' WHERE ref = ?`).bind(order.ref).run();
    if (sub && running(sub)) {
      try { await api(env, 'POST', `/subscriptions/${encodeURIComponent(sub.sub_id)}/cancel`, { effective_from: 'immediately' }); }
      catch { stopped = false; }
      await env.DB.prepare(`UPDATE audioctor_paddle_subs SET status = 'canceled', cancel_at = ?, updated_at = ? WHERE sub_id = ?`).bind(now(), now(), sub.sub_id).run();
    }
  }
  const who = (order && order.email) || sub.email, what = order ? order.ref : sub.sub_id;
  await sendMail(env, { to: owner(env), subject: `Audioctor (Paddle): ${full ? 'refunded' : 'part refunded'}, ${what}`,
    text: `${who}, ${what} (${a.transaction_id}): ${full ? 'a full refund. The plan is ended here, and the app drops its key at its next check.'
        + (stopped ? '' : ` Paddle did not stop the subscription: cancel ${sub.sub_id} there by hand, or it charges again.`) : 'a partial refund; nothing changed here.'}` }).catch(() => {});
  return full ? 'refunded' : 'partial refund';
}

// ── 3. the buyer's side ─────────────────────────────────────────────────────
/** POST /audioctor/paddle/portal — Paddle's own page for the signed-in buyer's subscription: cancel, card, invoices. */
export async function paddlePortal(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const subs = (await subsOf(env, user.email, user.id)).filter((s) => s.customer_id && s.env === envName(env));
  if (!subs.length) return json({ error: 'none', reason: 'There is no Audioctor subscription on this account.' }, 404);
  try {
    const d = await api(env, 'POST', `/customers/${subs[0].customer_id}/portal-sessions`, { subscription_ids: subs.map((s) => s.sub_id).slice(0, 25) });
    return json({ ok: true, url: d.urls.general.overview });
  } catch { return json({ error: 'paddle', reason: 'Could not open the subscription page. Please try again.' }, 502); }
}

/** The account's subscriptions, for /audioctor/mine. */
export async function paddleSubsFor(env, email, userId) {
  return (await subsOf(env, email, userId)).map((s) => ({ plan: s.plan, status: s.status, periodEnd: s.period_end,
    cancelAt: s.cancel_at || null, nextBilledAt: s.next_billed_at || null }));
}
export async function paddleSubOfEntitlement(env, entId) {
  return env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE entitlement_id = ?').bind(entId).first().catch(() => null);
}

// ── 4. reconcile: the webhook never came ────────────────────────────────────
/** For audioctorReconcile: Paddle's own record of the order's transaction decides. */
export async function paddleReconcile(env, order) {
  if (!order.paddle_txn) return { error: 'no_transaction' };
  const t = await api(env, 'GET', `/transactions/${encodeURIComponent(order.paddle_txn)}`);
  if (!t || (t.status !== 'completed' && t.status !== 'paid')) return { error: 'not_paid', status: t && t.status };
  const outcome = await periodPaid(env, { ...t, custom_data: { ...(t.custom_data || {}), product: 'audioctor', ref: order.ref } }, await conf(env));
  return { ok: outcome === 'granted' || outcome === 'already', outcome };
}

// ── 5. the daily cron ───────────────────────────────────────────────────────
/** A yearly subscriber hears two weeks before Paddle charges again. One day's window, so each year's notice goes once. */
export async function paddleRenewalNotices(env, t = now()) {
  if (!paddleOn(env)) return { sent: 0 };
  const from = t + NOTICE_DAYS * 86400;
  const rows = ((await env.DB.prepare(
    `SELECT * FROM audioctor_paddle_subs WHERE env = ? AND plan = 'year' AND status = 'active' AND cancel_at IS NULL
        AND COALESCE(next_billed_at, period_end) >= ? AND COALESCE(next_billed_at, period_end) < ?`
  ).bind(envName(env), from, from + 86400).all()).results) || [];
  let sent = 0;
  for (const s of rows) {
    const day = dayOf(s.next_billed_at || s.period_end), price = usd(SD.PLANS.year.usdCents);
    await sendMail(env, { to: s.email, subject: `Your Audioctor year renews on ${day}`,
      text: `Your Audioctor Yearly renews on ${day}, for ${price}. Nothing to do if you want to keep it: your Mac picks up its new key by itself.\n\n`
          + `To stop it, cancel in your account before that day: ${SD.ACCOUNT_URL}\nWhat you paid for runs to its end, and Audioctor then stays on the Free plan.\n\n`
          + `${SD.mailLinksText()}\n\n— Snowstar.Company` }).then(() => { sent++; }).catch(() => {});
  }
  return { sent };
}
