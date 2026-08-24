/**
 * Visitor journey tracking, the stats API, and email alerts.
 *
 * Privacy stance: no raw IPs, no fingerprinting. A visit is a random id the
 * browser holds for one tab session; we keep a country code and the
 * referring host. WHEN a visitor is signed in, their event rows also carry
 * their real user_id — resolved here, server-side, from their session
 * cookie. Never from anything the client's beacon itself claims (a POST body
 * is trivially spoofable) — the same currentUser() every gated route trusts.
 */

import { currentUser } from './session.js';

const ALERT_DAILY_CAP = 25;      // hard stop so a traffic spike can't spam the inbox
const ENGAGED_PLAYS = 2;         // a visit gets interesting at 2 plays…
const SESSION_IDLE_MS = 30 * 60 * 1000;
const MAX_LISTEN_SECONDS = 7200; // 2h ceiling on a single reported duration

import { hasLiveLicence } from './licensing.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

// 'play' fires the moment a track is clicked (unchanged — every existing
// "most played" count still means exactly what it always meant); 'play_end'
// is new, fired once the listen actually stops, carrying how long it ran.
const VALID_TYPES = new Set(['view', 'play', 'play_end', 'license', 'search', 'favorite', 'download']);

/** Reduce a referrer to its host so we never store query strings. */
function refHost(ref) {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return h.slice(0, 80);
  } catch { return null; }
}

export async function handleTrack(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || '');
  if (!VALID_TYPES.has(type)) return json({ error: 'bad_type' }, 400);

  const sid = String(body.sid || '').slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sid)) return json({ error: 'bad_session' }, 400);

  const detail = body.detail == null ? null : String(body.detail).slice(0, 160);
  const page = String(body.page || '').split('?')[0].slice(0, 120) || null;
  const country = (req.cf && req.cf.country) || null;
  const referrer = refHost(body.referrer);
  const duration = type === 'play_end' && Number.isFinite(body.duration)
    ? Math.max(0, Math.min(MAX_LISTEN_SECONDS, Math.round(body.duration))) : null;
  const t = now();

  // Write the event and roll up the session; do it after responding so the
  // beacon never delays the page. The identity lookup lives in here too, off
  // the response's critical path — req.headers stays readable under
  // ctx.waitUntil the same way every other background write in this file
  // already relies on (the body stream is what's consumed, not headers).
  ctx.waitUntil((async () => {
    try {
      const user = await currentUser(req, env).catch(() => null);
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO events (session_id, type, detail, page, country, referrer, ts, duration, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(sid, type, detail, page, country, referrer, t, duration, user ? user.id : null),
        env.DB.prepare(
          `INSERT INTO sessions_seen (session_id, first_ts, last_ts, country, referrer, views, plays, licenses)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             last_ts  = excluded.last_ts,
             views    = views    + excluded.views,
             plays    = plays    + excluded.plays,
             licenses = licenses + excluded.licenses`
        ).bind(sid, t, t, country, referrer,
               type === 'view' ? 1 : 0, type === 'play' ? 1 : 0, type === 'license' ? 1 : 0),
      ]);
      if (type === 'play' || type === 'license') await maybeAlert(env, sid);
    } catch (e) {
      console.error('track failed', e && e.stack ? e.stack : String(e));
    }
  })());

  return json({ ok: true });
}

