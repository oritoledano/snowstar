/**
 * StreamDAW sold through Paddle (2026-10-29, the founder): Paddle is the merchant of record. It takes the payment
 * (cards, Apple Pay, PayPal), files the VAT and sales tax, issues the buyer's invoice and renews the subscription;
 * the Worker still makes every key. Replaces HYP for StreamDAW's products (HYP could not renew a card without the
 * acquirer's say-so, and issued no invoice abroad).
 *
 * On when the var STREAMDAW_BILLING is 'paddle' and the secret PADDLE_API_KEY is set. PADDLE_ENV 'live' takes real
 * money; anything else is Paddle's sandbox. PADDLE_CLIENT_TOKEN (public by design) lets the page open Paddle.js.
 * Everything else Paddle hands out lives in D1 (streamdaw_paddle_conf), made by the owner's "Set up Paddle" in the
 * dashboard: the products, their prices, the webhook destination and its signing secret.
 *
 * The plans (decided 2026-10-29): each product $7 a month or $60 a year ($5 a month); All products $15 a month or
 * $144 a year ($12 a month). US dollars, tax included (Paddle localises the currency). Master stays free.
 *
 *   1. POST /streamdaw/checkout {product, period, coupon?, machine?} (streamdaw.js hands over here): a Paddle
 *      transaction for that plan, our SD- reference and the account in its custom_data. The page opens Paddle.js
 *      on its id. Nothing is granted on the page's word. A "free" coupon grants here, with no Paddle at all.
 *   2. POST /streamdaw/paddle/webhook: signed by Paddle (Paddle-Signature: HMAC-SHA256 over "ts:body", 5 minutes of
 *      tolerance), each event recorded once. transaction.completed grants the plan to the end of the billing period
 *      it paid for (+3 days, as Pro Monthly), first payment and every renewal alike; the account's Macs get a key
 *      naming that end, and the app fetches each later key by itself (the Renewal line, /streamdaw/licence/refresh).
 *      subscription.* keeps the row's status (cancel at the period's end, past due) for the account page.
 *   3. POST /streamdaw/paddle/portal: Paddle's customer portal for the signed-in buyer (cancel, card, invoices).
 */

import { safeEqual } from './crypto.js';
import { currentUser } from './session.js';
import { normCode } from './coupons.js';
import * as SD from './streamdaw.js';
import * as P from './streamdaw-products.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => String(e || '').trim().toLowerCase();
const TOLERANCE = 300;                 // seconds a signed webhook stays good (Paddle's own suggestion)
const GRACE = 3 * 86400;               // a key runs this long past the period paid for (as Pro Monthly)
const EVENTS = ['transaction.completed', 'subscription.created', 'subscription.updated', 'subscription.canceled',
                'subscription.past_due', 'subscription.activated', 'subscription.resumed', 'subscription.paused'];

