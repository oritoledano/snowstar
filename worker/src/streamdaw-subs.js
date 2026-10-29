/**
 * StreamDAW Pro Monthly — every Pro feature for $8.99 a month (2026-10-14, Ori).
 *
 * ─── HOW IT BILLS ──────────────────────────────────────────────────────────
 * HYP charges shekels, so the dollar price becomes shekels ON THE DAY SOMEONE SUBSCRIBES, at the
 * site's own daily rate (fx.js, the one every price on the site is shown at), and then stays that
 * amount for as long as they stay: ₪27.62 on 2026-10-14 (899 ¢ ÷ 0.325508). A charge that moved
 * with the rate every month would be a new price every month, on a card that agreed to one; a
 * locked one is what the HYP page showed them, what each receipt says, and what the consumer law
 * treats as the agreed price. A new subscriber gets the day's rate.
 *
 * The first month is paid on HYP's own page: the usual SD- order, verified on the return like
 * every sale (hyp.js). That transaction then gives a card TOKEN (action=getToken), and the daily
 * cron charges the token server to server (action=soft) on the day a month runs out. HYP answers a
 * soft charge in the same reply (CCode=0: charged), so the next month's key is minted only for
 * money that came in. (HYP's own standing orders, HK=True, charge without telling us anything: no
 * webhook, no report API, so the Worker could never know a month was paid.) Docs read 2026-10-14:
 * developers.hyp.co.il/pay/common-use-cases/tokenization and /pay/reference/actions (getToken,
 * soft). The terminal must have tokenisation and token charges ("soft") switched on by HYP, with
 * PassP authentication (a Worker has no fixed IP), the Israeli ID optional (UserId=000000000),
 * token charges without CVV, and invoices on soft charges (SendHesh).
 *
 * ─── THE KEY ───────────────────────────────────────────────────────────────
 * A format-3 key (an end date the app enforces offline) that ends 3 days after the paid month
 * (GRACE_DAYS): time for a renewal, a retry, and the app to fetch the new key. Each paid renewal
 * marks the Mac's key request 'renewing' with the new end; the minter on the owner's Mac signs it
 * within a minute; the app asks POST /api/streamdaw/licence/refresh (its machine id and the
 * renewal code it was given with the first key) and applies the newer key itself.
 *
 * ─── WHEN IT FAILS ─────────────────────────────────────────────────────────
 * A declined renewal is tried again 1, 3 and 7 days after it was due, with an email each time,
 * then the subscription stops. A failure on OUR side (the terminal's permissions, HYP down) never
 * counts against the customer: no email to them, tried again tomorrow, the owner told. A charge
 * whose answer never came is never retried by itself (HYP has no transaction lookup, so a second
 * try could charge twice): it waits, locked, for the owner to check HYP's report and say paid or
 * not in the dashboard.
 *
 * ─── CANCELLING (Consumer Protection Law, 1981: §13ג–13ד, §14ג, §14ט) ───
 * Online in the account, by a link sent to the email (signed out: name and email only), or by
 * email / registered mail; it takes effect at once. The customer chooses: Pro to the end of the
 * month paid for, or end now with the unused days refunded (the owner refunds in HYP; zikoyAPI
 * could do it). Either way nothing more is charged, and a confirmation email goes out.
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { sha256b64, randB64, safeEqual, ipTag } from './crypto.js';
import { parseHyp } from './hyp.js';
import { cachedRates, FALLBACK } from './fx.js';
import * as SD from './streamdaw.js';

export const MONTHLY_USD_CENTS = 899;          // $8.99 a month, VAT included
export const GRACE_DAYS = 3;                   // a key runs this long past the paid month
const RETRY_DAYS = [1, 3, 7];                  // after the due day: 3 retries over 7 days, then it stops
const SUB_MIN_APP = '0.5.8';                   // reads a key with an end (format 3), signed by the Worker's pair
const RENEW_APP = '0.5.8';                     // fetches the next month's key by itself (0.5.6), and trusts the Worker's pair (0.5.8)
const HYP_API = 'https://pay.hyp.co.il/p/';    // server-to-server actions (getToken, soft), as the docs give them
const MANAGE_URL = `${SD.SITE}/account.html#apps`;
const CANCEL_URL = `${SD.SITE}/apps/streamdaw-cancel.html`;
const START_URL = `${SD.SITE}/apps/streamdaw.html?buy=1&plan=monthly#pricing`;
const SELLER = 'Ori Toledano, sole trader (עוסק מורשה 036743391), trading as Snowstar.Company, 22 Eilat Street, Tel Aviv, Israel · hello@snowstar.company';
const TERMS_MONTHLY = `${SD.TERMS_URL}#monthly`;
// HYP answers that are about our terminal or our request, never the customer's card: they must not
// use up the customer's retries or send them an email (developers.hyp.co.il/pay/reference/actions).
const OUR_SIDE = new Set(['401', '402', '447', '901', '902', '910', '996']);

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const lc = (e) => (e || '').trim().toLowerCase();
const urlToken = (n = 32) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newRef = (pre) => pre + urlToken(9).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10).padEnd(6, 'X');
const ils = (a) => `₪${(Number(a || 0) / 100).toFixed(2)}`;
const day = (sec) => new Date(Number(sec) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayOfMonth = (sec) => new Date(Number(sec) * 1000).getUTCDate();
const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const startOfNextUtcDay = (t) => { const d = new Date(t * 1000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) / 1000); };
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';

/** `n` months after `sec`, on the same day of the month (the 31st becomes the month's last day,
 *  and comes back as the 31st after it: every month is counted from the start, never from the last). */
export function addMonths(sec, n) {
  const d = new Date(Number(sec) * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / 1000);
}

/** The shekel price of a month, today: $8.99 at the site's daily rate, to the agora. */
export async function monthlyPrice(env) {
  const r = await cachedRates(env);
  let usd = Number(r && r.rates && r.rates.USD);
  // A rate this far from the shekel's is a broken feed, not the market: the baked one instead.
  if (!(usd > 0.2 && usd < 0.5)) usd = FALLBACK.USD;
  return { amount: Math.round(MONTHLY_USD_CENTS / usd), usdCents: MONTHLY_USD_CENTS, rate: usd, source: (r && r.source) || 'fallback' };
}

/** GET /streamdaw/prices — what the sale page shows: Pro once, and a month at today's rate. */
export async function streamdawPrices(env) {
  const m = await monthlyPrice(env);
  // The products (streamdaw-products.js): each one's price today, and whether checkout sells them yet.
  const products = await (await import('./streamdaw-products.js')).catalogFor(env);
  // Paddle (2026-10-29): the plans by the month and the year, and whether they sell now.
  const paddle = await (await import('./streamdaw-paddle.js')).paddlePrices(env).catch(() => null);
  return json({ pro: { amount: SD.PRICE_GROSS }, monthly: { amount: m.amount, usdCents: m.usdCents, rate: m.rate, open: await monthlyOpen(env) }, products, paddle });
}