/** Email once per visit, when it becomes worth knowing about. */
async function maybeAlert(env, sid) {
  const s = await env.DB.prepare(
    'SELECT session_id, plays, licenses, country, referrer, notified, first_ts FROM sessions_seen WHERE session_id = ?'
  ).bind(sid).first();
  if (!s || s.notified) return;
  const engaged = s.licenses > 0 || s.plays >= ENGAGED_PLAYS;
  if (!engaged) return;

  // Global daily cap, tracked in meta so a busy day can't flood the inbox.
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('alerts:' + day).first();
  const sent = row ? parseInt(row.v, 10) || 0 : 0;
  if (sent >= ALERT_DAILY_CAP) return;

  // Mark first — if the email fails we'd rather miss one than send duplicates.
  await env.DB.prepare('UPDATE sessions_seen SET notified = 1 WHERE session_id = ?').bind(sid).run();

  const journey = await env.DB.prepare(
    'SELECT type, detail, page, ts FROM events WHERE session_id = ? ORDER BY id ASC LIMIT 40'
  ).bind(sid).all();

  const lines = (journey.results || []).map((e) => {
    const time = new Date(e.ts * 1000).toISOString().slice(11, 19);
    const what = { view: 'viewed', play: 'played', license: 'clicked License on',
                   search: 'searched', favorite: 'favorited' }[e.type] || e.type;
    return `  ${time}  ${what} ${e.detail || e.page || ''}`.trimEnd();
  });

  const subject = s.licenses > 0
    ? `Mutra: someone clicked License${s.country ? ' (' + s.country + ')' : ''}`
    : `Mutra: a visitor played ${s.plays} tracks${s.country ? ' (' + s.country + ')' : ''}`;

  const text =
    `${subject}\n\n` +
    `From: ${s.country || 'unknown'}${s.referrer ? ' · via ' + s.referrer : ' · direct'}\n` +
    `Plays: ${s.plays}   License clicks: ${s.licenses}\n\n` +
    `Journey:\n${lines.join('\n')}\n\n` +
    `Full stats: https://snowstar.company/stats.html\n`;

  // Muted still records the alert — you can read what you would have been sent,
  // which is the point of a switch you can turn back on.
  if (await alertsMuted(env, 'visitor')) {
    await logAlert(env, 'visitor', subject, text, 'suppressed', 'visitor alerts muted');
    return;
  }

  try {
    await env.EMAIL.send({
      to: env.ALERT_TO,
      from: `alerts@snowstar.company`,
      subject,
      text,
    });
    await env.DB.prepare(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?'
    ).bind('alerts:' + day, String(sent + 1), String(sent + 1)).run();
    await logAlert(env, 'visitor', subject, text, 'sent');
  } catch (e) {
    console.error('alert email failed', e && e.stack ? e.stack : String(e));
    await logAlert(env, 'visitor', subject, text, 'failed', String(e && e.message || e));
  }
}

/**
 * The alert log, and the switch that silences it.
 *
 * Alerts used to be fire-and-forget: sent, never recorded, so the only copy
 * was in an inbox and there was no way to see from the dashboard what had gone
 * out — or to stop it without a redeploy. Every alert is now written here
 * whatever happens to it, including the ones the kill switch suppressed, so
 * "why did I stop getting these" has an answer on the page.
 */
/* The kinds of alert, and what each is for. One switch for all of them was
   too blunt: the visitor alert is chatty and the one worth muting, while a
   licence request or a payment is the whole point of the site and should never
   be silenced by the same click. */
export const ALERT_KINDS = {
  visitor: { label: 'Someone is browsing',
             note: 'A visitor played several tracks or clicked License. The chatty one.' },
  request: { label: 'A licence was requested',
             note: 'Somebody went through the funnel and asked for a track.' },
  payment: { label: 'A payment landed',
             note: 'Money arrived, by card or by hand.' },
  contact: { label: 'A message came in',
             note: 'Someone used Get in touch. Claims and rights disputes always alert.' },
  digest:  { label: 'The morning digest',
             note: 'One summary at 07:00 UTC.' },
};

/** Per-kind now. The old global key is still honoured, so a mute set before
 *  this existed keeps working rather than silently un-muting everything. */
async function alertsMuted(env, kind) {
  const rows = await env.DB.prepare(
    "SELECT k, v FROM meta WHERE k = 'alerts:off' OR k LIKE 'alerts:off:%'"
  ).all().catch(() => ({ results: [] }));
  const m = Object.fromEntries((rows.results || []).map((r) => [r.k, r.v]));
  if (m['alerts:off'] === '1') return true;                       // legacy: all off
  if (kind && m['alerts:off:' + kind] === '1') return true;
  return false;
}

async function mutedMap(env) {
  const rows = await env.DB.prepare(
    "SELECT k, v FROM meta WHERE k = 'alerts:off' OR k LIKE 'alerts:off:%'"
  ).all().catch(() => ({ results: [] }));
  const m = Object.fromEntries((rows.results || []).map((r) => [r.k, r.v]));
  const all = m['alerts:off'] === '1';
  const out = {};
  for (const k of Object.keys(ALERT_KINDS)) out[k] = all || m['alerts:off:' + k] === '1';
  return { kinds: out, all };
}

/**
 * Send an alert of a given kind. The one place that decides whether it goes,
 * so a new alert type cannot forget the cap, the mute or the log.
 */