export const live = (env) => String(env.PADDLE_ENV || '') === 'live';
const API = (env) => (live(env) ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');
const envName = (env) => (live(env) ? 'live' : 'sandbox');

/** Is StreamDAW sold through Paddle (switched on, with a key)? Its prices may still be missing: see ready(). */
// Only a client-side token (test_… / live_…) ever reaches a page: an API key pasted into the wrong secret stays home.
const clientToken = (env) => /^(test|live)_[A-Za-z0-9]+$/.test(env.PADDLE_CLIENT_TOKEN || '') ? env.PADDLE_CLIENT_TOKEN : null;
export const paddleOn = (env) => String(env.STREAMDAW_BILLING || '') === 'paddle' && !!env.PADDLE_API_KEY;

// ── settings Paddle handed out (D1) ─────────────────────────────────────────
async function conf(env) {
  const rows = ((await env.DB.prepare('SELECT k, v FROM streamdaw_paddle_conf WHERE env = ?').bind(envName(env)).all()
    .catch(() => ({ results: [] }))).results) || [];
  return Object.fromEntries(rows.map((r) => [r.k, r.v]));
}
const putConf = (env, k, v) => env.DB.prepare(
  `INSERT INTO streamdaw_paddle_conf (env, k, v, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(envName(env), k, String(v), now()).run();

/** Sold now: switched on, every price made, the webhook signed. */
export async function ready(env) {
  if (!paddleOn(env)) return false;
  const c = await conf(env);
  return !!c.webhook_secret && P.PAID.concat('all').every((id) => c[`price:${id}:month`] && c[`price:${id}:year`]);
}

async function api(env, method, path, body) {
  const res = await fetch(API(env) + path, {
    method,
    headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error(`paddle ${method} ${path}: ${res.status} ${(d && d.error && (d.error.code + ' ' + (d.error.detail || ''))) || ''}`.trim());
    e.status = res.status; e.paddle = d && d.error;
    throw e;
  }
  return d;
}

// ── the catalog ─────────────────────────────────────────────────────────────
/** What the page shows: dollars a month for each plan (the year as its monthly figure and its whole). */
export function catalog() {
  const out = {};
  for (const id of P.PAID.concat('all')) {
    const c = P.CATALOG[id];
    out[id] = { name: P.NAMES[id], month: c.month, year: c.year, yearMonthly: Math.round(c.year / 12) };
  }
  return out;
}

/** POST /streamdaw/paddle/setup — the owner, once per environment (again is harmless): makes the six products and
 *  their twelve prices in Paddle when they are not there yet, and the webhook destination with its secret. */
export async function paddleSetup(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!env.PADDLE_API_KEY) return json({ error: 'no_api_key', reason: 'Set the PADDLE_API_KEY secret first.' }, 400);
  const c = await conf(env);
  const made = [];
  try {
    for (const id of P.PAID.concat('all')) {
      let pro = c[`product:${id}`];
      if (!pro) {
        const d = await api(env, 'POST', '/products', {
          name: `StreamDAW ${P.NAMES[id]}`, tax_category: 'standard',
          description: id === 'all' ? 'Every StreamDAW product: Splits, Station, Record, Compare and Party.' : `StreamDAW ${P.NAMES[id]}.`,
          custom_data: { sdaw: id } });
        pro = d.data.id; await putConf(env, `product:${id}`, pro); made.push(pro);
      }
      for (const period of ['month', 'year']) {
        if (c[`price:${id}:${period}`]) continue;
        const d = await api(env, 'POST', '/prices', {
          product_id: pro, name: period === 'month' ? 'Monthly' : 'Yearly',
          description: `StreamDAW ${P.NAMES[id]}, billed ${period === 'month' ? 'monthly' : 'yearly'}`,
          unit_price: { amount: String(P.CATALOG[id][period]), currency_code: 'USD' },
          billing_cycle: { interval: period, frequency: 1 }, tax_mode: 'internal',
          custom_data: { sdaw: id, period } });
        await putConf(env, `price:${id}:${period}`, d.data.id); made.push(d.data.id);
      }
    }
    if (!c.webhook_secret) {
      const d = await api(env, 'POST', '/notification-settings', {
        description: 'StreamDAW (snowstar.company Worker)', destination: `${SD.SITE}/api/streamdaw/paddle/webhook`,
        type: 'url', api_version: 1, include_sensitive_fields: false,
        subscribed_events: EVENTS });
      await putConf(env, 'webhook_id', d.data.id);
      await putConf(env, 'webhook_secret', d.data.endpoint_secret_key);
      made.push(d.data.id);
    }
  } catch (e) {
    return json({ error: 'paddle', reason: String(e.message || e).slice(0, 300), made }, 502);
  }
  return json({ ok: true, env: envName(env), made, ready: await ready(env) });
}

// ── checkout ────────────────────────────────────────────────────────────────
const planOfPrice = (c, priceId) => {
  for (const [k, v] of Object.entries(c)) if (v === priceId && k.startsWith('price:')) { const [, id, period] = k.split(':'); return `${id}:${period}`; }
  return null;
};
async function subsOf(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT * FROM streamdaw_paddle_subs WHERE (email = ? OR (? IS NOT NULL AND user_id = ?)) ORDER BY created_at DESC`
  ).bind(lc(email), userId || null, userId || null).all().catch(() => ({ results: [] }))).results) || [];
}
const running = (s) => s && ['active', 'trialing', 'past_due'].includes(s.status) && !s.cancel_at;

async function customerId(env, email, name) {
  try {
    const d = await api(env, 'POST', '/customers', { email, ...(name ? { name } : {}) });
    return d.data.id;
  } catch (e) {
    const m = /ctm_[a-z0-9]+/.exec(String(e.paddle && e.paddle.detail || ''));
    if (m) return m[0];
    const d = await api(env, 'GET', `/customers?email=${encodeURIComponent(email)}`);
    if (d.data && d.data[0]) return d.data[0].id;
    throw e;
  }
}

