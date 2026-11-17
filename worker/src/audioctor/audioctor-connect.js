/* Audioctor: "Sign in" from inside the app (2026-11-17, Ori: a buyer had to copy a machine ID, find a purchase email
 * that never came, and paste a key; "do what the industry does").
 *
 * The device sign-in that Ableton, Splice and Native Instruments use: the app opens the site, the person signs in
 * there (password or Google, as everywhere on the site; the app never sees either), presses Connect, and the app gets
 * its key by itself. Without a plan the same page sells one, and the key comes the moment it is paid.
 *
 *   POST /audioctor/connect/start   {machine, app, name}   the app: {poll, url, short, expiresIn, every}
 *        `poll` is the app's secret, sent only on poll; `url` carries a different public id (c) for the page, so a
 *        page address seen in a history never fetches anyone's key. `short` is shown in both, to match.
 *   POST /audioctor/connect/info    {c}                    the page: the Mac, the short code, who is signed in, owned
 *   POST /audioctor/connect/approve {c}                    the page, signed in: this Mac is this account's
 *   POST /audioctor/connect/poll    {poll, machine}        the app: waiting | no_plan | issued {key} | limit | expired
 *
 * The key is made by requestKey (audioctor.js), as on the unlock page: the same Mac limit, the same email, the same
 * Renewal line for a plan. start and poll come from the app (no cookie, no Origin: CSRF-exempt, rate-limited);
 * info and approve come from the site's own page.
 *
 *   schema-audioctor-connect.sql
 */
import { currentUser } from '../shared/session.js';
import { randB64 } from '../shared/crypto.js';
import * as SD from './audioctor.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Math.floor(Date.now() / 1000);
const body = async (req) => { try { return await req.json(); } catch { return {}; } };
const urlsafe = (n) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const APP_VER = /^\d{1,3}(\.\d{1,4}){1,3}$/;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';       // no 0/O, 1/I: read aloud and matched by eye
const shortCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  const s = [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
};
const WAIT = 15 * 60;          // a sign-in left unfinished this long is gone
const BUY = 2 * 3600;          // signed in without a plan: this long to buy one, the app still waiting
const PAGE = `${SD.SITE}/apps/audioctor-connect.html`;

async function row(env, col, v) {
  return env.DB.prepare(`SELECT * FROM audioctor_connect WHERE ${col} = ?`).bind(v).first();
}

/** The app starts a sign-in. */
export async function connectStart(req, env) {
  const b = await body(req);
  const machine = SD.normMachine(b.machine);
  if (!machine) return json({ error: 'bad_machine' }, 400);
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const wait = await SD.throttle(env, `adconnect:${ip}`, 20, 3600);
  if (wait) return json({ error: 'slow_down', retryIn: wait }, 429);
  const app = APP_VER.test(String(b.app || '')) ? String(b.app) : null;
  const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || null;
  const poll = urlsafe(24), page = urlsafe(16), short = shortCode(), t = now();
  await env.DB.prepare(
    `INSERT INTO audioctor_connect (poll, page, short, machine_id, mac_name, app_version, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(poll, page, short, machine, name, app, t, t + WAIT).run();
  return json({ poll, url: `${PAGE}?c=${page}`, short, expiresIn: WAIT, every: 2 });
}

/** The page: what it is connecting, and to whom. */
export async function connectInfo(req, env) {
  const b = await body(req);
  if (!ID_RE.test(String(b.c || ''))) return json({ error: 'bad_code' }, 400);
  const r = await row(env, 'page', String(b.c));
  if (!r) return json({ error: 'not_found' }, 404);
  const user = await currentUser(req, env).catch(() => null);
  const ent = user ? await SD.activeEntitlement(env, user) : null;
  return json({
    short: r.short, mac: r.mac_name, app: r.app_version,
    expired: r.expires_at <= now() && !r.done_at, done: !!r.done_at,
    approved: !!r.user_id, mine: !!(user && r.user_id === user.id),
    signedIn: !!user, email: user ? user.email : null,
    plan: ent ? ent.plan : null,
  });
}

/** The page, signed in: connect this Mac to this account. */
export async function connectApprove(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user || !user.id) return json({ error: 'sign_in_required' }, 401);
  const b = await body(req);
  if (!ID_RE.test(String(b.c || ''))) return json({ error: 'bad_code' }, 400);
  const r = await row(env, 'page', String(b.c));
  if (!r) return json({ error: 'not_found' }, 404);
  if (r.user_id && r.user_id !== user.id) return json({ error: 'taken', reason: 'Another account connected this Mac a moment ago.' }, 409);
  if (r.expires_at <= now() && !r.user_id) return json({ error: 'expired', reason: 'This sign-in timed out. Press Sign in in Audioctor again.' }, 410);
  const ent = await SD.activeEntitlement(env, user);
  await env.DB.prepare(
    'UPDATE audioctor_connect SET user_id = ?, email = ?, approved_at = ?, expires_at = MAX(expires_at, ?) WHERE page = ?'
  ).bind(user.id, String(user.email || '').toLowerCase(), now(), now() + (ent ? WAIT : BUY), r.page).run();
  return json({ ok: true, plan: ent ? ent.plan : null, machine: r.machine_id });
}

/** The app asks how far it is. A key is made once the account has a plan, and handed over here. */
export async function connectPoll(req, env) {
  const b = await body(req);
  const machine = SD.normMachine(b.machine);
  if (!machine || !ID_RE.test(String(b.poll || ''))) return json({ error: 'bad_request' }, 400);
  const r = await row(env, 'poll', String(b.poll));
  if (!r || r.machine_id !== machine) return json({ status: 'expired' });
  if (!r.user_id) return json(r.expires_at <= now() ? { status: 'expired' } : { status: 'waiting', short: r.short });
  const user = { id: r.user_id, email: r.email };
  const ent = await SD.activeEntitlement(env, user);
  if (!ent) return json(r.expires_at <= now() ? { status: 'expired' } : { status: 'no_plan', email: r.email });
  const name = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(r.user_id).first().catch(() => null);
  const got = await SD.requestKey(env, { entId: ent.id, email: ent.email, machine, name: name && name.name, via: 'connect' });
  if (got.status === 'issued') {
    await env.DB.prepare('UPDATE audioctor_connect SET done_at = ? WHERE poll = ?').bind(now(), r.poll).run();
    return json({ status: 'issued', key: got.key, email: ent.email, plan: ent.plan });
  }
  if (got.status === 'limit') return json({ status: 'limit', reason: got.error, manage: SD.UNLOCK_URL });
  if (got.status === 'expired') return json({ status: 'no_plan', email: r.email });
  return json({ status: 'pending' });          // the key waits for the owner's hand (no signing secret): poll on
}