/* Pro Monthly takes money only once HYP has switched on card tokens and server charges for the
   terminal (2026-10-14): until then the var STREAMDAW_MONTHLY_OPEN is unset, the card shows the
   free trial only, and a checkout is refused before anything is signed. Also closed while the
   subscriptions table does not exist yet. */
async function monthlyOpen(env) {
  if (String(env.STREAMDAW_MONTHLY_OPEN || '') !== '1') return false;
  return env.DB.prepare('SELECT 1 FROM streamdaw_subscriptions LIMIT 1').first().then(() => true, () => false);
}

// ── the subscription a person has ────────────────────────────────────────
// The one that matters now: running (active, past_due, or cancelled with time left), else the
// latest one at all.
async function subOf(env, userId, email) {
  return env.DB.prepare(
    `SELECT * FROM streamdaw_subscriptions WHERE (user_id = ? OR email = ?)
      ORDER BY (status IN ('active','past_due')) DESC, (status = 'cancelled' AND paid_through > ?) DESC, created_at DESC LIMIT 1`
  ).bind(userId || '', lc(email), now()).first().catch(() => null);
}
const running = (s, t = now()) => !!s && (s.status === 'active' || s.status === 'past_due' || (s.status === 'cancelled' && s.paid_through > t));
// What ending it now gives back: the unused part of the month paid for, to the agora, never more.
function refundIfNow(s, t = now()) {
  if (!s || !(s.paid_through > t) || s.cancel_when === 'now') return 0;
  const start = addMonths(s.started_at, s.periods - 1), len = Math.max(1, s.paid_through - start);
  return Math.max(0, Math.min(s.amount, Math.floor(s.amount * (s.paid_through - t) / len)));
}

/** What the account page, the sale page and the app are told. */
export async function subView(env, s, t = now()) {
  if (!s) return null;
  const charges = ((await env.DB.prepare(
    `SELECT ref, amount, status, period_no, period_start, period_end, created_at, settled_at FROM streamdaw_sub_charges
      WHERE sub_id = ? AND status IN ('paid','declined') ORDER BY created_at DESC LIMIT 24`
  ).bind(s.id).all().catch(() => ({ results: [] }))).results) || [];
  return {
    id: s.id, plan: 'monthly', status: s.status, amount: s.amount, usdCents: s.usd_cents,
    startedAt: s.started_at, paidThrough: s.paid_through, keyEnds: s.paid_through + GRACE_DAYS * 86400,
    renewsAt: s.status === 'active' ? s.next_charge_at : null,
    nextTryAt: s.status === 'past_due' ? s.next_charge_at : null, attempts: s.attempts,
    cardLast4: s.card_last4 || null, cancelledAt: s.cancelled_at || null, cancelWhen: s.cancel_when || null,
    refundDue: s.refund_due || 0, refundStatus: s.refund_status || null, refundIfNow: refundIfNow(s, t),
    canResume: s.status === 'cancelled' && s.cancel_when !== 'now' && s.paid_through > t && !!s.token,
    manage: MANAGE_URL, cancel: CANCEL_URL,
    charges: charges.map((c) => ({ ref: c.ref, amount: c.amount, status: c.status, period: c.period_no,
      from: c.period_start, to: c.period_end, at: c.settled_at || c.created_at })),
  };
}

/** For /streamdaw/mine: this person's subscription, if they have had one in the last 60 days. */
export async function subFor(env, user) {
  if (!user) return null;
  const s = await subOf(env, user.id, user.email);
  if (!s || (!running(s) && (s.ended_at || s.updated_at || 0) < now() - 60 * 86400)) return null;
  return subView(env, s);
}