/** Has this account bought StreamDAW before (anything, ever)? For a "new customers only" code. */
async function boughtBefore(env, email, userId) {
  const r = await env.DB.prepare(
    `SELECT 1 FROM entitlements WHERE product = 'streamdaw' AND (email = ? OR (? IS NOT NULL AND user_id = ?)) LIMIT 1`
  ).bind(lc(email), userId || null, userId || null).first().catch(() => null);
  return !!r;
}

async function findCoupon(env, code) {
  const c = normCode(code);
  if (!c) return null;
  return env.DB.prepare('SELECT * FROM streamdaw_coupons WHERE code = ?').bind(c).first().catch(() => null);
}
const couponProducts = (c) => String((c && c.products) || '').split(',').filter(Boolean);

/** Why `c` cannot be used for `plan` by this account, or ''. */
export async function couponWhy(env, c, plan, email, userId) {
  if (!c || !c.active) return 'That code isn’t valid.';
  if (c.expires_at && c.expires_at < now()) return 'That code has expired.';
  if (c.max_uses && c.used >= c.max_uses) return 'That code has been used up.';
  const id = String(plan).split(':')[0];
  const only = couponProducts(c);
  if (only.length && !only.includes(id)) return `That code is for ${only.map((x) => P.NAMES[x] || x).join(' or ')}.`;
  if (c.first_only && await boughtBefore(env, email, userId)) return 'That code is for a first purchase.';
  return '';
}

/** What a code does, in words, for the page: "15% off the first payment", "3 months free". */
export function couponWords(c) {
  const n = Number(c.months || 0);
  if (c.kind === 'free') return n ? `${n} month${n > 1 ? 's' : ''} free` : 'free';
  const off = c.kind === 'amount' ? `$${(c.value / 100).toFixed(0)} off` : `${c.value}% off`;
  return n > 1 ? `${off} the first ${n} payments` : n === 1 ? `${off} the first payment` : `${off} every payment`;
}

/** The Paddle discount behind a %/$ code, made the first time it is needed. Never typed into Paddle's own checkout:
 *  only this Worker applies it, after its own checks (new customers only and the like). */
async function discountFor(env, c) {
  if (c.paddle_discount_id && c.paddle_env === envName(env)) return c.paddle_discount_id;
  const cf = await conf(env);
  const only = couponProducts(c);
  const ids = only.length ? only : P.PAID.concat('all');
  const n = Number(c.months || 0);
  const d = await api(env, 'POST', '/discounts', {
    description: `StreamDAW code ${c.code}${c.note ? ' · ' + String(c.note).slice(0, 80) : ''}`,
    type: c.kind === 'amount' ? 'flat' : 'percentage',
    amount: String(c.value),                         // percent 1..100, or US cents off
    ...(c.kind === 'amount' ? { currency_code: 'USD' } : {}),
    enabled_for_checkout: false,
    recur: n !== 1, ...(n > 1 ? { maximum_recurring_intervals: n - 1 } : {}),
    restrict_to: ids.flatMap((id) => [cf[`price:${id}:month`], cf[`price:${id}:year`]]).filter(Boolean),
    ...(c.expires_at ? { expires_at: new Date(c.expires_at * 1000).toISOString() } : {}),
  });
  await env.DB.prepare('UPDATE streamdaw_coupons SET paddle_discount_id = ?, paddle_env = ? WHERE id = ?')
    .bind(d.data.id, envName(env), c.id).run();
  return d.data.id;
}

/** POST /streamdaw/coupon/check {code, product?} — what a code does, before anyone pays. */
export async function paddleCouponCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const c = await findCoupon(env, b.code);
  const user = await currentUser(req, env).catch(() => null);
  const plan = `${String(b.product || (couponProducts(c)[0] || 'all'))}:month`;
  const why = await couponWhy(env, c, plan, user && user.email, user && user.id);
  if (why) return json({ ok: false, reason: why });
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value, months: c.months || 0, products: couponProducts(c),
                free: c.kind === 'free', label: couponWords(c) });
}

