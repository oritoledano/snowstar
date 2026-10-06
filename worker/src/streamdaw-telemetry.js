/**
 * StreamDAW — stream health and usage, for the dashboard's Health monitor.
 *
 * Every StreamDAW Mac runs its own relay (zero server cost: the audio never touches
 * Snowstar). What does reach Snowstar is small: every 30 s while a stream is on air, the
 * relay POSTs one heartbeat with each live stream's health, and once more when it ends;
 * at the end of each sitting it also POSTs a usage record. Both are anonymous by design
 * (hashed machine and stream ids, counts, durations, line measurements) and only sent
 * while the host's Settings › Usage switch is on.
 *
 * Ingest is PUBLIC (a key inside an app is no secret), so it is shaped instead: a size cap,
 * a stream count cap, hex-only ids, every number clamped, one row per stream at most every
 * 10 s, one sample per 10 s bucket. The read side is admin only.
 *
 *   POST /streamdaw/telemetry          relay → heartbeat batch     (public)
 *   POST /streamdaw/usage              relay → one sitting's usage  (public)
 *   GET  /streamdaw/health             dashboard: live + recent + totals   (admin)
 *   GET  /streamdaw/health/stream?id=  dashboard: one stream, its people and samples (admin)
 *   streamdawTelemetryCleanup(env)     the daily cron: samples older than 14 days go
 *
 * The format is the relay's (server/telemetry.js in the StreamDAW repo), versioned by `v`.
 * Schema: schema-streamdaw-telemetry.sql.
 */

const MAX_BODY = 64 * 1024;
const MAX_STREAMS = 20;
const LIVE_WINDOW_MS = 90 * 1000;        // three missed heartbeats and a stream is "no signal"
const KEEP_SAMPLES_MS = 14 * 24 * 3600 * 1000;
const HEX = /^[0-9a-f]{8,32}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const num = (v, lo, hi, digits = 0) => {
  const x = Number(v);
  if (v === null || v === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(Math.min(hi, Math.max(lo, x)) * f) / f;
};
const str = (v, max, re) => {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, max);
  return re && !re.test(s) ? null : s;
};
const ver = (v) => str(v, 24, /^[0-9A-Za-z.+-]+$/);
const oneOf = (v, set) => (set.includes(v) ? v : null);

