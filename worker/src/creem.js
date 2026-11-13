/**
 * Creem (Armitage Labs OÜ, Estonia), the merchant of record for StreamDAW and Audioctor since 2026-11-11. The
 * declined the account that day, so Creem takes the payments, files the VAT and sales tax, issues the invoices and
 * renews the subscriptions. The Worker still makes every key. This file is what both apps share: the API, the store's
 * settings in D1, the one signed webhook (POST /api/creem/webhook) and which app an event belongs to.
 *
 * Secrets and vars:
 *   CREEM_API_KEY   (secret) the store's test-mode key (creem_test_…), used while CREEM_ENV is not 'live'.
 *   CREEM_LIVE_API_KEY (secret) the live key, used once CREEM_ENV is 'live': kept apart so going live is one var.
 *   CREEM_ENV       (var) 'live' takes real money at api.creem.io; anything else is test mode at test-api.creem.io.
 *   POST /api/creem/setup {env:'live'|'test'} (the owner) makes the products and the webhook of either environment
 *   ahead of time, so the live store is ready before CREEM_ENV changes.
 *   CREEM_WEBHOOK_SECRET (secret, optional) a webhook made by hand in Creem's dashboard; the one this Worker makes
 *                   itself keeps its secret in D1, and either signs.
 *
 * Everything Creem hands out (product ids, the webhook and its secret, discount codes) lives in D1 (creem_conf), per
 * environment, and is made the first time it is needed: no setup button, nothing to paste but the API key.
 *
 * The webhook: creem-signature is HMAC-SHA256 of the raw body with the webhook secret, in hex. Each event is handled
 * once (creem_events); one that fails is forgotten again, so Creem's next try handles it from the start (its retries:
 * 30 s, 5 min, 30 min, 6 h). An event goes to the app whose product it names, or whose name is in its metadata.
 */

import { sendMail } from './mail.js';
import { safeEqual } from './crypto.js';

export const SITE = 'https://snowstar.company';
export const WEBHOOK_URL = `${SITE}/api/creem/webhook`;
export const EVENTS = ['checkout.completed', 'subscription.active', 'subscription.paid', 'subscription.update',
  'subscription.canceled', 'subscription.scheduled_cancel', 'subscription.past_due', 'subscription.unpaid',
  'subscription.expired', 'subscription.paused', 'subscription.trialing', 'refund.created', 'dispute.created'];

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const owner = (env) => env.ALERT_TO || 'oritoledano@gmail.com';

export const live = (env) => String(env.CREEM_ENV || '') === 'live';
/** The environment's name on every row this file writes: 'creem-live' or 'creem-test'. */
export const tag = (env) => (live(env) ? 'creem-live' : 'creem-test');
const API = (env) => (live(env) ? 'https://api.creem.io' : 'https://test-api.creem.io');
const keyOf = (env) => String((live(env) ? env.CREEM_LIVE_API_KEY : env.CREEM_API_KEY) || '');
export const hasKey = (env) => !!keyOf(env);
/** ISO date or milliseconds → seconds. */
export const secs = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e11 ? Math.floor(v / 1000) : Math.floor(v);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
/** An id from a field that is either the object or its id. */
export const idOf = (v) => (v && typeof v === 'object' ? v.id || null : v || null);