/** The checkout for one plan, Paddle's way (streamdawCheckout hands over here). */
export async function paddleCheckout(env, user, body) {
  if (!(await ready(env))) return json({ error: 'not_ready', reason: 'Buying opens in a few days. Start your free week now.' }, 503);
  const email = lc(user.email);
  const id = String(body.product || '').toLowerCase(), period = String(body.period || 'year').toLowerCase();
  const plan = `${id}:${period}`;
  if (!P.parsePlan(plan) || !['month', 'year'].includes(period)) return json({ error: 'no_such_product', reason: 'There is no such plan.' }, 400);
  const subs = await subsOf(env, email, user.id);
  const same = subs.find((s) => running(s) && (s.plan.split(':')[0] === id || s.plan.split(':')[0] === 'all'));
  if (same) return json({ error: 'already_subscribed', reason: `You have ${P.NAMES[same.plan.split(':')[0]]} already. Manage it in your account.` }, 409);
  const why0 = P.cannotBuy(plan, await accountRows(env, email, user.id), now());
  if (why0) return json({ error: 'owned', reason: why0 }, 409);

  const machine = SD.normMachine(body.machine);
  const ownerName = String(user.name || '').trim().slice(0, 60) || null;
  const ref = 'SD-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();

  let c = null;
  if (body.coupon && String(body.coupon).trim()) {
    c = await findCoupon(env, body.coupon);
    const why = await couponWhy(env, c, plan, email, user.id);
    if (why) return json({ error: 'coupon', reason: why }, 400);
  }

  // A free code: the plan for its months, granted here. No Paddle, no card.
  if (c && c.kind === 'free') {
    const months = Math.max(1, Number(c.months || 1));
    const end = new Date(); end.setUTCMonth(end.getUTCMonth() + months);
    const expiresAt = Math.floor(end.getTime() / 1000) + GRACE;
    await SD.insertOrder(env, { ref, userId: user.id, email, plan, amount: 0, status: 'granted', coupon: c.code, machine, ownerName });
    const ent = await SD.grantEntitlement(env, { email, ext_ref: ref, amount: 0, plan, source: 'coupon', expiresAt });
    await env.DB.prepare('UPDATE streamdaw_coupons SET used = used + 1 WHERE id = ?').bind(c.id).run().catch(() => {});
    const link = await SD.mintDownloadLink(env, ent.id, email);
    await keysFor(env, ent, machine, ownerName);
    await env.DB.prepare('UPDATE streamdaw_orders SET entitlement_id = ?, settled_at = ? WHERE ref = ?').bind(ent.id, now(), ref).run().catch(() => {});
    return json({ ok: true, free: true, ref, plan, until: expiresAt - GRACE, download: link });
  }

  const cf = await conf(env);
  let discountId = null;
  try {
    if (c) discountId = await discountFor(env, c);
    const ctm = await customerId(env, email, ownerName);
    const t = await api(env, 'POST', '/transactions', {
      items: [{ price_id: cf[`price:${id}:${period}`], quantity: 1 }],
      customer_id: ctm, collection_mode: 'automatic',
      ...(discountId ? { discount_id: discountId } : {}),
      custom_data: { sd_ref: ref, user_id: String(user.id), email, plan, machine: machine || null, coupon: c ? c.code : null },
    });
    await SD.insertOrder(env, { ref, userId: user.id, email, plan, amount: 0, status: 'started', coupon: c ? c.code : null, machine, ownerName });
    return json({ ok: true, paddle: { transactionId: t.data.id, environment: live(env) ? 'production' : 'sandbox', token: clientToken(env) },
                  ref, plan, label: c ? couponWords(c) : null });
  } catch (e) {
    return json({ error: 'paddle', reason: 'Checkout could not open. Nothing was charged. Please try again.', detail: String(e.message || e).slice(0, 200) }, 502);
  }
}

// ── the webhook ─────────────────────────────────────────────────────────────
async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Paddle-Signature: "ts=1671552777;h1=eb4d…" (one or more h1 while a secret rotates). */
export async function signatureOk(secret, header, raw, t = now()) {
  if (!secret || !header) return false;
  const parts = Object.create(null); const h1s = [];
  for (const kv of String(header).split(';')) { const [k, v] = kv.split('='); if (k === 'h1') h1s.push(v); else parts[k] = v; }
  const ts = Number(parts.ts);
  if (!ts || Math.abs(t - ts) > TOLERANCE) return false;
  const want = await hmacHex(secret, `${parts.ts}:${raw}`);
  return h1s.some((h) => safeEqual(String(h), want));
}