export async function alert(env, kind, subject, text, opts) {
  const day = new Date().toISOString().slice(0, 10);
  // `force` is for the ones with a legal or commercial clock — a Content ID
  // claim, a rights dispute. Muting "a message came in" should not silence a
  // legal notice, and making that a separate un-mutable KIND would just hide
  // the exception somewhere less obvious.
  if (!(opts && opts.force) && await alertsMuted(env, kind)) {
    await logAlert(env, kind, subject, text, 'suppressed', kind + ' alerts muted');
    return;
  }
  try {
    await env.EMAIL.send({ to: env.ALERT_TO, from: 'alerts@snowstar.company', subject, text });
    await logAlert(env, kind, subject, text, 'sent');
  } catch (e) {
    await logAlert(env, kind, subject, text, 'failed', String((e && e.message) || e));
  }
  void day;
}

async function logAlert(env, kind, subject, body, status, note = '') {
  try {
    await env.DB.prepare(
      'INSERT INTO alerts (kind, subject, body, ts, status, note) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(kind, String(subject).slice(0, 300), String(body).slice(0, 20000), now(), status, String(note).slice(0, 300)).run();
  } catch (e) {
    console.error('alert log failed', e && e.stack ? e.stack : String(e));
  }
}

/** Owner: the alert history, newest first, plus the current switch position. */
export async function listAlerts(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    'SELECT id, kind, subject, body, ts, status, note FROM alerts ORDER BY id DESC LIMIT 200'
  ).all();
  const m = await mutedMap(env);
  return json({ alerts: r.results || [], muted: m.all, kinds: m.kinds, labels: ALERT_KINDS });
}

/** Owner: flip the kill switch. Suppressed alerts are still logged. */
export async function setAlertsMuted(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const v = b.muted ? '1' : '0';
  const kind = String(b.kind || '').trim();

  if (kind && ALERT_KINDS[kind]) {
    // Turning one kind back on has to clear the legacy global mute too, or the
    // switch appears to do nothing — the global would keep overriding it.
    await env.DB.prepare(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?'
    ).bind('alerts:off:' + kind, v, v).run();
    if (v === '0') {
      const g = await env.DB.prepare("SELECT v FROM meta WHERE k = 'alerts:off'").first();
      if (g && g.v === '1') {
        // spread the old blanket mute across the kinds, then drop the blanket
        for (const k of Object.keys(ALERT_KINDS)) {
          if (k === kind) continue;
          await env.DB.prepare(
            'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?'
          ).bind('alerts:off:' + k, '1', '1').run();
        }
        await env.DB.prepare("UPDATE meta SET v = '0' WHERE k = 'alerts:off'").run();
      }
    }
  } else {
    // no kind = the old all-or-nothing switch
    await env.DB.prepare(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?'
    ).bind('alerts:off', v, v).run();
    if (v === '0') {
      for (const k of Object.keys(ALERT_KINDS)) {
        await env.DB.prepare("UPDATE meta SET v = '0' WHERE k = ?").bind('alerts:off:' + k).run();
      }
    }
  }
  const m = await mutedMap(env);
  return json({ ok: true, muted: m.all, kinds: m.kinds });
}

