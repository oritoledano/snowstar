/**
 * Audioctor through Creem, the merchant of record (since 2026-11-11): $7 a month or $60 a year,
 * renewed by Creem, cancelled any time; the Free plan lives in the app. creem.js holds what StreamDAW shares (the API,
 * the store's settings, the one webhook). The Worker still makes every key.
 *
 * On when the var AUDIOCTOR_BILLING is 'creem' and the secret CREEM_API_KEY is set. The two products are made in Creem
 * the first time the prices are asked for (setup(), once, under a lock), so the owner pastes the API key and nothing
 * else. Subscriptions live in audioctor_paddle_subs, tagged with the environment ('creem-test' / 'creem-live'), so the account page,
 * the app's refresh route and the erase all keep working unchanged: audioctor_paddle_subs (one row per subscription),
 * audioctor_orders.paddle_txn (here: Creem's checkout id, ch_…).
 *
 *   1. POST /audioctor/checkout {plan, coupon?, machine?} (audioctor.js hands over here): a Creem checkout for that
 *      plan, our AD- reference as its request_id and in its metadata; the page goes to Creem's checkout page and comes
 *      back to the sale page. Nothing is granted on the page's word. A code applies to the first payment of a year; one
 *      that covers it all grants here, with no Creem.
 *   2. The webhook (creem.js routes Audioctor's events here): checkout.completed (or the first subscription.paid,
 *      whichever comes first) grants the plan to the end of the period paid (+3 days, as Monthly); each later
 *      subscription.paid moves that end on and re-signs the Macs' keys quietly, and the app fetches each one by itself.
 *      subscription.* keeps the row's status for the app and the account. A full refund ends it, at Creem too.
 *   3. POST /audioctor/portal: Creem's customer portal for the signed-in buyer (cancel, card, invoices).
 *   4. Reconcile: an order whose webhook never came asks Creem for its checkout.
 *   5. The daily cron: a notice two weeks before a year renews.
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { couponProblem } from './coupons.js';
import * as SD from './audioctor.js';
import * as C from './creem.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => (e || '').trim().toLowerCase();
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';
const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const dayOf = (sec) => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
const REF_RE = /^AD-[A-Z0-9]{4,20}$/;
const GRACE = 3 * 86400;                       // a key runs this long past the period paid for (as Monthly)

/* ── a code's worth, in dollars ─────────────────────────────────
   Moved here from the module for the reseller before Creem, removed on
   2026-11-13 with the service itself. Three kinds of code reach
   this: 'percent' as it is, 'usd' already in cents, and 'amount' in agorot from
   the HYP era, converted at today's rate. couponProblem's own checks (active,
   expiry, uses, minimum) stay in shekels, where they were written. */
async function usdAfterCoupon(env, c, cents) {
  if (!c) return { cents, off: 0 };
  let off;
  if (c.kind === 'percent') off = Math.round((cents * Math.min(100, Math.max(0, c.value))) / 100);
  else if (c.kind === 'usd') off = Math.max(0, c.value);
  else off = Math.round(Math.max(0, c.value) * (await SD.shekelsFor(env, 100)).rate);   // agorot x USD per ILS
  off = Math.min(cents, off);
  return { cents: cents - off, off };
}
const couponLabel = (c) => (c.kind === 'percent' ? `${c.value}% off` : c.kind === 'usd' ? `${usd(c.value)} off` : `₪${(c.value / 100).toFixed(0)} off`);
const NOTICE_DAYS = 14;                        // a year's renewal is announced this long before
const APP = 'audioctor';
const SUCCESS_URL = `${SD.SITE}/apps/audioctor.html?paid=1#pricing`;

/** Is Audioctor sold through Creem (switched on, with a key)? Its products may still be missing: see ready(). */
export const on = (env) => String(env.AUDIOCTOR_BILLING || '') === 'creem' && C.hasKey(env);
export const client = (env) => ({ environment: C.live(env) ? 'live' : 'test' });

const productKey = (plan) => `product:${APP}:${plan}`;
const planOfProduct = (cf, pid) => (!pid ? null : pid === cf[productKey('monthly')] ? 'monthly' : pid === cf[productKey('year')] ? 'year' : null);