const secs = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);

async function accountRows(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT id, plan, expires_at FROM entitlements WHERE product = 'streamdaw' AND status = 'active' AND (email = ? OR (? IS NOT NULL AND user_id = ?))`
  ).bind(lc(email), userId || null, userId || null).all()) || {}).results || [];
}

/* A key with the account's whole list for the Mac it was bought on and the account's Macs that have one: the same
   as a product bought on HYP (streamdaw.js keysForAccount), through its exported requestKey. */
async function keysFor(env, ent, machine, ownerName) {
  const prior = ((await env.DB.prepare(
    `SELECT machine_id, owner_name FROM streamdaw_activations WHERE email = ? AND status IN ('issued','renewing')
      ORDER BY issued_at DESC LIMIT 20`).bind(lc(ent.email)).all()) || {}).results || [];
  const macs = [];
  for (const m of [machine ? { machine_id: machine, owner_name: ownerName } : null, ...prior])
    if (m && m.machine_id && !macs.some((x) => x.machine_id === m.machine_id)) macs.push(m);
  for (const m of macs.slice(0, 2))
    await SD.requestKey(env, { entId: ent.id, email: ent.email, machine: m.machine_id, name: m.owner_name || ownerName || ent.email, via: 'checkout' }).catch(() => {});
}

/** A paid billing period: the plan to its end (+3 days). The first payment makes the entitlement and sends the
 *  keys; a renewal moves the end on and re-signs the account's keys quietly (the app fetches them itself). */
async function periodPaid(env, tx) {
  const cf = await conf(env);
  const cd = tx.custom_data || {};
  const sub = tx.subscription_id;
  const priceId = tx.items && tx.items[0] && (tx.items[0].price ? tx.items[0].price.id : tx.items[0].price_id);
  const plan = planOfPrice(cf, priceId) || cd.plan;
  if (!sub || !P.parsePlan(plan)) return { skipped: 'not a StreamDAW subscription' };
  const ends = secs(tx.billing_period && tx.billing_period.ends_at);
  if (!ends) return { skipped: 'no billing period' };
  const expiresAt = ends + GRACE;
  let row = await env.DB.prepare('SELECT * FROM streamdaw_paddle_subs WHERE sub_id = ?').bind(sub).first();
  const email = lc(cd.email || (row && row.email));
  if (!email) return { skipped: 'no account on the transaction' };
  if (!row) {
    const ent = await SD.grantEntitlement(env, { email, ext_ref: `paddle:${sub}`, amount: 0, plan, source: 'paddle', expiresAt });
    await env.DB.prepare('UPDATE entitlements SET user_id = COALESCE(user_id, ?) WHERE id = ?').bind(cd.user_id || null, ent.id).run().catch(() => {});
    await env.DB.prepare(
      `INSERT INTO streamdaw_paddle_subs (sub_id, env, user_id, email, customer_id, plan, status, entitlement_id, period_end, first_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?) ON CONFLICT (sub_id) DO NOTHING`
    ).bind(sub, envName(env), cd.user_id || null, email, tx.customer_id || null, plan, ent.id, ends, cd.sd_ref || null, now(), now()).run();
    if (cd.coupon) await env.DB.prepare('UPDATE streamdaw_coupons SET used = used + 1 WHERE code = ?').bind(String(cd.coupon)).run().catch(() => {});
    if (cd.sd_ref) await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'granted', entitlement_id = ?, settled_at = ?, hyp_id = ? WHERE ref = ?`)
      .bind(ent.id, now(), tx.id, cd.sd_ref).run().catch(() => {});
    const link = await SD.mintDownloadLink(env, ent.id, email);
    await keysFor(env, ent, SD.normMachine(cd.machine), null);
    return { granted: ent.id, link };
  }
  // A renewal (or a repeat of the first): the end only moves on.
  if (expiresAt > Number(row.period_end || 0) + GRACE - 60) {
    await env.DB.prepare('UPDATE entitlements SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?').bind(expiresAt, row.entitlement_id).run();
    await env.DB.prepare(`UPDATE streamdaw_paddle_subs SET period_end = MAX(period_end, ?), status = 'active', updated_at = ? WHERE sub_id = ?`).bind(ends, now(), sub).run();
    await env.DB.prepare(`UPDATE streamdaw_activations SET status = 'renewing' WHERE email = ? AND status = 'issued' AND renew_code IS NOT NULL`).bind(email).run();
    await SD.mintWaiting(env).catch(() => {});
  }
  return { renewed: sub, to: ends };
}