// ── 1. checkout: the first month, on HYP's own page ───────────────────────
export async function monthlyCheckout(env, user, body) {
  const email = lc(user.email);
  if (body.coupon && String(body.coupon).trim())
    return json({ error: 'coupon', reason: 'codes are for StreamDAW Pro (once), not Pro Monthly' }, 400);
  const owns = await env.DB.prepare(
    `SELECT id FROM entitlements WHERE product = 'streamdaw' AND status = 'active' AND plan = 'lifetime' AND (user_id = ? OR email = ?) LIMIT 1`
  ).bind(user.id, email).first().catch(() => null);
  if (owns) return json({ error: 'owns_pro', reason: 'You already own StreamDAW Pro: there is nothing to subscribe to.' }, 409);
  const cur = await subOf(env, user.id, email);
  if (cur && cur.status === 'active') return json({ error: 'already_subscribed', manage: MANAGE_URL }, 409);
  if (cur && cur.status === 'cancelled' && cur.paid_through > now())
    return json({ error: 'resume_instead', manage: MANAGE_URL, until: cur.paid_through, canResume: !!cur.token && cur.cancel_when !== 'now' }, 409);
  // past_due: a card that keeps failing. A new card starts a new month today; the old subscription
  // is replaced when this one is paid (monthlyGranted), and never tried again.
  if (!SD.hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  // Before schema-streamdaw-subscriptions.sql has run, a first month could be paid with nowhere to
  // record it: no checkout at all until then.
  if (!(await monthlyOpen(env))) return json({ error: 'monthly_not_ready' }, 503);

  const price = await monthlyPrice(env);
  const ref = newRef('SD-');
  const machine = SD.normMachine(body.machine);
  const ownerName = String(user.name || body.name || '').trim().slice(0, 60) || null;
  await SD.insertOrder(env, { ref, userId: user.id, email, plan: 'monthly', amount: price.amount, status: 'started', coupon: null, machine, ownerName });

  const shekels = (price.amount / 100).toFixed(2);
  // HYP's page lists the item and shows Info: the renewal is said where the card is typed, too.
  const p = SD.payPageParams(env, { ref, amount: price.amount, user, email, item: 'StreamDAW Pro Monthly',
    info: `StreamDAW Pro Monthly ${ref}: ₪${shekels} today, then every month until you cancel` });
  const res = await fetch(`${SD.HYP_PAGE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);
  const t = now();
  return json({ ok: true, url: `${SD.HYP_PAGE}?${text.trim()}`, ref, plan: 'monthly', amount_gross: price.amount, credit: 0,
                usd_cents: MONTHLY_USD_CENTS, renews_on: ord(dayOfMonth(t)), next_charge_at: addMonths(t, 1) });
}

/* HYP: a token for the card of a transaction that went through. */
async function getToken(env, transId) {
  if (!/^\d{1,20}$/.test(String(transId || ''))) return { error: 'no transaction id on the return' };
  const p = new URLSearchParams({ action: 'getToken', Masof: env.HYP_TERMINAL, PassP: env.HYP_PASSP, TransId: String(transId) });
  try {
    const res = await fetch(`${HYP_API}?${p.toString()}`, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (/^\s*</.test(text)) return { error: 'HYP system error' };
    const d = parseHyp(text);
    if (d.CCode !== '0' || !/^\d{12,24}$/.test(d.Token || '') || !/^\d{4}$/.test(d.Tokef || '')) return { error: `getToken answered CCode ${d.CCode || '?'}` };
    return { token: d.Token, tyear: d.Tokef.slice(0, 2), tmonth: d.Tokef.slice(2, 4) };
  } catch (e) { return { error: 'getToken: ' + String(e && e.message || e).slice(0, 120) }; }
}

/* HYP: charge the saved token, server to server. paid | declined | ours | unknown. */
async function chargeToken(env, sub, ref, name) {
  const p = new URLSearchParams({
    action: 'soft', Masof: env.HYP_TERMINAL, PassP: env.HYP_PASSP,
    Amount: (sub.amount / 100).toFixed(2), Coin: '1',
    Token: 'True', CC: sub.token, Tmonth: sub.tmonth || '', Tyear: sub.tyear || '',
    UserId: sub.holder_id || '000000000', ClientName: name || 'StreamDAW', email: sub.email,
    Info: `StreamDAW Pro Monthly ${ref}`, Fild1: ref,
    SendHesh: 'True', MoreData: 'True', UTF8: 'True', UTF8out: 'True',
  });
  let text;
  try {
    const res = await fetch(`${HYP_API}?${p.toString()}`, { signal: AbortSignal.timeout(25000) });
    text = await res.text();
  } catch (e) { return { kind: 'unknown', error: String(e && e.message || e).slice(0, 200) }; }
  if (/^\s*</.test(text)) return { kind: 'ours', ccode: 'html', error: 'HYP answered with a system error page' };
  const d = parseHyp(text);
  const code = String(d.CCode == null ? '' : d.CCode);
  if (code === '0') return { kind: 'paid', hypId: d.Id || null, acode: d.ACode || null, amount: d.Amount, hesh: d.Hesh || null };
  if (code === '') return { kind: 'unknown', error: 'no CCode in the answer: ' + String(text).slice(0, 120) };
  if (OUR_SIDE.has(code)) return { kind: 'ours', ccode: code, hypId: d.Id || null, error: `HYP CCode ${code} (the terminal or our request, not the card)` };
  return { kind: 'declined', ccode: code, hypId: d.Id || null };
}

/** The first month went through on HYP's page (verified, the amount ours): the subscription, the
 *  card token, the entitlement (to the key's end). Called by streamdaw.js's return. */
export async function monthlyGranted(env, order, q, ref) {
  const old = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE first_ref = ?').bind(ref).first();
  if (old) return { sub: old, ent: await env.DB.prepare('SELECT * FROM entitlements WHERE id = ?').bind(old.entitlement_id).first() };
  const t = now(), paidThrough = addMonths(t, 1), keyEnd = paidThrough + GRACE_DAYS * 86400;
  const ent = await SD.grantEntitlement(env, { email: order.email, ext_ref: ref, amount: order.amount, plan: 'monthly', source: 'hyp', expiresAt: keyEnd });
  const tok = await getToken(env, q.Id);
  const holder = /^\d{5,9}$/.test(String(q.UserId || '')) ? String(q.UserId).padStart(9, '0') : '000000000';
  const last4 = /^\d{4}$/.test(String(q.L4digit || '')) ? String(q.L4digit) : (tok.token ? tok.token.slice(-4) : null);
  const ins = await env.DB.prepare(
    `INSERT INTO streamdaw_subscriptions (user_id, email, entitlement_id, first_ref, status, amount, usd_cents, fx_usd, token, tmonth, tyear,
       holder_id, card_last4, started_at, periods, paid_through, next_charge_at, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?) ON CONFLICT(first_ref) DO NOTHING`
  ).bind(order.user_id || null, lc(order.email), ent.id, ref, order.amount, MONTHLY_USD_CENTS,
         Math.round((MONTHLY_USD_CENTS / order.amount) * 1e6) / 1e6, tok.token || null, tok.tmonth || null, tok.tyear || null,
         holder, last4, t, paidThrough, paidThrough, t, t).run();
  const sub = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE first_ref = ?').bind(ref).first();
  if (ins.meta && ins.meta.changes === 1) {
    await env.DB.prepare(
      `INSERT INTO streamdaw_sub_charges (sub_id, period_no, attempt, ref, amount, status, period_start, period_end, hyp_id, acode, ccode, created_at, settled_at)
       VALUES (?, 1, 1, ?, ?, 'paid', ?, ?, ?, ?, '0', ?, ?)`
    ).bind(sub.id, ref, order.amount, t, paidThrough, String(q.Id || ''), String(q.ACode || ''), t, t).run().catch(() => {});
    // A card that kept failing on an older subscription of theirs: this one replaces it.
    await env.DB.prepare(
      `UPDATE streamdaw_subscriptions SET status = 'replaced', next_charge_at = NULL, token = NULL, ended_at = ?, updated_at = ?
        WHERE (user_id = ? OR email = ?) AND status = 'past_due' AND id != ?`
    ).bind(t, t, order.user_id || '', lc(order.email), sub.id).run().catch(() => {});
  }
  if (!tok.token) {
    await sendMail(env, { to: owner(env), subject: '[Admin] StreamDAW Pro Monthly: no card token, this subscriber will not renew',
      text: `Order ${ref} (${order.email}) paid its first month, but HYP gave no token: ${tok.error}.\n`
          + `Without one, the renewal on ${day(paidThrough)} fails and the customer is told to subscribe again.\n`
          + `Ask HYP to switch on tokenisation (getToken) and token charges (soft) for terminal ${env.HYP_TERMINAL}.` }).catch(() => {});
  }
  return { sub, ent };
}

/** Buying Pro once cancels a Pro Monthly: nobody pays twice for the same thing. */
export async function cancelForUpgrade(env, email, userId) {
  const s = await subOf(env, userId, email);
  if (!s || !(s.status === 'active' || s.status === 'past_due')) return null;
  return cancelSub(env, s, { when: 'end', via: 'upgrade' });
}

// ── 2. the daily renewals (index.js's cron) ───────────────────────────────
/** Charge every subscription due today (UTC), at most once per month each. */
export async function streamdawRenewals(env, t = now()) {
  if (!SD.hypConfigured(env)) return { skipped: 'hyp_not_configured' };
  const cutoff = startOfNextUtcDay(t);
  const due = ((await env.DB.prepare(
    `SELECT * FROM streamdaw_subscriptions WHERE status IN ('active','past_due') AND next_charge_at IS NOT NULL
        AND next_charge_at < ? AND charging_at IS NULL ORDER BY next_charge_at ASC LIMIT 100`
  ).bind(cutoff).all()).results) || [];
  const out = [];
  for (const s of due) out.push(await renewOne(env, s, t).catch((e) => 'error: ' + (e && e.message)));
  // A cancelled month that ran out (and its 3 days): the subscription ends, its card token goes.
  await env.DB.prepare(
    `UPDATE streamdaw_subscriptions SET status = 'ended', ended_at = ?, token = NULL, tmonth = NULL, tyear = NULL, updated_at = ?
      WHERE status = 'cancelled' AND paid_through + ? < ?`
  ).bind(t, t, GRACE_DAYS * 86400, t).run().catch(() => {});
  // A charge that never got its answer: said every day until the owner settles it.
  const stuck = ((await env.DB.prepare(
    `SELECT s.id, s.email, c.ref, c.amount, c.created_at FROM streamdaw_subscriptions s
       JOIN streamdaw_sub_charges c ON c.sub_id = s.id AND c.status IN ('unknown','charging')
      WHERE s.charging_at IS NOT NULL AND s.charging_at < ?`
  ).bind(t - 1800).all().catch(() => ({ results: [] }))).results) || [];
  if (stuck.length) {
    await sendMail(env, { to: owner(env), subject: `[Admin] StreamDAW Pro Monthly: ${stuck.length} charge(s) with no answer from HYP`,
      text: stuck.map((x) => `${x.ref} · ${x.email} · ${ils(x.amount)} · tried ${new Date(x.created_at * 1000).toISOString()}`).join('\n')
          + `\n\nFind each ref in HYP's transaction report (Info / Fild1). Then in the dashboard (StreamDAW › Subscriptions) say Paid or Not charged.\n`
          + `Nothing more is charged on these until you do.` }).catch(() => {});
  }
  return { due: due.length, out };
}