/** The two products in Creem and the webhook, made once per environment (again is harmless). */
export async function setup(env) {
  const r = await C.withLock(env, APP, async () => {
    const cf = await C.conf(env);
    const made = [];
    for (const [plan, p] of Object.entries(SD.PLANS)) {
      if (cf[productKey(plan)]) continue;
      const yearly = p.every === 'year';
      const d = await C.api(env, 'POST', '/v1/products', {
        name: yearly ? 'Audioctor Yearly' : 'Audioctor Monthly',
        description: `Takes any recording apart and cleans every part, on your Mac. Billed ${yearly ? 'yearly' : 'monthly'}; cancel any time.`,
        price: p.usdCents, currency: 'USD', billing_type: 'recurring', billing_period: yearly ? 'every-year' : 'every-month',
        tax_mode: 'inclusive', tax_category: 'saas', default_success_url: SUCCESS_URL });
      if (!d || !d.id) throw new Error('Creem made no product');
      await C.putConf(env, productKey(plan), d.id); made.push(d.id);
    }
    await C.ensureWebhook(env);
    return { made };
  });
  return r;
}

/** Sold now: switched on, both products made, the webhook signed. Makes what is missing on the way. */
export async function ready(env) {
  if (!on(env)) return false;
  const has = (cf) => !!cf.webhook_secret && !!cf[productKey('monthly')] && !!cf[productKey('year')];
  if (has(await C.conf(env))) return true;
  try { await setup(env); } catch (e) {
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Creem): setting up the products failed',
      text: `${String(e && e.message || e).slice(0, 400)}\nIt is tried again on the next visit to the sale page.` }).catch(() => {});
    return false;
  }
  return has(await C.conf(env));
}

// ── coupons, in dollars ─────────────────────────────────────────────────────
/** POST /audioctor/coupon/check under Creem: what a code does to the first year, in dollars. */
export async function couponCheck(env, code) {
  const year = SD.PLANS.year.usdCents;
  const c = await SD.findCoupon(env, code);
  const problem = couponProblem(c, (await SD.shekelsFor(env, year)).amount);
  if (problem) return json({ ok: false, reason: problem });
  const { cents, off } = await usdAfterCoupon(env, c, year);
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value, currency: 'USD', off, amount: cents, usdCents: cents,
                free: cents <= 0, label: `${couponLabel(c)} the first year` });
}

// ── 1. checkout ─────────────────────────────────────────────────────────────
async function subsOf(env, email, userId) {
  return ((await env.DB.prepare(
    `SELECT * FROM audioctor_paddle_subs WHERE env = ? AND (email = ? OR (? IS NOT NULL AND user_id = ?)) ORDER BY created_at DESC`
  ).bind(C.tag(env), lc(email), userId || null, userId || null).all().catch(() => ({ results: [] }))).results) || [];
}
const running = (s) => s && ['active', 'trialing', 'past_due'].includes(s.status) && !s.cancel_at;

/** A plan, through Creem. The caller (audioctorCheckout) has signed the person in and checked they don't own it for
 *  good already. Answers the page with Creem's checkout page to go to. */
