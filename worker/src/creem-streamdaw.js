/**
 * StreamDAW through Creem, the merchant of record (since 2026-11-11). The plans were decided 2026-10-29
 * (streamdaw-products.js): each product $7 a month or $60 a year, All products $15 a month or $144 a year, US dollars,
 * tax included; Master stays free. creem.js holds what Audioctor shares (the API, the store's settings, the one
 * webhook).
 *
 * Twelve Creem products (six plans, by the month and the year), made the first time the prices are asked (under a
 * lock), so the owner pastes the API key and nothing else. Subscriptions live in streamdaw_subs, tagged with the
 * environment ('creem-test' / 'creem-live'), so /streamdaw/mine and the app's licence refresh read them unchanged.
 * streamdaw_orders.hyp_id holds Creem's checkout id (ch_...).
 *
 *   1. POST /streamdaw/checkout {product, period, coupon?, machine?}: a Creem checkout for that plan, our SD- reference
 *      as its request_id and in its metadata; the page goes to Creem's checkout page and comes back with ?paid=1.
 *      A "free" code grants here, with no Creem at all; a %/$ code becomes a Creem discount the first time it is used.
 *   2. The webhook (creem.js): checkout.completed or the first subscription.paid makes the entitlement and the keys;
 *      each later subscription.paid moves the end on and re-signs the account's keys quietly; subscription.* keeps
 *      the row's status; a full refund ends the plan, at Creem too.
 *   3. POST /streamdaw/portal: Creem's customer portal for the buyer.
 *   4. POST /streamdaw/coupon/check: what a code is worth, before anyone pays.
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { normCode } from './coupons.js';
import * as SD from './streamdaw.js';
import * as P from './streamdaw-products.js';
import * as C from './creem.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => String(e || '').trim().toLowerCase();
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';
const GRACE = 3 * 86400;               // a key runs this long past the period paid for (as Pro Monthly)
const APP = 'streamdaw';
const REF_RE = /^SD-[A-Z0-9]{6,20}$/;
const SUCCESS_URL = `${C.SITE}/apps/streamdaw.html?paid=1#plans`;
const IDS = () => P.PAID.concat('all');

/** Routed here (index.js) whenever the var says Creem, key or not: without the key nothing sells, and the old HYP
 *  checkout behind streamdawCheckout stays out of reach. */
export const routed = (env) => String(env.STREAMDAW_BILLING || '') === 'creem';
export const on = (env) => routed(env) && C.hasKey(env);
const productKey = (id, period) => `product:${APP}:${id}:${period}`;
const planOfProduct = (cf, pid) => {
  if (!pid) return null;
  for (const [k, v] of Object.entries(cf)) if (v === pid && k.startsWith(`product:${APP}:`)) { const [, , id, period] = k.split(':'); return `${id}:${period}`; }
  return null;
};

/** The twelve products and the webhook, made once per environment (again is harmless). */
export async function setup(env) {
  return C.withLock(env, APP, async () => {
    const cf = await C.conf(env);
    const made = [];
    for (const id of IDS()) for (const period of ['month', 'year']) {
      if (cf[productKey(id, period)]) continue;
      const d = await C.api(env, 'POST', '/v1/products', {
        name: `StreamDAW ${P.NAMES[id]} ${period === 'month' ? 'Monthly' : 'Yearly'}`,
        description: (id === 'all' ? 'Every StreamDAW product: Splits, Station, Record, Compare and Party.' : `StreamDAW ${P.NAMES[id]}.`)
          + ` Billed ${period === 'month' ? 'monthly' : 'yearly'}; cancel any time.`,
        price: P.CATALOG[id][period], currency: 'USD', billing_type: 'recurring',
        billing_period: period === 'month' ? 'every-month' : 'every-year', tax_mode: 'inclusive', tax_category: 'saas',
        default_success_url: SUCCESS_URL });
      if (!d || !d.id) throw new Error('Creem made no product');
      await C.putConf(env, productKey(id, period), d.id); made.push(d.id);
    }
    await C.ensureWebhook(env);
    return { made };
  });
}