async function nameOf(env, s) {
  const u = s.user_id ? await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(s.user_id).first().catch(() => null) : null;
  return SD.firstName(u && u.name) || lc(s.email).split('@')[0] || 'StreamDAW';
}

async function renewOne(env, sub, t) {
  // The lock: only one charge at a time, whoever else runs this.
  const claim = await env.DB.prepare(
    `UPDATE streamdaw_subscriptions SET charging_at = ?, updated_at = ? WHERE id = ? AND charging_at IS NULL
        AND status IN ('active','past_due') AND next_charge_at IS NOT NULL AND next_charge_at < ?`
  ).bind(t, t, sub.id, startOfNextUtcDay(t)).run();
  if (!(claim.meta && claim.meta.changes === 1)) return 'busy';
  const s = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(sub.id).first();
  const periodNo = s.periods + 1, from = s.paid_through, to = addMonths(s.started_at, periodNo);
  const release = (sql, ...b) => env.DB.prepare(sql).bind(...b).run();

  // Already paid for this month (a run that died between its writes): move on, charge nothing.
  const paid = await env.DB.prepare(`SELECT * FROM streamdaw_sub_charges WHERE sub_id = ? AND period_no = ? AND status = 'paid'`).bind(s.id, periodNo).first();
  if (paid) { await monthPaid(env, s, paid, t); return 'already paid'; }

  const tries = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM streamdaw_sub_charges WHERE sub_id = ? AND period_no = ?').bind(s.id, periodNo).first()) || {}).n || 0;
  const ref = newRef('SDR-');
  try {
    await env.DB.prepare(
      `INSERT INTO streamdaw_sub_charges (sub_id, period_no, attempt, ref, amount, status, period_start, period_end, created_at)
       VALUES (?, ?, ?, ?, ?, 'charging', ?, ?, ?)`
    ).bind(s.id, periodNo, tries + 1, ref, s.amount, from, to, t).run();
  } catch (e) {
    await release('UPDATE streamdaw_subscriptions SET charging_at = NULL WHERE id = ?', s.id);
    return 'not recorded: ' + (e && e.message);
  }

  const r = s.token ? await chargeToken(env, s, ref, await nameOf(env, s)) : { kind: 'declined', ccode: 'no_token' };
  const charge = { ref };
  if (r.kind === 'paid') {
    await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'paid', hyp_id = ?, acode = ?, ccode = '0', settled_at = ? WHERE ref = ?`)
      .bind(r.hypId, r.acode, t, ref).run();
    const got = Math.round(parseFloat(String(r.amount || '0')) * 100);
    if (r.amount != null && got !== s.amount) {
      await sendMail(env, { to: owner(env), subject: '[Admin] StreamDAW Pro Monthly: HYP charged a different amount',
        text: `${ref} (${s.email}): asked ${ils(s.amount)}, HYP says ${r.amount}. Treated as paid. Check HYP.` }).catch(() => {});
    }
    await monthPaid(env, s, { ...charge, period_no: periodNo, period_end: to, hyp_id: r.hypId }, t);
    return 'paid';
  }
  if (r.kind === 'unknown') {
    // The lock stays: no automatic try again for this one, ever (HYP cannot be asked whether it went through).
    await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'unknown', error = ? WHERE ref = ?`).bind(r.error || null, ref).run();
    await env.DB.prepare('UPDATE streamdaw_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?').bind('no answer from HYP: ' + (r.error || ''), t, s.id).run();
    await sendMail(env, { to: owner(env), subject: '[Admin] StreamDAW Pro Monthly: a charge got no answer',
      text: `${ref} · ${s.email} · ${ils(s.amount)}: ${r.error}.\nIt may or may not have gone through. Find "${ref}" in HYP's report, then say Paid or Not charged `
          + `in the dashboard (StreamDAW › Subscriptions). Nothing is charged on this subscription until then.` }).catch(() => {});
    return 'unknown';
  }
  if (r.kind === 'ours') {
    await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'error', ccode = ?, hyp_id = ?, error = ?, settled_at = ? WHERE ref = ?`)
      .bind(r.ccode || null, r.hypId || null, r.error || null, t, ref).run();
    await release(`UPDATE streamdaw_subscriptions SET charging_at = NULL, next_charge_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      startOfNextUtcDay(t), r.error || null, t, s.id);
    await sendMail(env, { to: owner(env), subject: '[Admin] StreamDAW Pro Monthly: renewals fail on our side',
      text: `${ref} · ${s.email}: ${r.error}.\nThe customer was not told and nothing counts against them; it is tried again tomorrow.\n`
          + `CCode 901/996: the terminal has no token permission. 902: wrong PassP. 401/402/447: our request is missing a field.` }).catch(() => {});
    return 'ours';
  }
  // declined: the card said no
  await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'declined', ccode = ?, hyp_id = ?, settled_at = ? WHERE ref = ?`)
    .bind(r.ccode || null, r.hypId || null, t, ref).run();
  const attempts = s.attempts + 1;
  if (attempts > RETRY_DAYS.length) {
    await release(`UPDATE streamdaw_subscriptions SET status = 'ended', charging_at = NULL, next_charge_at = NULL, attempts = ?, token = NULL,
        tmonth = NULL, tyear = NULL, ended_at = ?, last_error = ?, updated_at = ? WHERE id = ?`, attempts, t, 'declined ' + r.ccode, t, s.id);
    await mailEnded(env, s).catch(() => {});
    return 'ended';
  }
  const next = Math.max(from + RETRY_DAYS[attempts - 1] * 86400, startOfNextUtcDay(t));
  await release(`UPDATE streamdaw_subscriptions SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'past_due' END, charging_at = NULL,
      next_charge_at = CASE WHEN status = 'cancelled' THEN NULL ELSE ? END, attempts = ?, last_error = ?, updated_at = ? WHERE id = ?`,
    next, attempts, 'declined ' + r.ccode, t, s.id);
  await mailFailed(env, s, { attempts, next, ccode: r.ccode }).catch(() => {});
  return 'declined';
}

/* A month paid: the subscription moves on a month, the entitlement and every Mac's key request
   take the new end (the minter signs them; the app fetches its own), and the receipt goes out. */
async function monthPaid(env, s, charge, t) {
  const periodNo = charge.period_no || s.periods + 1;
  const to = addMonths(s.started_at, periodNo), keyEnd = to + GRACE_DAYS * 86400;
  await env.DB.prepare(
    `UPDATE streamdaw_subscriptions SET periods = ?, paid_through = ?, attempts = 0, charging_at = NULL, last_error = NULL,
       status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'active' END,
       next_charge_at = CASE WHEN status = 'cancelled' THEN NULL ELSE ? END, updated_at = ? WHERE id = ?`
  ).bind(periodNo, to, to, t, s.id).run();
  await env.DB.prepare('UPDATE entitlements SET expires_at = ? WHERE id = ?').bind(keyEnd, s.entitlement_id).run();
  await env.DB.prepare(
    `UPDATE streamdaw_activations SET expires_at = ?, status = CASE WHEN status IN ('issued','renewing') THEN 'renewing' ELSE status END
      WHERE entitlement_id = ? AND status IN ('issued','renewing','pending')`
  ).bind(keyEnd, s.entitlement_id).run();
  await SD.mintWaiting(env, s.entitlement_id).catch(() => {});   // the Worker signs the new month's keys now
  const s2 = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(s.id).first();
  await mailRenewed(env, s2, { ref: charge.ref, from: s.paid_through, to }).catch(() => {});
}

// ── 3. cancelling, and changing one's mind ────────────────────────────────
async function cancelSub(env, s, { when, via, t = now() }) {
  when = when === 'now' ? 'now' : 'end';
  if (s.status === 'cancelled' && (s.cancel_when === 'now' || when === 'end')) return { already: true };   // said once is enough
  const refund = when === 'now' ? refundIfNow(s, t) : 0;
  const until = when === 'now' ? Math.min(s.paid_through, t) : s.paid_through;
  await env.DB.prepare(
    `UPDATE streamdaw_subscriptions SET status = 'cancelled', next_charge_at = NULL, cancelled_at = ?, cancel_via = ?, cancel_when = ?,
       paid_through = ?, refund_due = ?, refund_status = ?, cancel_token_hash = NULL, cancel_token_exp = NULL, updated_at = ? WHERE id = ?`
  ).bind(t, via, when, until, refund || null, refund ? 'owed' : null, t, s.id).run();
  if (when === 'now') {
    // Pro ends now: the account says so, no key for a new month is made, and the app is told to
    // drop this key when it next asks (offline, the key runs to its end: it cannot be called back).
    await env.DB.prepare('UPDATE entitlements SET expires_at = ? WHERE id = ?').bind(t, s.entitlement_id).run();
    await env.DB.prepare(`UPDATE streamdaw_activations SET status = 'issued' WHERE entitlement_id = ? AND status = 'renewing'`).bind(s.entitlement_id).run();
  }
  const s2 = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(s.id).first();
  await mailCancelled(env, s2, { refund, via }).catch(() => {});
  if (refund) {
    const last = await env.DB.prepare(`SELECT ref, hyp_id FROM streamdaw_sub_charges WHERE sub_id = ? AND status = 'paid' ORDER BY period_no DESC LIMIT 1`).bind(s.id).first().catch(() => null);
    await sendMail(env, { to: owner(env), subject: `[Admin] StreamDAW Pro Monthly: refund ${ils(refund)} to ${s.email}`,
      text: `${s.email} cancelled with "end now". Refund ${ils(refund)} (the unused days) within 14 days:\n`
          + `HYP portal › the transaction ${last ? `${last.ref} (HYP Id ${last.hyp_id})` : ''} › refund ${ils(refund)}.\n`
          + `Then mark it refunded in the dashboard (StreamDAW › Subscriptions).` }).catch(() => {});
  }
  return { ok: true, refund };
}

async function viewFromToken(env, token) {
  const tk = String(token || '');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(tk)) return null;
  const s = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE cancel_token_hash = ?').bind(await sha256b64(tk)).first().catch(() => null);
  return s && s.cancel_token_exp > now() ? s : null;
}

/** POST /streamdaw/subscription/cancel {when: 'end'|'now', token?} — signed in, or with the
 *  link from the "cancel by email" form. */
export async function streamdawSubCancel(req, env, user) {
  const b = await req.json().catch(() => ({}));
  if (!user && !b.token) return json({ error: 'sign_in_required' }, 401);
  const s = b.token ? await viewFromToken(env, b.token) : await subOf(env, user.id, user.email);
  if (!s || !running(s)) return json({ error: b.token ? 'link_expired' : 'no_subscription' }, b.token ? 410 : 404);
  const r = await cancelSub(env, s, { when: b.when, via: b.token ? 'link' : 'account' });
  return json({ ok: true, already: !!r.already, refund: r.refund || 0,
    subscription: await subView(env, await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(s.id).first()) });
}

/** POST /streamdaw/subscription/resume — a cancelled month with time left goes on renewing. */
export async function streamdawSubResume(req, env, user) {
  if (!user) return json({ error: 'sign_in_required' }, 401);
  const s = await subOf(env, user.id, user.email), t = now();
  if (!s || s.status !== 'cancelled' || s.cancel_when === 'now' || !(s.paid_through > t) || !s.token) return json({ error: 'cannot_resume' }, 409);
  await env.DB.prepare(
    `UPDATE streamdaw_subscriptions SET status = 'active', next_charge_at = paid_through, cancelled_at = NULL, cancel_via = NULL,
       cancel_when = NULL, updated_at = ? WHERE id = ? AND status = 'cancelled'`
  ).bind(t, s.id).run();
  const s2 = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(s.id).first();
  await mail(env, s2.email, {
    subject: 'StreamDAW Pro Monthly is on again',
    title: 'Pro Monthly is on again',
    intro: `It renews on <b>${day(s2.next_charge_at)}</b> at ${ils(s2.amount)} (VAT included), and every month after that until you cancel.`,
    lines: [`Next charge: ${ils(s2.amount)} on ${day(s2.next_charge_at)}`],
  }).catch(() => {});
  return json({ ok: true, subscription: await subView(env, s2) });
}

/** POST /streamdaw/subscription/cancel-link {email} — signed out: a one-time link (24 h) to the
 *  address the subscription is under. Always "sent", so it never tells who subscribes. */
export async function streamdawSubCancelLink(req, env) {
  const b = await req.json().catch(() => ({}));
  const email = lc(b.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'bad_email' }, 400);
  const ip = req.headers.get('cf-connecting-ip') || '';
  const tag = ip ? await ipTag(env, ip, 'sdcancel') : 'none';
  if (await SD.liveThrottle(env, 'sdcancel-ip:' + tag, 10, 3600) || await SD.liveThrottle(env, 'sdcancel-em:' + email, 3, 3600))
    return json({ error: 'slow_down' }, 429);
  const s = await subOf(env, '', email);
  if (s && running(s) && !(s.status === 'cancelled' && s.cancel_when === 'now')) {
    const token = urlToken(24), t = now();
    await env.DB.prepare('UPDATE streamdaw_subscriptions SET cancel_token_hash = ?, cancel_token_exp = ?, updated_at = ? WHERE id = ?')
      .bind(await sha256b64(token), t + 86400, t, s.id).run();
    const link = `${CANCEL_URL}?t=${token}`;
    await mail(env, s.email, {
      subject: 'Cancel StreamDAW Pro Monthly',
      title: 'Cancel Pro Monthly',
      intro: 'Someone (we hope you) asked to cancel the StreamDAW Pro Monthly under this email. The link works for 24 hours.',
      button: { href: link, label: 'Cancel Pro Monthly' },
      footer: 'Did not ask for this? Ignore this email: nothing changes.',
      text: `Cancel StreamDAW Pro Monthly (the link works for 24 hours):\n${link}\n\nDid not ask for this? Ignore this email: nothing changes.`,
    }).catch(() => {});
  }
  return json({ ok: true });
}

/** POST /streamdaw/subscription/by-token {token} — what the cancel page shows for a link. */
export async function streamdawSubByToken(req, env) {
  const b = await req.json().catch(() => ({}));
  const s = await viewFromToken(env, b.token);
  if (!s || !running(s)) return json({ error: 'link_expired' }, 410);
  const v = await subView(env, s);
  delete v.charges;
  return json({ ok: true, subscription: v, email: s.email.replace(/^(.).*(@.*)$/, '$1…$2') });
}

/** POST /streamdaw/subscription/admin {id, action} — the owner: settle a charge HYP never answered
 *  (paid | notcharged), mark a refund done, cancel. */
export async function streamdawSubAdmin(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const s = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE id = ?').bind(Number(b.id || 0)).first();
  if (!s) return json({ error: 'not_found' }, 404);
  const t = now();
  if (b.action === 'paid' || b.action === 'notcharged') {
    const c = await env.DB.prepare(`SELECT * FROM streamdaw_sub_charges WHERE sub_id = ? AND status IN ('unknown','charging') ORDER BY id DESC LIMIT 1`).bind(s.id).first();
    if (!c) return json({ error: 'nothing_to_settle' }, 409);
    if (b.action === 'paid') {
      await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'paid', hyp_id = COALESCE(?, hyp_id), settled_at = ?, error = 'settled by hand' WHERE id = ?`)
        .bind(b.hyp_id ? String(b.hyp_id).slice(0, 40) : null, t, c.id).run();
      await monthPaid(env, s, { ref: c.ref, period_no: c.period_no }, t);
    } else {
      await env.DB.prepare(`UPDATE streamdaw_sub_charges SET status = 'error', error = 'not charged (checked by hand)', settled_at = ? WHERE id = ?`).bind(t, c.id).run();
      await env.DB.prepare(`UPDATE streamdaw_subscriptions SET charging_at = NULL, next_charge_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`)
        .bind(startOfNextUtcDay(t), t, s.id).run();
    }
    return json({ ok: true });
  }
  if (b.action === 'refunded') {
    await env.DB.prepare(`UPDATE streamdaw_subscriptions SET refund_status = 'refunded', updated_at = ? WHERE id = ? AND refund_status = 'owed'`).bind(t, s.id).run();
    return json({ ok: true });
  }
  if (b.action === 'cancel') {
    if (!running(s)) return json({ error: 'not_running' }, 409);
    return json(await cancelSub(env, s, { when: b.when === 'now' ? 'now' : 'end', via: 'admin' }));
  }
  return json({ error: 'bad_action' }, 400);
}