export async function api(env, method, path, body) {
  const res = await fetch(API(env) + path, {
    method,
    headers: { 'x-api-key': keyOf(env), 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let d = null;
  try { d = JSON.parse(text); } catch { /* an HTML error page */ }
  if (!res.ok) {
    const why = d ? [].concat(d.message || d.error || '').join('; ') : text.slice(0, 200);
    const e = new Error(`Creem ${method} ${path.split('?')[0]}: ${res.status} ${String(why).slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  return d;
}

// ── the store's settings (D1) ───────────────────────────────────────────────
export async function conf(env) {
  const rows = ((await env.DB.prepare('SELECT k, v FROM creem_conf WHERE env = ?').bind(tag(env)).all()
    .catch(() => ({ results: [] }))).results) || [];
  return Object.fromEntries(rows.map((r) => [r.k, r.v]));
}
export const putConf = (env, k, v) => env.DB.prepare(
  `INSERT INTO creem_conf (env, k, v, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(tag(env), k, String(v), now()).run();

/** One setup at a time per name: two first visitors must not make two products. Taken for 60 seconds at most. */
export async function withLock(env, name, fn) {
  const k = `lock:${name}`, t = now();
  const got = await env.DB.prepare(
    `INSERT INTO creem_conf (env, k, v, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at WHERE CAST(creem_conf.v AS INTEGER) < ?`
  ).bind(tag(env), k, String(t), t, t - 60).run();
  if (!(got.meta && got.meta.changes === 1)) return { busy: true };
  try { return await fn(); }
  finally { await env.DB.prepare('UPDATE creem_conf SET v = ? WHERE env = ? AND k = ?').bind('0', tag(env), k).run().catch(() => {}); }
}

/** The store's webhook, with its secret: made here, or found when it was made by hand in the dashboard. Again is
 *  harmless. Returns the secret. */
export async function ensureWebhook(env) {
  const c = await conf(env);
  if (c.webhook_secret) return c.webhook_secret;
  const list = await api(env, 'GET', '/v1/webhooks?page_size=100').catch(() => null);
  let hook = ((list && (list.items || list.data)) || []).find((w) => w && w.url === WEBHOOK_URL) || null;
  if (!hook) hook = await api(env, 'POST', '/v1/webhooks', { url: WEBHOOK_URL, name: 'snowstar.company Worker', events: EVENTS });
  else if (EVENTS.some((e) => !(hook.events || []).includes(e)))
    hook = await api(env, 'PATCH', `/v1/webhooks/${encodeURIComponent(hook.id)}`, { events: EVENTS }).catch(() => hook);
  const secret = hook.secret || (await api(env, 'GET', `/v1/webhooks/${encodeURIComponent(hook.id)}/secret`)).secret;
  if (!secret) throw new Error('Creem gave no webhook secret');
  await putConf(env, 'webhook_id', hook.id);
  await putConf(env, 'webhook_secret', secret);
  return secret;
}

// ── the webhook ─────────────────────────────────────────────────────────────
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function verifySignature(secrets, header, raw) {
  const sig = String(header || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  for (const s of secrets) if (s && safeEqual(sig, await hmacHex(s, raw))) return true;
  return false;
}

/** The app an event belongs to: its metadata says so on our checkouts; otherwise the product it names. */
export function productOf(o) {
  if (!o || typeof o !== 'object') return null;
  return idOf(o.product) || (o.order && idOf(o.order.product)) || (o.subscription && idOf(o.subscription.product))
    || (o.checkout && idOf(o.checkout.product)) || ((o.items || [])[0] || {}).product_id || null;
}
export function metadataOf(o) {
  if (!o || typeof o !== 'object') return {};
  return o.metadata || (o.subscription && o.subscription.metadata) || (o.checkout && o.checkout.metadata) || {};
}

const APPS = {
  audioctor: () => import('./audioctor-creem.js'),
  streamdaw: () => import('./creem-streamdaw.js'),
};

/** POST /creem/setup {env} — the owner: both apps' products and the webhook in that environment, made now (again is
 *  harmless). Lets the live store be ready while the site still sells in test mode. Answers ids, never a secret. */
export async function creemSetup(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const e = { ...env, CREEM_ENV: b.env === 'live' ? 'live' : 'test' };
  if (!hasKey(e)) return json({ error: 'no_api_key', env: tag(e), reason: live(e) ? 'Set CREEM_LIVE_API_KEY first.' : 'Set CREEM_API_KEY first.' }, 400);
  const out = {};
  for (const [a, load] of Object.entries(APPS)) {
    const m = await load();
    try { out[a] = await m.setup(e); } catch (x) { out[a] = { error: String(x && x.message || x).slice(0, 200) }; }
  }
  const c = await conf(e);
  return json({ ok: true, env: tag(e), ...out, products: Object.keys(c).filter((k) => k.startsWith('product:')).length, webhook: !!c.webhook_secret });
}

/** POST /creem/webhook — Creem's server, signed: no cookie, no Origin. */
export async function creemWebhook(req, env) {
  if (!hasKey(env)) return json({ error: 'not_configured' }, 503);
  const raw = await req.text();
  const c = await conf(env);
  if (!(await verifySignature([c.webhook_secret, env.CREEM_WEBHOOK_SECRET], req.headers.get('creem-signature'), raw)))
    return json({ error: 'bad_signature' }, 401);
  let ev;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  const id = String(ev.id || ''), type = String(ev.eventType || '');
  if (!/^evt_[A-Za-z0-9]+$/.test(id) || !type) return json({ error: 'bad_event' }, 400);
  const o = ev.object || {};
  const md = metadataOf(o), pid = productOf(o);
  let app = APPS[md.app] ? md.app : null;
  if (!app && pid) app = Object.keys(APPS).find((a) => Object.entries(c).some(([k, v]) => k.startsWith(`product:${a}:`) && v === pid)) || null;
  // An event that names neither (a refund can carry only ids): the app whose own records know its checkout or subscription.
  if (!app) for (const a of Object.keys(APPS)) { const m = await APPS[a](); if (m.claims && await m.claims(env, o)) { app = a; break; } }
  // Once per event: Creem sends again until it hears 2xx, and may send the same event twice.
  const ins = await env.DB.prepare(
    'INSERT INTO creem_events (event_id, type, app, received_at) VALUES (?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING'
  ).bind(id, type, app, now()).run();
  if (!(ins.meta && ins.meta.changes === 1)) return json({ ok: true, duplicate: true });
  let outcome;
  try {
    if (type === 'dispute.created') {
      await sendMail(env, { to: owner(env), subject: `Creem: a dispute (chargeback) was opened${app ? `, ${app}` : ''}`,
        text: `Creem event ${id}: a buyer disputed a payment (${JSON.stringify({ product: pid, metadata: md }).slice(0, 300)}).\n`
            + 'Answer it in Creem\'s dashboard with what they bought and when the key was sent.' }).catch(() => {});
      outcome = 'dispute mailed';
    } else if (!app) outcome = 'not ours';
    else outcome = await (await APPS[app]()).onCreemEvent(env, type, o, ev);
  } catch (e) {
    // Not handled: forget the event, so Creem's next try is handled from the start (each grant is idempotent).
    await env.DB.prepare('DELETE FROM creem_events WHERE event_id = ?').bind(id).run().catch(() => {});
    await sendMail(env, { to: owner(env), subject: `Creem: a webhook failed (${app || '?'}), Creem will retry`,
      text: `${type} ${id}: ${String(e && e.message || e).slice(0, 300)}\nCreem retries on its own. If it keeps failing, Reconcile the order in the dashboard.` }).catch(() => {});
    return json({ error: 'failed' }, 500);
  }
  await env.DB.prepare('UPDATE creem_events SET outcome = ? WHERE event_id = ?').bind(String(outcome).slice(0, 200), id).run().catch(() => {});
  return json({ ok: true, outcome });
}

/** A Creem discount behind one of our codes, made the first time it is needed, for the given products and the first
 *  payment only. Our own checks (active, expiry, uses, minimum) run before it is ever used. */
export async function discountCode(env, key, { code, percent, cents, expiresAt, products, name }) {
  const c = await conf(env);
  if (c[key]) return c[key];
  const body = { name, type: percent != null ? 'percentage' : 'fixed', duration: 'once', applies_to_products: products,
    ...(percent != null ? { percentage: percent } : { amount: cents, currency: 'USD' }),
    ...(expiresAt ? { expiry_date: new Date(expiresAt * 1000).toISOString() } : {}) };
  let d;
  try { d = await api(env, 'POST', '/v1/discounts', { ...body, code }); }
  catch (e) {
    if (e.status >= 500) throw e;
    // The code is taken in the store (the other app's, or one made by hand): a code of our own for this app.
    d = await api(env, 'POST', '/v1/discounts', { ...body, code: `${key.split(':')[1].slice(0, 2).toUpperCase()}${code}`.slice(0, 40) });
  }
  const made = d && d.code;
  if (!made) throw new Error('Creem gave no discount code');
  await putConf(env, key, made);
  return made;
}
