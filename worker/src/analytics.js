/**
 * Visitor journey tracking, the stats API, and email alerts.
 *
 * Privacy stance: no raw IPs, no cookies, no cross-session identity. A visit is
 * a random id the browser holds for one tab session; we keep only a country code
 * and the referring host. That's enough to answer "who's looking and at what"
 * without building a profile of anyone.
 */

const ALERT_DAILY_CAP = 25;      // hard stop so a traffic spike can't spam the inbox
const ENGAGED_PLAYS = 2;         // a visit gets interesting at 2 plays…
const SESSION_IDLE_MS = 30 * 60 * 1000;

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const VALID_TYPES = new Set(['view', 'play', 'license', 'search', 'favorite', 'download']);

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
  const t = now();

  // Write the event and roll up the session; do it after responding so the
  // beacon never delays the page.
  ctx.waitUntil((async () => {
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO events (session_id, type, detail, page, country, referrer, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(sid, type, detail, page, country, referrer, t),
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
  } catch (e) {
    console.error('alert email failed', e && e.stack ? e.stack : String(e));
  }
}

/** Admin-only stats read. */
export async function handleStats(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const since = now() - days * 86400;

  const [totals, topTracks, daily, recent, countries, referrers, licenses] = await Promise.all([
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
      `SELECT session_id, first_ts, last_ts, country, referrer, views, plays, licenses
         FROM sessions_seen WHERE last_ts >= ? ORDER BY last_ts DESC LIMIT 40`).bind(since).all(),
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
  });
}

/** One visitor's journey, for the stats page detail view. */
export async function handleJourney(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const sid = new URL(req.url).searchParams.get('sid') || '';
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sid)) return json({ error: 'bad_session' }, 400);
  const rows = await env.DB.prepare(
    'SELECT type, detail, page, ts FROM events WHERE session_id = ? ORDER BY id ASC LIMIT 200'
  ).bind(sid).all();
  return json({ sid, events: rows.results || [] });
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

  try {
    await env.EMAIL.send({
      to: env.ALERT_TO,
      from: 'alerts@snowstar.company',
      subject: `Mutra daily: ${t.visits} visits, ${t.plays || 0} plays`,
      text,
    });
  } catch (e) {
    console.error('digest failed', e && e.stack ? e.stack : String(e));
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

  const obj = await env.MEDIA.get(row.audio_key);
  if (!obj) return json({ error: 'missing_file' }, 404);

  const ext = row.audio_key.split('.').pop().toLowerCase();
  // keep the filename safe for every OS while staying readable
  const safe = row.title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('content-disposition', `attachment; filename="${safe}.${ext}"`);
  headers.set('cache-control', 'private, no-store');
  return new Response(obj.body, { headers });
}