/** Admin-only stats read. */
export async function handleStats(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const since = now() - days * 86400;

  const [totals, topTracks, daily, recent, countries, referrers, licenses, members, engagement] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(DISTINCT session_id) AS visits,
              SUM(CASE WHEN type='view' THEN 1 ELSE 0 END)    AS views,
              SUM(CASE WHEN type='play' THEN 1 ELSE 0 END)    AS plays,
              SUM(CASE WHEN type='license' THEN 1 ELSE 0 END) AS licenses
         FROM events WHERE ts >= ?`).bind(since).first(),
    env.DB.prepare(
      `SELECT detail AS slug, COUNT(*) AS plays, COUNT(DISTINCT session_id) AS listeners
         FROM events WHERE type='play' AND ts >= ? AND detail IS NOT NULL
        GROUP BY detail ORDER BY plays DESC LIMIT 25`).bind(since).all(),
    env.DB.prepare(
      `SELECT date(ts,'unixepoch') AS day,
              COUNT(DISTINCT session_id) AS visits,
              SUM(CASE WHEN type='play' THEN 1 ELSE 0 END) AS plays
         FROM events WHERE ts >= ? GROUP BY day ORDER BY day DESC LIMIT 30`).bind(since).all(),
    env.DB.prepare(
      `SELECT s.session_id, s.first_ts, s.last_ts, s.country, s.referrer, s.views, s.plays, s.licenses,
              m.name AS member_name, m.email AS member_email
         FROM sessions_seen s
         LEFT JOIN (
           SELECT e.session_id, u.name, u.email,
                  ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.ts DESC) AS rn
           FROM events e JOIN users u ON u.id = e.user_id WHERE e.user_id IS NOT NULL
         ) m ON m.session_id = s.session_id AND m.rn = 1
        WHERE s.last_ts >= ? ORDER BY s.last_ts DESC LIMIT 40`).bind(since).all(),
    env.DB.prepare(
      `SELECT country, COUNT(DISTINCT session_id) AS visits FROM events
        WHERE ts >= ? AND country IS NOT NULL GROUP BY country ORDER BY visits DESC LIMIT 12`).bind(since).all(),
    env.DB.prepare(
      `SELECT COALESCE(referrer,'direct') AS src, COUNT(DISTINCT session_id) AS visits FROM events
        WHERE ts >= ? GROUP BY src ORDER BY visits DESC LIMIT 12`).bind(since).all(),
    env.DB.prepare(
      `SELECT detail AS slug, COUNT(*) AS clicks FROM events
        WHERE type='license' AND ts >= ? AND detail IS NOT NULL
        GROUP BY detail ORDER BY clicks DESC LIMIT 15`).bind(since).all(),
    // everyone who has signed up, newest first — this is your mailing list
    env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.newsletter, u.signup_source, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favs
         FROM users u ORDER BY u.created_at DESC LIMIT 200`).all(),
    // which position in a session a track usually gets tried in (1st, 2nd…)
    // against how long people actually stayed once they did — a track that's
    // tried early but abandoned fast is a weak hook; ordering signal for the catalog
    env.DB.prepare(
      `WITH first_plays AS (
         SELECT session_id, detail AS slug, MIN(id) AS first_id
           FROM events WHERE type='play' AND ts >= ? AND detail IS NOT NULL
          GROUP BY session_id, detail),
       positions AS (
         -- order by id (AUTOINCREMENT, so monotonic at insert order), not ts:
         -- two tracks first-played in the same wall-clock second would tie
         -- under ts with no deterministic winner, corrupting "tried first"
         SELECT slug, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY first_id) AS position
           FROM first_plays),
       pos_agg AS (
         SELECT slug, COUNT(*) AS sessions, AVG(position) AS avg_position
           FROM positions GROUP BY slug),
       dur_agg AS (
         SELECT detail AS slug, COUNT(*) AS listens, AVG(duration) AS avg_duration
           FROM events WHERE type='play_end' AND ts >= ? AND duration IS NOT NULL
          GROUP BY detail)
       SELECT p.slug, p.sessions, p.avg_position, d.listens, d.avg_duration
         FROM pos_agg p LEFT JOIN dur_agg d ON d.slug = p.slug
        ORDER BY p.sessions DESC LIMIT 25`).bind(since, since).all(),
  ]);

  return json({
    days,
    totals: totals || {},
    topTracks: topTracks.results || [],
    daily: daily.results || [],
    recent: recent.results || [],
    countries: countries.results || [],
    referrers: referrers.results || [],
    licenses: licenses.results || [],
    members: members.results || [],
    engagement: engagement.results || [],
  });
}

/** One visitor's journey, for the stats page detail view. */
export async function handleJourney(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const sid = new URL(req.url).searchParams.get('sid') || '';
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sid)) return json({ error: 'bad_session' }, 400);
  const rows = await env.DB.prepare(
    'SELECT type, detail, page, ts, duration, user_id FROM events WHERE session_id = ? ORDER BY id ASC LIMIT 200'
  ).bind(sid).all();
  const events = rows.results || [];
  // resolve who they were signed in as, once, rather than repeat it per row —
  // most-recent identified user, to agree with the Recent-visits "Who" column
  // (which resolves the same way, via ORDER BY ts DESC); a session can in
  // principle carry two different real logins (shared/kiosk browser tab), so
  // the two admin views need one consistent rule or they'll contradict each other
  const uid = events.map((e) => e.user_id).reverse().find(Boolean);
  const member = uid
    ? await env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(uid).first()
    : null;
  return json({ sid, member: member ? { name: member.name, email: member.email } : null,
                events: events.map(({ user_id, ...e }) => e) });
}