async function readJSON(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function cleanPerson(p) {
  if (!p || typeof p !== 'object') return null;
  const a = p.audio && typeof p.audio === 'object' ? p.audio : null;
  const v = p.video && typeof p.video === 'object' ? p.video : null;
  return {
    id: str(p.id, 16, HEX),
    kind: oneOf(p.kind, ['ios', 'android', 'mac', 'windows', 'linux', 'other']) || 'other',
    sec: num(p.sec, 0, 7 * 86400),
    playing: !!p.playing,
    level: num(p.level, 0, 2),
    audio: a ? { marginMs: num(a.marginMs, 0, 10000), underruns: num(a.underruns, 0, 1e7), rttMs: num(a.rttMs, 0, 10000),
                 jitterMs: num(a.jitterMs, 0, 5000, 1), lossPct: num(a.lossPct, 0, 100, 1), kbps: num(a.kbps, 0, 100000) } : null,
    video: v ? { fps: num(v.fps, 0, 240), dropped: num(v.dropped, 0, 1e9), lostPct: num(v.lostPct, 0, 100, 1),
                 jitterMs: num(v.jitterMs, 0, 10000), kbps: num(v.kbps, 0, 100000) } : null,
  };
}

function cleanStream(s, relay) {
  if (!s || typeof s !== 'object') return null;
  const id = str(s.id, 32, HEX);
  if (!id) return null;
  const a = s.audio && typeof s.audio === 'object' ? s.audio : {};
  const v = s.video && typeof s.video === 'object' ? s.video : {};
  const people = Array.isArray(s.people) ? s.people.slice(0, 50).map(cleanPerson).filter(Boolean) : [];
  return {
    id, machine: str(s.machine, 32, HEX), app: ver(s.app), relay: ver(relay),
    tier: oneOf(s.tier, ['free', 'trial', 'pro']),
    state: oneOf(s.state, ['live', 'grace', 'idle', 'ended']) || 'idle',
    on_air: s.onAir ? 1 : 0,
    ended: str(s.ended, 80),
    on_air_sec: num(s.onAirSec, 0, 30 * 86400), connected_sec: num(s.connectedSec, 0, 30 * 86400),
    listeners: num(s.listeners, 0, 10000), peak: num(s.peak, 0, 10000),
    mode: oneOf(s.mode, ['inEar', 'live']), source: oneOf(s.source, ['stems', 'plugin', 'device']), tracks: num(s.tracks, 0, 256),
    a_jitter_ms: num(a.jitterMs, 0, 5000, 1), a_jitter_max_ms: num(a.jitterMaxMs, 0, 5000, 1), a_loss_pct: num(a.lossPct, 0, 100, 1),
    a_underruns: num(a.underruns, 0, 1e9), a_kbps: num(a.kbps, 0, 1e7), a_margin_min_ms: num(a.marginMinMs, 0, 10000),
    v_fps: num(v.fps, 0, 240, 1), v_dropped: num(v.dropped, 0, 1e12), v_lost_pct: num(v.lostPct, 0, 100, 1), v_kbps: num(v.kbps, 0, 1e7),
    people: JSON.stringify(people),
  };
}

const STREAM_COLS = ['id', 'machine', 'app', 'relay', 'tier', 'state', 'on_air', 'ended', 'first_at', 'last_at', 'on_air_sec',
  'connected_sec', 'listeners', 'peak', 'mode', 'source', 'tracks', 'a_jitter_ms', 'a_jitter_max_ms', 'a_loss_pct', 'a_underruns',
  'a_kbps', 'a_margin_min_ms', 'v_fps', 'v_dropped', 'v_lost_pct', 'v_kbps', 'people'];

/** POST /streamdaw/telemetry — a relay's heartbeat batch. Public. */
export async function streamdawTelemetry(req, env) {
  const body = await readJSON(req);
  if (!body || body.v !== 1 || body.type !== 'heartbeat' || !Array.isArray(body.streams)) return json({ error: 'bad heartbeat' }, 400);
  const now = Date.now();
  const streams = body.streams.slice(0, MAX_STREAMS).map((s) => cleanStream(s, body.relay)).filter(Boolean);
  if (!streams.length) return json({ ok: true, kept: 0 });
  const set = STREAM_COLS.filter((c) => c !== 'id' && c !== 'first_at').map((c) => `${c} = excluded.${c}`).join(', ');
  const stmts = [];
  for (const s of streams) {
    const row = { ...s, first_at: now, last_at: now };
    // A new sitting starts the clock again: after an end, or a long silence.
    stmts.push(env.DB.prepare(
      `INSERT INTO sd_streams (${STREAM_COLS.join(', ')}) VALUES (${STREAM_COLS.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${set},
         first_at = CASE WHEN sd_streams.state = 'ended' OR excluded.last_at - sd_streams.last_at > 600000 THEN excluded.first_at ELSE sd_streams.first_at END
       WHERE excluded.last_at - sd_streams.last_at >= 10000 OR excluded.state = 'ended' OR sd_streams.state = 'ended'`
    ).bind(...STREAM_COLS.map((c) => row[c] ?? null)));
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO sd_samples (stream_id, at, on_air, listeners, a_jitter_ms, a_loss_pct, a_underruns, a_kbps, v_fps, v_dropped, v_kbps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, Math.floor(now / 10000) * 10000, s.on_air, s.listeners, s.a_jitter_ms, s.a_loss_pct, s.a_underruns, s.a_kbps, s.v_fps, s.v_dropped, s.v_kbps));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, kept: streams.length });
}