const allMade = (cf) => !!cf.webhook_secret && IDS().every((id) => cf[productKey(id, 'month')] && cf[productKey(id, 'year')]);
/** Sold now: switched on, every product made, the webhook signed. Makes what is missing on the way. */
export async function ready(env) {
  if (!on(env)) return false;
  if (allMade(await C.conf(env))) return true;
  try { await setup(env); } catch (e) {
    await sendMail(env, { to: owner(env), subject: 'StreamDAW (Creem): setting up the products failed',
      text: `${String(e && e.message || e).slice(0, 400)}\nIt is tried again on the next visit to the sale page.` }).catch(() => {});
    return false;
  }
  return allMade(await C.conf(env));
}

/** GET /streamdaw/prices: what streamdawPrices says, plus who sells and for how much.
 *  This key had the old reseller's name until 2026-11-13; the pages that read it were changed with it,
 *  and their ?v= went up so no cached page asks for the old shape. */
export async function prices(env, base) {
  const d = await base.json().catch(() => ({}));
  const open = await ready(env);
  return json({ ...d, billing: { billing: 'creem', open, plans: catalog() },
                creem: { open, environment: C.live(env) ? 'live' : 'test' } });
}

// ── checkout ────────────────────────────────────────────────────────────────
async function subsOf(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT * FROM streamdaw_subs WHERE env = ? AND (email = ? OR (? IS NOT NULL AND user_id = ?)) ORDER BY created_at DESC`
  ).bind(C.tag(env), lc(email), userId || null, userId || null).all().catch(() => ({ results: [] }))).results) || [];
}
const running = (s) => s && ['active', 'trialing', 'past_due'].includes(s.status) && !s.cancel_at;
async function accountRows(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT id, plan, expires_at FROM entitlements WHERE product = 'streamdaw' AND status = 'active' AND (email = ? OR (? IS NOT NULL AND user_id = ?))`
  ).bind(lc(email), userId || null, userId || null).all()) || {}).results || [];
}
/* StreamDAW's own codes first, then the ones made in Editor > Discount codes
   (2026-11-13). Before this it read streamdaw_coupons alone, so a code created
   in the Editor with scope "streamdaw" or "all" was simply not found at
   checkout - the owner handed one out and it failed, with nothing to say why.
   The pre-Creem path in streamdaw.js always had this fallback; the Creem
   rewrite dropped it. Audioctor's path kept it, which is why codes work there.

   Percent only, deliberately. The two tables disagree about what `value` means
   for an "amount" code: streamdaw_coupons holds US cents (its create endpoint
   says "dollars in, US cents stored", because the plans are priced in dollars)
   and coupons holds agorot. Falling back on those would turn ₪50 off into $50
   off. A percentage carries no units and is safe; a shekel amount has to be
   made as a StreamDAW code, where it means what it says. */
async function findCoupon(env, code) {
  const c = normCode(code);
  if (!c) return null;
  const own = await env.DB.prepare(
    'SELECT * FROM streamdaw_coupons WHERE code = ?'
  ).bind(c).first().catch(() => null);
  if (own) return own;

  const shared = await env.DB.prepare(
    `SELECT * FROM coupons
      WHERE code = ? AND kind = 'percent' AND (scope = 'streamdaw' OR scope = 'all')`
  ).bind(c).first().catch(() => null);
  if (!shared) return null;

  /* The shared table names the same rule differently. Without this mapping a
     first-purchase-only code would quietly apply to everyone, which is worse
     than not honouring it at all. */
  return { ...shared, first_only: shared.first_purchase_only ? 1 : 0 };
}
const couponProducts = (c) => String((c && c.products) || '').split(',').filter(Boolean);

/* ── the catalogue, and what a code is worth ─────────────────────────
   These came out of the module for the reseller before Creem, removed on
   2026-11-13 with the service itself. They were imported from it while it
   existed, which made a reseller we never sold through a dependency of the
   one we do.

   couponCheck answers POST /streamdaw/coupon/check, and it asks THIS file's
   findCoupon. That is a fix, not a move: the endpoint used to have its own
   lookup that read streamdaw_coupons alone, so a code made in Editor > Discount
   codes was refused by the check in front of checkout while checkout itself
   honoured it. The owner handed such a code out and watched it fail. */
export function catalog() {
  const out = {};
  for (const id of P.PAID.concat('all')) {
    const c = P.CATALOG[id];
    out[id] = { name: P.NAMES[id], month: c.month, year: c.year, yearMonthly: Math.round(c.year / 12) };
  }
  return out;
}