/** For the dashboard (streamdaw.js's admin): every subscription, its charges, and the money. */
export async function subsAdmin(env) {
  const soft = async (sql, ...b) => { try { return (await env.DB.prepare(sql).bind(...b).all()).results || []; } catch { return []; } };
  const subs = await soft(
    `SELECT s.id, s.email, s.status, s.amount, s.usd_cents, s.started_at, s.periods, s.paid_through, s.next_charge_at, s.attempts,
            s.charging_at, s.last_error, s.card_last4, s.cancelled_at, s.cancel_via, s.cancel_when, s.refund_due, s.refund_status,
            (s.token IS NOT NULL) AS has_token, u.name AS user_name
       FROM streamdaw_subscriptions s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 200`);
  const charges = await soft(
    `SELECT c.sub_id, c.ref, c.amount, c.status, c.period_no, c.attempt, c.ccode, c.hyp_id, c.error, c.created_at, s.email
       FROM streamdaw_sub_charges c JOIN streamdaw_subscriptions s ON s.id = c.sub_id ORDER BY c.created_at DESC LIMIT 200`);
  return {
    subscriptions: subs, subCharges: charges,
    subStats: {
      active: subs.filter((s) => s.status === 'active' || s.status === 'past_due').length,
      pastDue: subs.filter((s) => s.status === 'past_due').length,
      mrr: subs.filter((s) => s.status === 'active' || s.status === 'past_due').reduce((n, s) => n + (s.amount || 0), 0),
      stuck: subs.filter((s) => s.charging_at).length,
      refundsOwed: subs.filter((s) => s.refund_status === 'owed').reduce((n, s) => n + (s.refund_due || 0), 0),
    },
  };
}