/** POST /streamdaw/usage — one sitting's usage record, when it ends. Public. */
export async function streamdawUsage(req, env) {
  const r = await readJSON(req);
  if (!r || r.v !== 1) return json({ error: 'bad usage record' }, 400);
  const clean = {
    v: 1, at: str(r.at, 40), app: ver(r.app), machine: str(r.machine, 32, HEX), tier: oneOf(r.tier, ['free', 'trial', 'pro']),
    trialDaysLeft: num(r.trialDaysLeft, 0, 365), minutesOnAir: num(r.minutesOnAir, 0, 1e6, 1), minutesConnected: num(r.minutesConnected, 0, 1e6, 1),
    secondsConnected: num(r.secondsConnected, 0, 1e8), listenerMinutes: num(r.listenerMinutes, 0, 1e7, 1), peakListeners: num(r.peakListeners, 0, 10000),
    devices: num(r.devices, 0, 10000), joins: num(r.joins, 0, 1e6), freeLimitHit: !!r.freeLimitHit, ended: str(r.ended, 80),
    kinds: r.kinds && typeof r.kinds === 'object' ? Object.fromEntries(Object.entries(r.kinds).slice(0, 8).map(([k, n]) => [String(k).slice(0, 12), num(n, 0, 1e6)])) : {},
    features: r.features && typeof r.features === 'object' ? Object.fromEntries(Object.entries(r.features).slice(0, 24).map(([k, x]) => [String(k).slice(0, 20), typeof x === 'number' ? num(x, 0, 1e6) : typeof x === 'string' ? x.slice(0, 20) : !!x])) : {},
  };
  await env.DB.prepare(
    `INSERT INTO sd_usage (at, machine, app, tier, minutes_on_air, minutes_connected, peak, devices, free_limit_hit, record)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(Date.now(), clean.machine, clean.app, clean.tier, clean.minutesOnAir, clean.minutesConnected, clean.peakListeners, clean.devices,
         clean.freeLimitHit ? 1 : 0, JSON.stringify(clean)).run();
  return json({ ok: true });
}

function status(row, now) {
  if (row.state === 'ended') return 'off';
  if (now - row.last_at > LIVE_WINDOW_MS) return 'no-signal';
  if (row.state === 'grace') return 'paused';
  return row.on_air ? 'on' : 'off';
}
const shape = (row, now) => ({ ...row, people: undefined, status: status(row, now), ageSec: Math.round((now - row.last_at) / 1000) });

/** GET /streamdaw/health — every stream heard from in the last 24 h, live first. Admin. */
export async function streamdawHealth(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const now = Date.now(), day = now - 24 * 3600 * 1000;
  const rows = (await env.DB.prepare(
    `SELECT * FROM sd_streams WHERE last_at > ? ORDER BY on_air DESC, last_at DESC LIMIT 200`
  ).bind(day).all()).results || [];
  const streams = rows.map((r) => shape(r, now));
  const live = streams.filter((s) => s.status === 'on' || s.status === 'paused');
  const usage = await env.DB.prepare(
    `SELECT COUNT(*) AS sittings, COALESCE(SUM(minutes_connected), 0) AS minutes, COUNT(DISTINCT machine) AS machines,
            COALESCE(SUM(free_limit_hit), 0) AS free_limit_hits FROM sd_usage WHERE at > ?`
  ).bind(day).first();
  return json({
    now,
    totals: {
      liveStreams: live.length,
      peopleNow: live.reduce((t, s) => t + (s.listeners || 0), 0),
      streams24h: streams.length,
      sittings24h: usage ? usage.sittings : 0,
      minutesConnected24h: usage ? Math.round(usage.minutes) : 0,
      machines24h: usage ? usage.machines : 0,
      freeLimitHits24h: usage ? usage.free_limit_hits : 0,
    },
    streams,
  });
}

/** GET /streamdaw/health/stream?id= — one stream: its people now and its last 6 h. Admin. */
export async function streamdawHealthStream(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const id = str(url.searchParams.get('id') || '', 32, HEX);
  if (!id) return json({ error: 'bad id' }, 400);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT * FROM sd_streams WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  const hours = Math.min(48, Math.max(1, Number(url.searchParams.get('hours')) || 6));
  const samples = (await env.DB.prepare(
    `SELECT at, on_air, listeners, a_jitter_ms, a_loss_pct, a_underruns, a_kbps, v_fps, v_dropped, v_kbps
       FROM sd_samples WHERE stream_id = ? AND at > ? ORDER BY at`
  ).bind(id, now - hours * 3600 * 1000).all()).results || [];
  let people = [];
  try { people = JSON.parse(row.people || '[]'); } catch {}
  return json({ now, stream: shape(row, now), people, samples });
}

/** The daily cron: graphs keep 14 days. */
export async function streamdawTelemetryCleanup(env) {
  await env.DB.prepare('DELETE FROM sd_samples WHERE at < ?').bind(Date.now() - KEEP_SAMPLES_MS).run();
}