/** Daily digest, fired by the cron trigger. */
export async function sendDigest(env) {
  const since = now() - 86400;
  const t = await env.DB.prepare(
    `SELECT COUNT(DISTINCT session_id) AS visits,
            SUM(CASE WHEN type='play' THEN 1 ELSE 0 END)    AS plays,
            SUM(CASE WHEN type='license' THEN 1 ELSE 0 END) AS licenses
       FROM events WHERE ts >= ?`).bind(since).first();
  if (!t || !t.visits) return; // quiet day: say nothing

  const top = await env.DB.prepare(
    `SELECT detail AS slug, COUNT(*) AS plays FROM events
      WHERE type='play' AND ts >= ? AND detail IS NOT NULL
      GROUP BY detail ORDER BY plays DESC LIMIT 10`).bind(since).all();

  const text =
    `Mutra — last 24 hours\n\n` +
    `Visits: ${t.visits}\nTrack plays: ${t.plays || 0}\nLicense clicks: ${t.licenses || 0}\n\n` +
    `Most played:\n` +
    (top.results || []).map((r, i) => `  ${i + 1}. ${r.slug} — ${r.plays}`).join('\n') +
    `\n\nFull stats: https://snowstar.company/stats.html\n`;

  const subject = `Mutra daily: ${t.visits} visits, ${t.plays || 0} plays`;
  if (await alertsMuted(env)) {
    await logAlert(env, 'digest', subject, text, 'suppressed', 'alerts muted');
    return;
  }

  try {
    await env.EMAIL.send({
      to: env.ALERT_TO,
      from: 'alerts@snowstar.company',
      subject,
      text,
    });
    await logAlert(env, 'digest', subject, text, 'sent');
  } catch (e) {
    console.error('digest failed', e && e.stack ? e.stack : String(e));
    await logAlert(env, 'digest', subject, text, 'failed', String(e && e.message || e));
  }
}

/**
 * Gated download. Streams the file from R2 with a human-readable filename.
 *
 * Note this is lead-capture friction, not DRM: previews stream from a public
 * CDN URL by design, so a determined visitor can always fetch that. What this
 * does is make the *convenient* path require an account, and give members a
 * properly named, correctly tagged file.
 */
export async function handleDownload(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'invalid_slug' }, 400);

  const row = await env.DB.prepare('SELECT title, audio_key FROM tracks WHERE slug = ?').bind(slug).first();
  if (!row) return json({ error: 'not_found' }, 404);

  // THE ENTITLEMENT CHECK. A live licence gets the clean master out of the
  // private bucket; everyone else gets the watermarked preview from the public
  // one. Both are real downloads — the preview is a usable rough-cut file, not
  // a punishment — but only one of them is the product.
  const lic = await hasLiveLicence(env, user, slug);
  const obj = lic
    ? (await env.MASTERS.get(row.audio_key)) || (await env.MEDIA.get(row.audio_key))
    : (await env.MEDIA.get(row.audio_key));
  if (!obj) return json({ error: 'missing_file' }, 404);

  // server-confirmed log (not a client beacon) — feeds the member's own
  // "Downloads" list in the Account panel
  await env.DB.prepare(
    'INSERT INTO downloads (user_id, slug, ts, licence_id, file_etag, bytes) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user.id, slug, now(), lic ? lic.id : null, obj.etag || null, obj.size || null)
   .run().catch(async () => {
      // pre-migration schema — keep the download working rather than 500
      await env.DB.prepare('INSERT INTO downloads (user_id, slug, ts) VALUES (?, ?, ?)')
        .bind(user.id, slug, now()).run().catch(() => {});
   });

  const ext = row.audio_key.split('.').pop().toLowerCase();
  // keep the filename safe for every OS while staying readable
  const safe = row.title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const suffix = lic ? '' : ' (preview)';
  headers.set('content-disposition', `attachment; filename="${safe}${suffix}.${ext}"`);
  headers.set('x-mutra-licensed', lic ? lic.ref : 'preview');
  headers.set('cache-control', 'private, no-store');
  return new Response(obj.body, { headers });
}