// ── 4. the app asks for its renewed key ───────────────────────────────────
/* A key's end (ms), read from its payload (format 3's sixth line); 0 for any other key. */
export function keyEndMs(text) {
  const hex = SD.keyHex(text);
  if (!/^53440[34]/.test(hex) || hex.length < 2 * (3 + 16 + 64)) return 0;
  const b = Uint8Array.from(hex.match(/../g), (x) => parseInt(x, 16));
  const f = new TextDecoder().decode(b.subarray(3, b.length - 64)).split('\n');
  // Format 4 (products): the latest of its products' ends ("splits@<hex ms>,party@…"); one for good: none.
  if (f.length === 7) {
    const ends = String(f[6]).split(',').map((e) => (e.includes('@') ? parseInt(e.split('@')[1], 16) : 0));
    return ends.length && ends.every((v) => Number.isFinite(v) && v > 0) ? Math.max(...ends) : 0;
  }
  const v = f.length === 6 ? parseInt(f[5], 16) : 0;
  return Number.isFinite(v) ? v : 0;
}
const RENEW_CODE = /^rk_[A-Za-z0-9_-]{20,64}$/;
export const newRenewCode = () => 'rk_' + urlToken(24);

/** POST /streamdaw/licence/refresh {machine, code, have} — from the app (no cookie, no Origin), once
 *  a day while online: this Mac's subscription now, and its newest key when that ends later than
 *  the one it has (`have`, ms). The code came with the first key; it only ever reaches this row. */