async function boughtBefore(env, email, userId) {
  const r = await env.DB.prepare(
    `SELECT 1 FROM entitlements WHERE product = 'streamdaw' AND (email = ? OR (? IS NOT NULL AND user_id = ?)) LIMIT 1`
  ).bind(lc(email), userId || null, userId || null).first().catch(() => null);
  return !!r;
}

/** Why `c` cannot be used for `plan` by this account, or ''. */
async function couponWhy(env, c, plan, email, userId) {
  if (!c || !c.active) return 'That code isn\u2019t valid.';
  if (c.expires_at && c.expires_at < now()) return 'That code has expired.';
  if (c.max_uses && c.used >= c.max_uses) return 'That code has been used up.';
  const id = String(plan).split(':')[0];
  const only = couponProducts(c);
  if (only.length && !only.includes(id)) return `That code is for ${only.map((x) => P.NAMES[x] || x).join(' or ')}.`;
  if (c.first_only && await boughtBefore(env, email, userId)) return 'That code is for a first purchase.';
  return '';
}

/** What a code does, in words, for the page: "15% off the first payment", "3 months free". */
function couponWords(c) {
  const n = Number(c.months || 0);
  if (c.kind === 'free') return n ? `${n} month${n > 1 ? 's' : ''} free` : 'free';
  const off = c.kind === 'amount' ? `$${(c.value / 100).toFixed(0)} off` : `${c.value}% off`;
  return n > 1 ? `${off} the first ${n} payments` : n === 1 ? `${off} the first payment` : `${off} every payment`;
}

/** POST /streamdaw/coupon/check {code, product?} - what a code does, before anyone pays. */
export async function couponCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const c = await findCoupon(env, b.code);
  const user = await currentUser(req, env).catch(() => null);
  const plan = `${String(b.product || (couponProducts(c)[0] || 'all'))}:month`;
  const why = await couponWhy(env, c, plan, user && user.email, user && user.id);
  if (why) return json({ ok: false, reason: why });
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value, months: c.months || 0, products: couponProducts(c),
                free: c.kind === 'free', label: couponWords(c) });
}

/* A key with the account's whole list for the Mac it was bought on and the account's Macs that have one: the same
   as the pre-Creem path built it. */
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