async function subChanged(env, s) {
  const sched = s.scheduled_change && s.scheduled_change.action === 'cancel' ? secs(s.scheduled_change.effective_at) : null;
  await env.DB.prepare(
    `UPDATE streamdaw_paddle_subs SET status = ?, cancel_at = ?, next_billed_at = ?, customer_id = COALESCE(customer_id, ?), updated_at = ? WHERE sub_id = ?`
  ).bind(String(s.status || 'active'), sched || (s.status === 'canceled' ? secs(s.canceled_at) || now() : null),
         secs(s.next_billed_at), s.customer_id || null, now(), s.id).run();
}

/** POST /streamdaw/paddle/webhook */
export async function paddleWebhook(req, env) {
  const raw = await req.text();
  const cf = await conf(env);
  if (!(await signatureOk(cf.webhook_secret, req.headers.get('paddle-signature'), raw))) return json({ error: 'bad_signature' }, 401);
  let ev; try { ev = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  const first = await env.DB.prepare('INSERT INTO streamdaw_paddle_events (event_id, type, received_at) VALUES (?, ?, ?) ON CONFLICT (event_id) DO NOTHING')
    .bind(String(ev.event_id || ''), String(ev.event_type || ''), now()).run();
  if (!first.meta || first.meta.changes !== 1) return json({ ok: true, repeat: true });
  try {
    let out = { ignored: ev.event_type };
    if (ev.event_type === 'transaction.completed') out = await periodPaid(env, ev.data || {});
    else if (String(ev.event_type).startsWith('subscription.')) { await subChanged(env, ev.data || {}); out = { sub: ev.data && ev.data.id }; }
    return json({ ok: true, ...out });
  } catch (e) {
    // Not done: forget the event so Paddle's retry runs it again.
    await env.DB.prepare('DELETE FROM streamdaw_paddle_events WHERE event_id = ?').bind(String(ev.event_id || '')).run().catch(() => {});
    return json({ error: 'failed', reason: String(e.message || e).slice(0, 200) }, 500);
  }
}

// ── the buyer's side ────────────────────────────────────────────────────────
/** POST /streamdaw/paddle/portal — Paddle's own page for the signed-in buyer's subscriptions: cancel, card, invoices. */
export async function paddlePortal(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const subs = (await subsOf(env, user.email, user.id)).filter((s) => s.customer_id && s.env === envName(env));
  if (!subs.length) return json({ error: 'none', reason: 'There is no StreamDAW subscription on this account.' }, 404);
  try {
    const d = await api(env, 'POST', `/customers/${subs[0].customer_id}/portal-sessions`, { subscription_ids: subs.map((s) => s.sub_id).slice(0, 25) });
    return json({ ok: true, url: d.data.urls.general.overview });
  } catch (e) { return json({ error: 'paddle', reason: 'Could not open the subscription page. Please try again.' }, 502); }
}

/** The account's Paddle subscriptions, for /streamdaw/mine and the licence refresh. */
export async function paddleSubsFor(env, email, userId) {
  return (await subsOf(env, email, userId)).map((s) => ({ plan: s.plan, name: P.NAMES[s.plan.split(':')[0]], period: s.plan.split(':')[1],
    status: s.status, periodEnd: s.period_end, cancelAt: s.cancel_at || null, nextBilledAt: s.next_billed_at || null }));
}
export async function paddleSubOfEntitlement(env, entId) {
  return env.DB.prepare('SELECT * FROM streamdaw_paddle_subs WHERE entitlement_id = ?').bind(entId).first().catch(() => null);
}

/** What /streamdaw/prices adds: the plans and whether they sell now. */
export async function paddlePrices(env) {
  return { billing: paddleOn(env) ? 'paddle' : 'hyp', open: await ready(env), plans: catalog(),
           paddle: paddleOn(env) ? { environment: live(env) ? 'production' : 'sandbox', token: clientToken(env) } : null };
}