export async function streamdawLicenceRefresh(req, env) {
  const b = await req.json().catch(() => ({}));
  const machine = SD.normMachine(b.machine), code = String(b.code || '');
  if (!machine || !RENEW_CODE.test(code)) return json({ error: 'bad_request' }, 400);
  const ip = req.headers.get('cf-connecting-ip') || '';
  const tag = ip ? await ipTag(env, ip, 'sdrenew') : 'none';
  if (await SD.liveThrottle(env, 'sdrenew-ip:' + tag, 300, 3600) || await SD.liveThrottle(env, 'sdrenew-m:' + machine, 60, 3600))
    return json({ error: 'slow_down' }, 429);
  const rows = ((await env.DB.prepare(
    `SELECT id, entitlement_id, status, key_text, serial, renew_code, issued_at FROM streamdaw_activations WHERE machine_id = ? AND renew_code IS NOT NULL`
  ).bind(machine).all()).results) || [];
  const row = rows.find((r) => safeEqual(String(r.renew_code), code));
  if (!row) return json({ error: 'unknown' }, 403);
  let s = await env.DB.prepare('SELECT * FROM streamdaw_subscriptions WHERE entitlement_id = ?').bind(row.entitlement_id).first();
  // A Paddle subscription (2026-10-29): the same answer, from its own row (Paddle bills; nothing is charged here).
  if (!s) {
    const p = await (await import('./streamdaw-paddle.js')).paddleSubOfEntitlement(env, row.entitlement_id);
    if (p) s = { status: p.status === 'canceled' ? 'ended' : p.cancel_at ? 'cancelled' : p.status === 'past_due' ? 'past_due' : 'active',
                 paid_through: p.period_end, next_charge_at: p.cancel_at ? null : (p.next_billed_at || p.period_end), cancel_when: 'end' };
  }
  const keyEnds = row.key_text ? keyEndMs(row.key_text) : 0;
  const out = {
    ok: true, plan: 'monthly', status: s ? s.status : 'ended', serial: row.serial || null, keyEnds,
    paidThrough: s ? s.paid_through * 1000 : 0,
    renewsAt: s && s.status === 'active' && s.next_charge_at ? s.next_charge_at * 1000 : null,
    nextTryAt: s && s.status === 'past_due' && s.next_charge_at ? s.next_charge_at * 1000 : null,
    renewing: row.status === 'renewing', manage: MANAGE_URL,
  };
  // A products key (Paddle): the app up to 0.7.1 sends have 0 for it (its key never ends itself), so the key goes
  // out only in the two days after it was signed, not every day (each would say "renewed" again).
  const fresh = !SD.keyIsProducts(row.key_text) || Number(b.have || 0) > 0 || Number(row.issued_at || 0) > now() - 2 * 86400;
  if (row.key_text && keyEnds > Number(b.have || 0) && fresh) out.key = SD.keyLines(row.key_text);
  // Ended now with the unused days refunded: the app drops this key (it carries this serial).
  if (s && s.status === 'cancelled' && s.cancel_when === 'now') { out.revoke = true; delete out.key; }
  return json(out);
}

// ── the emails (the licenceMail look) ─────────────────────────────────────
function mail(env, to, { subject, title, intro, steps, lines, key, footer, button, text }) {
  const facts = (lines || []).filter(Boolean);
  const cancelHtml = `Cancel any time, no fee: in <a href="${MANAGE_URL}">your account</a> (Apps), with <a href="${CANCEL_URL}">this link</a>, `
    + `by email to <a href="mailto:${SD.HELP_MAIL}">${SD.HELP_MAIL}</a>, or by registered mail to the address below. Charges stop at once.`;
  const cancelText = `Cancel any time, no fee: in your account (${MANAGE_URL}), at ${CANCEL_URL}, by email to ${SD.HELP_MAIL}, or by registered mail to the address below. Charges stop at once.`;
  const html = SD.licenceMail({
    title, intro, steps, key, button,
    footer: (facts.length ? facts.map(SD.escHtml).join('<br>') + '<br><br>' : '') + (footer ? footer + '<br><br>' : '')
      + cancelHtml + `<br>Terms: <a href="${TERMS_MONTHLY}">StreamDAW licence terms, Pro Monthly</a>.<br>${SD.escHtml(SELLER)}`,
  });
  const body = (text || `${title}\n\n${String(intro).replace(/<[^>]+>/g, '')}`)
    + (steps && steps.length ? '\n\n' + steps.map((x, i) => `${i + 1}. ${String(x).replace(/<[^>]+>/g, '')}`).join('\n') : '')
    + (button ? `\n\n${button.label}: ${button.href}` : '')
    + (key ? `\n\n${key}` : '') + (facts.length ? '\n\n' + facts.join('\n') : '')
    + (footer && !text ? '\n\n' + String(footer).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '') : '')
    + `\n\n${cancelText}\nTerms: ${TERMS_MONTHLY}\n${SELLER}\n\n${SD.mailLinksText()}\n\n— Snowstar.Company`;
  return sendMail(env, { to, subject, text: body, html });
}