export async function checkout(env, user, body) {
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

  // A code that covers it all: the year, granted here, and Creem never sees it. Nothing renews it.
  if (cents <= 0) return SD.grantFree(env, { ref, user, email, couponCode: c.code, machine, ownerName, currency: 'USD',
                                             plan, expiresAt: now() + 365 * 86400 + GRACE });
  const cf = await C.conf(env);
  await SD.insertOrder(env, { ref, userId: user.id, email, plan, amount: cents, currency: 'USD', status: 'started',
                              coupon: c ? c.code : null, machine, ownerName });
  let ch;
  try {
    const discount = c ? await C.discountCode(env, `discount:${APP}:${c.code}`, { code: c.code, name: `Audioctor code ${c.code}`,
      percent: c.kind === 'percent' ? c.value : null, cents: off, expiresAt: c.expires_at || null, products: [cf[productKey('year')]] }) : null;
    ch = await C.api(env, 'POST', '/v1/checkouts', {
      product_id: cf[productKey(plan)], request_id: ref, units: 1, success_url: SUCCESS_URL,
      customer: { email }, ...(discount ? { discount_code: discount } : {}),
      metadata: { app: APP, ref, plan, user_id: user.id || '', machine: machine || '' },
    });
  } catch (e) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'declined' WHERE ref = ?`).bind(ref).run().catch(() => {});
    return json({ error: 'creem_error', reason: 'Checkout could not open. Nothing was charged. Please try again.', detail: String(e.message).slice(0, 200) }, 502);
  }
  if (!ch || !/^ch_[A-Za-z0-9]+$/.test(String(ch.id || '')) || !/^https:\/\//.test(String(ch.checkout_url || '')))
    return json({ error: 'creem_error', reason: 'Checkout could not open. Nothing was charged. Please try again.' }, 502);
  await env.DB.prepare('UPDATE audioctor_orders SET paddle_txn = ? WHERE ref = ?').bind(ch.id, ref).run();
  return json({ ok: true, ref, plan, amount_gross: cents, currency: 'USD', email,
                creem: { checkoutUrl: ch.checkout_url, ...client(env) } });
}

// ── 2. the webhook's events (creem.js) ──────────────────────────────────────
/* The row that ties a subscription to its entitlement. Written once; a repeat of the first payment finds it there. */
const keepSub = (env, p, plan, entId, email, userId, ref) => env.DB.prepare(
  `INSERT INTO audioctor_paddle_subs (sub_id, env, user_id, email, customer_id, plan, status, entitlement_id, period_end, next_billed_at, first_ref, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?) ON CONFLICT (sub_id) DO NOTHING`
).bind(p.sub, C.tag(env), userId || null, lc(email), p.customer || null, plan, entId, p.ends, p.next || p.ends, ref, now(), now()).run();

/** What a paid period says, from either event: the subscription, its customer, the product, when it ends, our order. */
function paidFrom(type, o) {
  if (type === 'checkout.completed') {
    const s = o.subscription || {};
    return { sub: C.idOf(o.subscription), customer: C.idOf(o.customer) || C.idOf(o.order && o.order.customer), product: C.productOf(o),
             ends: C.secs(s.current_period_end_date), next: C.secs(s.next_transaction_date), checkout: o.id,
             ref: String(o.request_id || (o.metadata || {}).ref || ''), paid: !o.order || o.order.status === 'paid' };
  }
  const t = o.last_transaction || {};
  return { sub: o.id, customer: C.idOf(o.customer), product: C.productOf(o),
           ends: C.secs(o.current_period_end_date) || C.secs(t.period_end), next: C.secs(o.next_transaction_date), checkout: null,
           ref: String((o.metadata || {}).ref || ''), paid: !t.status || t.status === 'paid' };
}

/** A paid billing period: the plan to its end (+3 days). The first payment grants as a verified return does (the
 *  entitlement, the download link, the key for the Mac, the receipt); a renewal moves the end on and re-signs the
 *  keys quietly. */
async function periodPaid(env, p) {
  const cf = await C.conf(env);
  const plan = planOfProduct(cf, p.product);
  if (!plan) return 'not an Audioctor product';
  if (!p.paid) return 'not paid';
  const row = p.sub ? await env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE sub_id = ?').bind(p.sub).first() : null;
  if (row) {
    if (!p.ends || p.ends <= Number(row.period_end || 0)) return 'already';
    const expiresAt = p.ends + GRACE;
    await env.DB.prepare('UPDATE entitlements SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?').bind(expiresAt, row.entitlement_id).run();
    await env.DB.prepare(`UPDATE audioctor_paddle_subs SET period_end = ?, next_billed_at = ?, status = 'active', updated_at = ? WHERE sub_id = ?`)
      .bind(p.ends, p.next || p.ends, now(), p.sub).run();
    await env.DB.prepare(
      `UPDATE audioctor_activations SET expires_at = ?, status = CASE WHEN status IN ('issued','renewing') THEN 'renewing' ELSE status END
        WHERE entitlement_id = ? AND status IN ('issued','renewing','pending')`
    ).bind(expiresAt, row.entitlement_id).run();
    await SD.mintWaiting(env, row.entitlement_id).catch(() => {});
    return 'renewed';
  }
  if (!REF_RE.test(p.ref)) return 'no ref';
  const order = await env.DB.prepare('SELECT * FROM audioctor_orders WHERE ref = ?').bind(p.ref).first();
  if (!order) {
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Creem): a payment for an order we do not have',
      text: `Creem subscription ${p.sub || '?'} was paid with reference ${p.ref}, which is not in audioctor_orders. Nothing was granted. Check Creem.` }).catch(() => {});
    return 'unknown ref';
  }
  if (p.checkout && order.paddle_txn && order.paddle_txn !== p.checkout) {
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Creem): a second checkout for one order',
      text: `Order ${p.ref} belongs to ${order.paddle_txn}, and ${p.checkout} completed with the same reference. Nothing more was granted. `
          + `If the buyer paid twice, refund the second payment in Creem.` }).catch(() => {});
    return 'other checkout';
  }
  if (order.status === 'granting') return 'already';
  if (order.status !== 'granted' && (plan !== order.plan || !p.sub || !p.ends)) {
    await env.DB.prepare(`UPDATE audioctor_orders SET status = 'verify_failed' WHERE ref = ?`).bind(p.ref).run();
    await sendMail(env, { to: owner(env), subject: 'Audioctor (Creem): paid for something other than the order',
      text: `Order ${p.ref} (${order.email}) is ${order.plan}, ${usd(order.amount)}; Creem paid for product ${p.product}`
          + `${p.sub ? '' : ', with no subscription'}. Nothing was granted. Check it in Creem, then Reconcile or refund.` }).catch(() => {});
    return 'product mismatch';
  }
  let entId = order.entitlement_id;
  if (order.status !== 'granted') {
    const out = await SD.fulfilPaid(env, order, {}, 'creem', p.ends + GRACE);
    if (out.already) return 'already';
    entId = out.ent.id;
  }
  await keepSub(env, p, plan, entId, order.email, order.user_id, p.ref);
  return order.status === 'granted' ? 'already' : 'granted';
}

async function subChanged(env, type, s) {
  const status = String(s.status || '');
  const ends = C.secs(s.current_period_end_date);
  let mapped = status, cancelAt = null;
  if (type === 'subscription.scheduled_cancel' || status === 'scheduled_cancel') { mapped = 'active'; cancelAt = ends || now(); }
  // Cancelled in Creem's portal: status 'canceled' at once, but the year or month paid for runs to its end.
  else if (status === 'canceled' && C.secs(s.current_period_end_date) > now() + 60) { mapped = 'active'; cancelAt = C.secs(s.current_period_end_date); }
  else if (status === 'canceled') cancelAt = C.secs(s.canceled_at) || now();
  else if (status === 'unpaid' || status === 'expired') mapped = 'past_due';
  if (!['active', 'trialing', 'past_due', 'paused', 'canceled'].includes(mapped)) mapped = 'active';
  const res = await env.DB.prepare(
    `UPDATE audioctor_paddle_subs SET status = ?, cancel_at = ?, next_billed_at = COALESCE(?, next_billed_at),
       customer_id = COALESCE(customer_id, ?), updated_at = ? WHERE sub_id = ? AND env = ?`
  ).bind(mapped, cancelAt, C.secs(s.next_transaction_date), C.idOf(s.customer), now(), String(s.id || ''), C.tag(env)).run();
  return res.meta && res.meta.changes ? `subscription ${mapped}${cancelAt ? ' (cancel set)' : ''}` : 'not ours';
}

/* A refund made in Creem (by Ori, or by Creem itself): a full one ends the plan here and at Creem, and the app drops its
   key at its next check (the refresh route's revoke). */
async function onRefund(env, r) {
  const t = r.transaction || {};
  const subId = C.idOf(r.subscription) || t.subscription || null;
  const chId = C.idOf(r.checkout);
  const ref = String((r.checkout && r.checkout.request_id) || '');
  const order = (chId && await env.DB.prepare('SELECT * FROM audioctor_orders WHERE paddle_txn = ?').bind(chId).first())
    || (REF_RE.test(ref) && await env.DB.prepare('SELECT * FROM audioctor_orders WHERE ref = ?').bind(ref).first()) || null;
  const sub = await env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE sub_id = ? OR entitlement_id = ?')
    .bind(String(subId || ''), order && order.entitlement_id || -1).first();
  if (!order && !sub) return 'not ours';
  const paid = Number(t.amount_paid || 0), back = Number(r.refund_amount || t.refunded_amount || 0);
  const full = t.status === 'refunded' || (paid > 0 && back >= paid);
  let stopped = true;
  if (full) {
    const entId = (order && order.entitlement_id) || (sub && sub.entitlement_id);
    if (entId) await env.DB.prepare(`UPDATE entitlements SET status = 'refunded' WHERE id = ?`).bind(entId).run();
    if (order) await env.DB.prepare(`UPDATE audioctor_orders SET status = 'refunded' WHERE ref = ?`).bind(order.ref).run();
    if (sub && running(sub)) {
      try { await C.api(env, 'POST', `/v1/subscriptions/${encodeURIComponent(sub.sub_id)}/cancel`, { mode: 'immediate' }); }
      catch { stopped = false; }
      await env.DB.prepare(`UPDATE audioctor_paddle_subs SET status = 'canceled', cancel_at = ?, updated_at = ? WHERE sub_id = ?`).bind(now(), now(), sub.sub_id).run();
    }
  }
  const who = (order && order.email) || sub.email, what = order ? order.ref : sub.sub_id;
  await sendMail(env, { to: owner(env), subject: `Audioctor (Creem): ${full ? 'refunded' : 'part refunded'}, ${what}`,
    text: `${who}, ${what} (${t.id || r.id}): ${full ? 'a full refund. The plan is ended here, and the app drops its key at its next check.'
        + (stopped ? '' : ` Creem did not stop the subscription: cancel ${sub.sub_id} there by hand, or it charges again.`) : 'a partial refund; nothing changed here.'}` }).catch(() => {});
  return full ? 'refunded' : 'partial refund';
}

/** Is an event that names no product ours? Our records know its checkout, its reference or its subscription. */
export async function claims(env, o) {
  if (!o || typeof o !== 'object') return false;
  if (planOfProduct(await C.conf(env), C.productOf(o))) return true;
  const chId = o.object === 'checkout' ? o.id : C.idOf(o.checkout);
  const subId = o.object === 'subscription' ? o.id : C.idOf(o.subscription) || (o.transaction && o.transaction.subscription) || null;
  const ref = String((o.checkout && o.checkout.request_id) || o.request_id || C.metadataOf(o).ref || '');
  if (chId && await env.DB.prepare('SELECT 1 AS x FROM audioctor_orders WHERE paddle_txn = ?').bind(chId).first()) return true;
  if (REF_RE.test(ref) && await env.DB.prepare('SELECT 1 AS x FROM audioctor_orders WHERE ref = ?').bind(ref).first()) return true;
  return !!(subId && await env.DB.prepare('SELECT 1 AS x FROM audioctor_paddle_subs WHERE sub_id = ? AND env = ?').bind(subId, C.tag(env)).first());
}

/** creem.js hands Audioctor's events here. */
export async function onCreemEvent(env, type, o) {
  if (type === 'checkout.completed' || type === 'subscription.paid') return periodPaid(env, paidFrom(type, o));
  if (type === 'refund.created') return onRefund(env, o);
  if (type.startsWith('subscription.')) return subChanged(env, type, o);
  return 'ignored';
}

// ── 3. the buyer's side ─────────────────────────────────────────────────────
/** POST /audioctor/portal — Creem's own page for the signed-in buyer's subscription: cancel, card, invoices. */
export async function portal(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const subs = (await subsOf(env, user.email, user.id)).filter((s) => s.customer_id);
  if (!subs.length) return json({ error: 'none', reason: 'There is no Audioctor subscription on this account.' }, 404);
  try {
    const d = await C.api(env, 'POST', '/v1/customers/billing', { customer_id: subs[0].customer_id });
    if (!d || !/^https:\/\//.test(String(d.customer_portal_link || ''))) throw new Error('no link');
    return json({ ok: true, url: d.customer_portal_link });
  } catch { return json({ error: 'creem', reason: 'Could not open the subscription page. Please try again.' }, 502); }
}

/** The account's subscriptions, for /audioctor/mine. */
export async function subsFor(env, email, userId) {
  return (await subsOf(env, email, userId)).map((s) => ({ plan: s.plan, status: s.status, periodEnd: s.period_end,
    cancelAt: s.cancel_at || null, nextBilledAt: s.next_billed_at || null }));
}

// ── 4. reconcile: the webhook never came ────────────────────────────────────
/** For audioctorReconcile: Creem's own record of the order's checkout decides. */
export async function reconcile(env, order) {
  if (!/^ch_/.test(String(order.paddle_txn || ''))) return { error: 'no_checkout' };
  const ch = await C.api(env, 'GET', `/v1/checkouts?checkout_id=${encodeURIComponent(order.paddle_txn)}`);
  if (!ch || ch.status !== 'completed') return { error: 'not_paid', status: ch && ch.status };
  const outcome = await periodPaid(env, { ...paidFrom('checkout.completed', ch), ref: order.ref, checkout: ch.id });
  return { ok: outcome === 'granted' || outcome === 'already', outcome };
}

// ── 5. the daily cron ───────────────────────────────────────────────────────
/** A yearly subscriber hears two weeks before Creem charges again. One day's window, so each year's notice goes once. */
export async function renewalNotices(env, t = now()) {
  if (!on(env)) return { sent: 0 };
  const from = t + NOTICE_DAYS * 86400;
  const rows = ((await env.DB.prepare(
    `SELECT * FROM audioctor_paddle_subs WHERE env = ? AND plan = 'year' AND status = 'active' AND cancel_at IS NULL
        AND COALESCE(next_billed_at, period_end) >= ? AND COALESCE(next_billed_at, period_end) < ?`
  ).bind(C.tag(env), from, from + 86400).all()).results) || [];
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

/** The subscription row behind one entitlement, or null (audioctor-subs.js's licence refresh). */
export async function subOfEntitlement(env, entId) {
  return env.DB.prepare('SELECT * FROM audioctor_paddle_subs WHERE entitlement_id = ?').bind(entId).first().catch(() => null);
}