/** POST /streamdaw/checkout under Creem (index.js routes here). */
export async function checkout(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const body = await req.json().catch(() => ({}));
  const email = lc(user.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'sign_in_required' }, 401);
  if (!body.product) return json({ error: 'plan_retired', reason: 'StreamDAW is sold by product now: pick Splits, Station, Record, Compare, Party or All.' }, 410);
  if (!(await ready(env))) return json({ error: 'not_ready', reason: 'Buying opens in a few days. Start your free week now.' }, 503);
  const id = String(body.product || '').toLowerCase(), period = String(body.period || 'year').toLowerCase();
  const plan = `${id}:${period}`;
  if (!P.parsePlan(plan) || !['month', 'year'].includes(period)) return json({ error: 'no_such_product', reason: 'There is no such plan.' }, 400);
  const same = (await subsOf(env, email, user.id)).find((s) => running(s) && (s.plan.split(':')[0] === id || s.plan.split(':')[0] === 'all'));
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

  // A free code: the plan for its months, granted here. No Creem, no card.
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

  const cf = await C.conf(env);
  try {
    let discount = null;
    if (c) {
      // Creem's "once": the first payment. A code for more payments takes off the first only here.
      const only = couponProducts(c);
      discount = await C.discountCode(env, `discount:${APP}:${c.code}`, {
        code: c.code, name: `StreamDAW code ${c.code}`, percent: c.kind === 'amount' ? null : c.value, cents: c.kind === 'amount' ? c.value : null,
        expiresAt: c.expires_at || null, products: (only.length ? only : IDS()).flatMap((x) => [cf[productKey(x, 'month')], cf[productKey(x, 'year')]]).filter(Boolean) });
    }
    await SD.insertOrder(env, { ref, userId: user.id, email, plan, amount: 0, status: 'started', coupon: c ? c.code : null, machine, ownerName });
    const ch = await C.api(env, 'POST', '/v1/checkouts', {
      product_id: cf[productKey(id, period)], request_id: ref, units: 1, success_url: SUCCESS_URL, customer: { email },
      ...(discount ? { discount_code: discount } : {}),
      metadata: { app: APP, sd_ref: ref, ref, user_id: String(user.id), email, plan, machine: machine || '', coupon: c ? c.code : '' },
    });
    if (!ch || !/^ch_[A-Za-z0-9]+$/.test(String(ch.id || '')) || !/^https:\/\//.test(String(ch.checkout_url || ''))) throw new Error('no checkout');
    await env.DB.prepare('UPDATE streamdaw_orders SET hyp_id = ? WHERE ref = ?').bind(ch.id, ref).run().catch(() => {});
    return json({ ok: true, ref, plan, label: c ? couponWords(c) : null,
                  creem: { checkoutUrl: ch.checkout_url, environment: C.live(env) ? 'live' : 'test' } });
  } catch (e) {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'declined' WHERE ref = ? AND status = 'started'`).bind(ref).run().catch(() => {});
    return json({ error: 'creem', reason: 'Checkout could not open. Nothing was charged. Please try again.', detail: String(e.message || e).slice(0, 200) }, 502);
  }
}

// ── the webhook's events (creem.js) ─────────────────────────────────────────
function paidFrom(type, o) {
  if (type === 'checkout.completed') {
    const s = o.subscription || {};
    return { sub: C.idOf(o.subscription), customer: C.idOf(o.customer) || C.idOf(o.order && o.order.customer), product: C.productOf(o),
             ends: C.secs(s.current_period_end_date), next: C.secs(s.next_transaction_date), checkout: o.id,
             md: o.metadata || s.metadata || {}, ref: String(o.request_id || (o.metadata || {}).sd_ref || ''), paid: !o.order || o.order.status === 'paid' };
  }
  const t = o.last_transaction || {};
  return { sub: o.id, customer: C.idOf(o.customer), product: C.productOf(o), ends: C.secs(o.current_period_end_date) || C.secs(t.period_end),
           next: C.secs(o.next_transaction_date), checkout: null, md: o.metadata || {}, ref: String((o.metadata || {}).sd_ref || ''),
           paid: !t.status || t.status === 'paid' };
}

/** A paid billing period: the plan to its end (+3 days). The first payment makes the entitlement and sends the keys;
 *  a renewal moves the end on and re-signs the account's keys quietly (the app fetches them itself). */
async function periodPaid(env, p) {
  const cf = await C.conf(env);
  const plan = planOfProduct(cf, p.product);
  if (!plan) return 'not a StreamDAW product';
  if (!p.paid) return 'not paid';
  if (!p.sub || !p.ends) return 'no subscription or period';
  const expiresAt = p.ends + GRACE;
  const row = await env.DB.prepare('SELECT * FROM streamdaw_subs WHERE sub_id = ?').bind(p.sub).first();
  if (row) {
    if (p.ends <= Number(row.period_end || 0)) return 'already';
    await env.DB.prepare('UPDATE entitlements SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?').bind(expiresAt, row.entitlement_id).run();
    await env.DB.prepare(`UPDATE streamdaw_subs SET period_end = ?, next_billed_at = ?, status = 'active', updated_at = ? WHERE sub_id = ?`)
      .bind(p.ends, p.next || p.ends, now(), p.sub).run();
    await env.DB.prepare(`UPDATE streamdaw_activations SET status = 'renewing' WHERE email = ? AND status = 'issued' AND renew_code IS NOT NULL`).bind(row.email).run();
    await SD.mintWaiting(env).catch(() => {});
    return 'renewed';
  }
  if (!REF_RE.test(p.ref)) return 'no ref';
  const order = await env.DB.prepare('SELECT * FROM streamdaw_orders WHERE ref = ?').bind(p.ref).first();
  if (!order) {
    await sendMail(env, { to: owner(env), subject: 'StreamDAW (Creem): a payment for an order we do not have',
      text: `Creem subscription ${p.sub} was paid with reference ${p.ref}, which is not in streamdaw_orders. Nothing was granted. Check Creem.` }).catch(() => {});
    return 'unknown ref';
  }
  if (p.checkout && order.hyp_id && order.hyp_id !== p.checkout) {
    await sendMail(env, { to: owner(env), subject: 'StreamDAW (Creem): a second checkout for one order',
      text: `Order ${p.ref} belongs to ${order.hyp_id}, and ${p.checkout} completed with the same reference. Nothing more was granted. `
          + 'If the buyer paid twice, refund the second payment in Creem.' }).catch(() => {});
    return 'other checkout';
  }
  if (order.status === 'granted') return 'already';
  if (plan !== order.plan) {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'verify_failed' WHERE ref = ?`).bind(p.ref).run();
    await sendMail(env, { to: owner(env), subject: 'StreamDAW (Creem): paid for something other than the order',
      text: `Order ${p.ref} (${order.email}) is ${order.plan}; Creem paid for ${plan}. Nothing was granted. Check it in Creem, then refund or grant by hand.` }).catch(() => {});
    return 'product mismatch';
  }
  // Claimed first: two events at once (checkout.completed and subscription.paid) grant it once.
  const claim = await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'granting' WHERE ref = ? AND status NOT IN ('granted','granting')`).bind(p.ref).run();
  if (!(claim.meta && claim.meta.changes === 1)) return 'already';
  try {
    const email = lc(order.email);
    const ent = await SD.grantEntitlement(env, { email, ext_ref: `creem:${p.sub}`, amount: 0, plan, source: 'creem', expiresAt });
    await env.DB.prepare('UPDATE entitlements SET user_id = COALESCE(user_id, ?) WHERE id = ?').bind(order.user_id || null, ent.id).run().catch(() => {});
    await env.DB.prepare(
      `INSERT INTO streamdaw_subs (sub_id, env, user_id, email, customer_id, plan, status, entitlement_id, period_end, next_billed_at, first_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?) ON CONFLICT (sub_id) DO NOTHING`
    ).bind(p.sub, C.tag(env), order.user_id || null, email, p.customer || null, plan, ent.id, p.ends, p.next || p.ends, p.ref, now(), now()).run();
    if (order.coupon) await env.DB.prepare('UPDATE streamdaw_coupons SET used = used + 1 WHERE code = ?').bind(String(order.coupon)).run().catch(() => {});
    await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'granted', entitlement_id = ?, settled_at = ? WHERE ref = ?`).bind(ent.id, now(), p.ref).run();
    await SD.mintDownloadLink(env, ent.id, email).catch(() => {});
    await keysFor(env, ent, SD.normMachine(order.machine_id || p.md.machine), order.owner_name || null);
    return 'granted';
  } catch (e) {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'started' WHERE ref = ? AND status = 'granting'`).bind(p.ref).run().catch(() => {});
    throw e;
  }
}

async function subChanged(env, type, s) {
  const status = String(s.status || '');
  let mapped = status, cancelAt = null;
  if (type === 'subscription.scheduled_cancel' || status === 'scheduled_cancel') { mapped = 'active'; cancelAt = C.secs(s.current_period_end_date) || now(); }
  // Cancelled in Creem's portal: status 'canceled' at once, but the year or month paid for runs to its end.
  else if (status === 'canceled' && C.secs(s.current_period_end_date) > now() + 60) { mapped = 'active'; cancelAt = C.secs(s.current_period_end_date); }
  else if (status === 'canceled') cancelAt = C.secs(s.canceled_at) || now();
  else if (status === 'unpaid' || status === 'expired') mapped = 'past_due';
  if (!['active', 'trialing', 'past_due', 'paused', 'canceled'].includes(mapped)) mapped = 'active';
  const res = await env.DB.prepare(
    `UPDATE streamdaw_subs SET status = ?, cancel_at = ?, next_billed_at = COALESCE(?, next_billed_at),
       customer_id = COALESCE(customer_id, ?), updated_at = ? WHERE sub_id = ? AND env = ?`
  ).bind(mapped, cancelAt, C.secs(s.next_transaction_date), C.idOf(s.customer), now(), String(s.id || ''), C.tag(env)).run();
  return res.meta && res.meta.changes ? `subscription ${mapped}${cancelAt ? ' (cancel set)' : ''}` : 'not ours';
}

async function onRefund(env, r) {
  const t = r.transaction || {};
  const subId = C.idOf(r.subscription) || t.subscription || null;
  const sub = subId ? await env.DB.prepare('SELECT * FROM streamdaw_subs WHERE sub_id = ? AND env = ?').bind(subId, C.tag(env)).first() : null;
  if (!sub) return 'not ours';
  const paid = Number(t.amount_paid || 0), back = Number(r.refund_amount || t.refunded_amount || 0);
  const full = t.status === 'refunded' || (paid > 0 && back >= paid);
  let stopped = true;
  if (full) {
    await env.DB.prepare(`UPDATE entitlements SET status = 'refunded' WHERE id = ?`).bind(sub.entitlement_id).run();
    await env.DB.prepare(`UPDATE streamdaw_orders SET status = 'refunded' WHERE ref = ?`).bind(sub.first_ref || '').run().catch(() => {});
    if (running(sub)) {
      try { await C.api(env, 'POST', `/v1/subscriptions/${encodeURIComponent(sub.sub_id)}/cancel`, { mode: 'immediate' }); }
      catch { stopped = false; }
      await env.DB.prepare(`UPDATE streamdaw_subs SET status = 'canceled', cancel_at = ?, updated_at = ? WHERE sub_id = ?`).bind(now(), now(), sub.sub_id).run();
    }
  }
  await sendMail(env, { to: owner(env), subject: `StreamDAW (Creem): ${full ? 'refunded' : 'part refunded'}, ${sub.plan}`,
    text: `${sub.email}, ${sub.sub_id}: ${full ? 'a full refund. The plan is ended here; the app drops its key at its next check.'
        + (stopped ? '' : ` Creem did not stop the subscription: cancel ${sub.sub_id} there by hand, or it charges again.`) : 'a partial refund; nothing changed here.'}` }).catch(() => {});
  return full ? 'refunded' : 'partial refund';
}

/** Is an event that names no product ours? Our records know its checkout, its reference or its subscription. */
export async function claims(env, o) {
  if (!o || typeof o !== 'object') return false;
  if (planOfProduct(await C.conf(env), C.productOf(o))) return true;
  const chId = o.object === 'checkout' ? o.id : C.idOf(o.checkout);
  const subId = o.object === 'subscription' ? o.id : C.idOf(o.subscription) || (o.transaction && o.transaction.subscription) || null;
  if (chId && await env.DB.prepare('SELECT 1 AS x FROM streamdaw_orders WHERE hyp_id = ?').bind(chId).first()) return true;
  return !!(subId && await env.DB.prepare('SELECT 1 AS x FROM streamdaw_subs WHERE sub_id = ? AND env = ?').bind(subId, C.tag(env)).first());
}

/** creem.js hands StreamDAW's events here. */
export async function onCreemEvent(env, type, o) {
  if (type === 'checkout.completed' || type === 'subscription.paid') return periodPaid(env, paidFrom(type, o));
  if (type === 'refund.created') return onRefund(env, o);
  if (type.startsWith('subscription.')) return subChanged(env, type, o);
  return 'ignored';
}

// ── the buyer's side ────────────────────────────────────────────────────────
/** POST /streamdaw/portal — Creem's own page for the signed-in buyer's subscriptions: cancel, card, invoices. */
export async function portal(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const subs = (await subsOf(env, user.email, user.id)).filter((s) => s.customer_id);
  if (!subs.length) return json({ error: 'none', reason: 'There is no StreamDAW subscription on this account.' }, 404);
  try {
    const d = await C.api(env, 'POST', '/v1/customers/billing', { customer_id: subs[0].customer_id });
    if (!d || !/^https:\/\//.test(String(d.customer_portal_link || ''))) throw new Error('no link');
    return json({ ok: true, url: d.customer_portal_link });
  } catch { return json({ error: 'creem', reason: 'Could not open the subscription page. Please try again.' }, 502); }
}

/* ── what the account page and the app's licence refresh ask for ─────────
   Both used to call the old reseller's module for this, which is why removing
   that file reaches as far as it does. The shape is unchanged on purpose:
   /streamdaw/mine and the refresh answer what they answered yesterday. */

/** The account's subscriptions, for /streamdaw/mine and the licence refresh. */
export async function subsFor(env, email, userId) {
  return (await subsOf(env, email, userId)).map((s) => ({ plan: s.plan, name: P.NAMES[s.plan.split(':')[0]], period: s.plan.split(':')[1],
    status: s.status, periodEnd: s.period_end, cancelAt: s.cancel_at || null, nextBilledAt: s.next_billed_at || null }));
}

/** The subscription row behind one entitlement, or null. */
export async function subOfEntitlement(env, entId) {
  return env.DB.prepare('SELECT * FROM streamdaw_subs WHERE entitlement_id = ?').bind(entId).first().catch(() => null);
}