/** The first month's email: the receipt, the download, and everything the law wants in writing
 *  for a sale at a distance (§14ג(ב)): who sells, the price and the renewal, how to cancel. */
export async function mailWelcome(env, s, { link, machine, ref }) {
  const soon = env.MINTER_TOKEN ? 'usually within minutes' : 'usually within a day';
  const keyLine = machine
    ? `Your key for this Mac (${machine}) arrives in a second email, ${soon}. Copy everything in its box, the key and its Renewal line, into StreamDAW › Settings › Licence and press Unlock.`
    : `Get the key for your Mac on ${SD.UNLOCK_URL} (sign in with this email).`;
  return mail(env, s.email, {
    subject: 'Welcome to StreamDAW Pro Monthly: receipt and download',
    title: 'Welcome to StreamDAW Pro Monthly',
    intro: `Thanks for subscribing: every Pro feature for <b>${ils(s.amount)} a month</b> (VAT included), renewing on the ${ord(dayOfMonth(s.started_at))} of every month until you cancel.`,
    steps: [
      'Download StreamDAW and install the .pkg.',
      SD.escHtml(keyLine),
      `StreamDAW ${RENEW_APP} or newer renews the key by itself every month while it is online. Open your DAW, put StreamDAW on the master bus, press <b>GO LIVE</b>.`,
    ],
    button: { href: link, label: 'Download StreamDAW' },
    lines: [
      `Order: ${ref}`,
      'Product: StreamDAW Pro Monthly, every Pro feature, renews monthly until you cancel',
      `Paid today: ${ils(s.amount)} incl. VAT (US$${(s.usd_cents / 100).toFixed(2)} at the day's rate; this amount stays the same every month)`,
      `Next charge: ${ils(s.amount)} on ${day(s.next_charge_at)}`,
      s.card_last4 ? `Card ending ${s.card_last4}` : '',
      `Date: ${day(s.started_at)}`,
      'HYP emails the tax receipt for each charge separately.',
    ],
    footer: 'Cancelling ends the renewals. You choose: Pro to the end of the month you paid for, or end now and we refund the unused days. '
      + 'Within 14 days of today you may also cancel under the Consumer Protection Law and get back what you paid for the days not used. '
      + `The download link is private and good for 7 days; after that, download from <a href="${SD.ACCOUNT_URL}">your account</a>.`,
  });
}

async function mailRenewed(env, s, { ref, from, to }) {
  return mail(env, s.email, {
    subject: `StreamDAW Pro Monthly receipt: ${ils(s.amount)}, ${day(from)}`,
    title: 'Pro Monthly renewed',
    intro: `We charged <b>${ils(s.amount)}</b> (VAT included)${s.card_last4 ? ` to your card ending ${s.card_last4}` : ''} for StreamDAW Pro Monthly, ${day(from)} to ${day(to)}.`,
    steps: [
      `Nothing to do: your Mac picks up its new key by itself while it is online (StreamDAW ${RENEW_APP} or newer).`,
      `Older version, or offline for a while? Sign in on <a href="${SD.UNLOCK_URL}">the unlock page</a> and copy the new key into StreamDAW › Settings › Licence.`,
    ],
    lines: [`Charge: ${ref}`, `Paid: ${ils(s.amount)} incl. VAT`, s.status === 'active' ? `Next charge: ${ils(s.amount)} on ${day(s.next_charge_at)}` : `No further charges (cancelled): Pro until ${day(s.paid_through)}`,
            'HYP emails the tax receipt for this charge separately.'],
  });
}

async function mailFailed(env, s, { attempts, next }) {
  const keyEnd = s.paid_through + GRACE_DAYS * 86400;
  return mail(env, s.email, {
    subject: 'Your StreamDAW Pro Monthly payment didn’t go through',
    title: 'The payment didn’t go through',
    intro: `We couldn’t charge ${ils(s.amount)}${s.card_last4 ? ` to your card ending ${s.card_last4}` : ''} for the month from ${day(s.paid_through)}. `
      + `We try again on <b>${day(next)}</b> (try ${attempts + 1} of ${RETRY_DAYS.length + 1}). Pro stays on until ${day(keyEnd)}.`,
    steps: [
      'Card fine (a limit, a block lifted)? Nothing to do: we try again by ourselves.',
      `A new card? <a href="${START_URL}">Start Pro Monthly with it</a>: the old card is not tried again.`,
      `Don’t want it any more? <a href="${MANAGE_URL}">Cancel in your account</a>: nothing more is charged.`,
    ],
    button: { href: START_URL, label: 'Use another card' },
  });
}

async function mailEnded(env, s) {
  const keyEnd = s.paid_through + GRACE_DAYS * 86400;
  return mail(env, s.email, {
    subject: 'StreamDAW Pro Monthly has ended',
    title: 'Pro Monthly has ended',
    intro: `We tried ${RETRY_DAYS.length + 1} times over 7 days and the card did not go through, so we stopped. Nothing more will be charged. `
      + `Pro ${keyEnd > now() ? 'stays on until' : 'ended on'} ${day(keyEnd)}; then StreamDAW goes back to Free.`,
    steps: [`Want Pro back? <a href="${START_URL}">Start Pro Monthly again</a>, or buy Pro once and keep it.`],
    button: { href: START_URL, label: 'Start Pro Monthly again' },
  });
}

async function mailCancelled(env, s, { refund, via }) {
  const now_ = s.cancel_when === 'now';
  return mail(env, s.email, {
    subject: 'Your StreamDAW Pro Monthly is cancelled',
    title: 'Pro Monthly is cancelled',
    intro: (via === 'upgrade' ? 'You bought StreamDAW Pro, so your Pro Monthly is cancelled: Pro is yours for good now. ' : '')
      + `Cancelled on ${day(s.cancelled_at)}. <b>Nothing more will be charged.</b> `
      + (now_ ? (refund ? `Pro ended now, as you asked; we refund <b>${ils(refund)}</b> for the unused days to your card within 14 days.` : 'Pro ended now, as you asked.')
              : via === 'upgrade' ? '' : `Pro stays on until <b>${day(s.paid_through)}</b>, the end of the month you paid for.`),
    steps: now_ || via === 'upgrade' ? [] : [`Changed your mind? <a href="${MANAGE_URL}">Resume it in your account</a> before ${day(s.paid_through)}.`],
    lines: [`Cancelled: ${day(s.cancelled_at)}`,
            via === 'upgrade' ? '' : now_ ? (refund ? `Refund: ${ils(refund)} (within 14 days)` : '') : `Pro until: ${day(s.paid_through)}`],
  });
}

export { SUB_MIN_APP, RENEW_APP, MANAGE_URL, CANCEL_URL, running };
