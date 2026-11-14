/**
 * "This went wrong" — from inside Audioctor (2026-11-13).
 *
 * StreamDAW has had this since October and three reports are sitting unread in
 * it. Audioctor had no channel at all: someone who hit trouble had the address
 * in the footer and nothing else, and there was nothing for a dashboard to
 * show. A tab that can only ever say zero is not worth building; a tab with
 * somewhere for reports to arrive is.
 *
 * Mirrors worker/src/streamdaw.js's pair deliberately, down to the rate limit
 * and the status values, so the two read the same way in the dashboard and
 * neither surprises whoever maintains the other.
 *
 * The app side still has to post here. Until it does this stays empty, which
 * the dashboard says in words rather than showing an empty table and letting
 * it be read as "no problems".
 */

import { sendMail } from '../shared/mail.js';
import { ipTag } from '../shared/crypto.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const now = () => Math.floor(Date.now() / 1000);
const lc = (s) => String(s || '').trim().toLowerCase();
const validEmail = (s) => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(s || '').trim());

const BODY_MAX = 4000;
const PER_HOUR = 10;

/* A native app's WebView is not this origin, and neither is the site when the
   report comes from a page. Echoing the origin rather than '*' keeps it
   usable from a credentialed fetch if the app ever sends one. */
const cors = (origin) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  vary: 'origin',
});

/** Anyone can send one: a person who cannot use the app often cannot sign in either. */
export async function audioctorReport(req, env) {
  const h = cors(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

  let b = {};
  try { b = await req.json(); } catch { /* handled by the length check */ }

  const body = String(b.body || '').trim().slice(0, BODY_MAX);
  if (body.length < 4) return json({ error: 'Tell us what went wrong.' }, 400, h);

  const source = ['app', 'web', 'console'].includes(b.source) ? b.source : 'app';
  const email = validEmail(b.email) ? lc(b.email) : null;
  // Whatever the app knew: version, macOS, which model was loaded, what it was doing.
  let context = null;
  try { context = JSON.stringify(b.context || {}).slice(0, 4000); } catch { /* skip it */ }

  // A keyed tag of the address, never the address and never a plain hash of it.
  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await ipTag(env, ip, 'adreport').catch(() => null) : null;

  if (ipHash) {
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM audioctor_reports WHERE ip_hash = ? AND created_at > ?'
    ).bind(ipHash, now() - 3600).first().catch(() => null);
    if ((recent && recent.n ? recent.n : 0) >= PER_HOUR) {
      return json({ error: 'That is a lot of reports in an hour — email us instead.' }, 429, h);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO audioctor_reports (source, email, body, context, ip_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?)`
    ).bind(source, email, body, context, ipHash, now()).run();
  } catch (e) {
    /* The table is the record; if it cannot be written the person must not be
       told "thanks" as though it had been. */
    return json({ error: 'We could not file that. Please email hello@snowstar.company.' }, 500, h);
  }

  // Best effort: a report that is filed but not emailed is still a report.
  try {
    await sendMail(env, {
      to: env.ALERT_TO || 'oritoledano@gmail.com',
      subject: `Audioctor problem report (${source})`,
      text: `${body}\n\n--\nfrom: ${email || 'anonymous'}\nsource: ${source}\ncontext: ${context || '{}'}`,
      replyTo: email || undefined,
    });
  } catch { /* already filed */ }

  return json({ ok: true }, 200, h);
}

/** Owner only: read them, and mark one seen or closed. */
export async function audioctorReports(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  if (req.method === 'POST') {
    let b = {};
    try { b = await req.json(); } catch { /* id check below */ }
    const id = Number(b.id || 0);
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad_id' }, 400);
    const status = ['new', 'seen', 'closed'].includes(b.status) ? b.status : 'seen';
    await env.DB.prepare('UPDATE audioctor_reports SET status = ? WHERE id = ?').bind(status, id).run();
    return json({ ok: true, id, status });
  }

  // Unread first, newest first inside that: the order you would triage in.
  const rows = await env.DB.prepare(
    `SELECT id, source, email, body, context, status, created_at
       FROM audioctor_reports
      ORDER BY (status = 'new') DESC, created_at DESC
      LIMIT 200`
  ).all().catch(() => ({ results: [] }));

  return json({ reports: rows.results || [] });
}
