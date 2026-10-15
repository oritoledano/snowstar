/**
 * StreamDAW — remote updates (2026-10-15).
 *
 * Every StreamDAW app (the first package carrying this, and later) asks here at launch and once a
 * day. Two kinds of update come back:
 *   1. A newer signed bundle of the relay + pages (most fixes). The app downloads it from here,
 *      checks its Ed25519 signature (the public key ships inside the app; the private one never
 *      leaves Ori's Mac) and every file, and switches to it when nobody is in a session. A bundle
 *      that crashes at start twice is rolled back on that Mac by itself, and said here (`bad`).
 *   2. The word on the app itself: the latest .pkg (app_releases) and the policy Ori set for the
 *      caller's version: 'ok', 'nag' (a stronger banner), 'dangerous' (GO LIVE is refused with a
 *      download link). Offline, or this endpoint failing, never blocks anything on the Mac.
 *
 *   GET  /streamdaw/update?app=<0.5.8>&bundle=<YYYY.MMDD.HHMM|0>&install=<32 hex>[&bad=<v,…>]   (public)
 *   GET  /streamdaw/bundles/<YYYY.MMDD.HHMM>.tgz                                                 (public: signed, no secret in it)
 *   GET  /streamdaw/updates/admin      the dashboard: bundles, versions in use, policies           (admin)
 *   POST /streamdaw/updates/admin      {op:'policy', version, policy, message, notes} | {op:'bundle', version, status}   (admin)
 *   streamdawUpdatesCleanup(env)       the daily cron: installs unseen 180 days, crash reports after 90 days
 *
 * Privacy: the app sends versions and a random install id made for this alone, never its machine id
 * or its live link's id. No IP address is kept (the request log keeps the route only).
 * Schema: schema-streamdaw-updates.sql. Publishing a bundle: scripts/publish-bundle.sh (StreamDAW repo).
 */

const SITE = 'https://snowstar.company';
const ASSET = 'streamdaw-macos';                     // app_releases.asset, as streamdaw.js serves it
const DOWNLOAD_URL = `${SITE}/api/streamdaw/download/free`;   // account-gated: signed out, the sale page asks to sign up first
const STAMP = /^20\d\d\.(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\.([01]\d|2[0-3])[0-5]\d$/;
const APP_VER = /^\d{1,3}(\.\d{1,4}){1,3}(-[0-9A-Za-z.]{1,20})?$/;
const INSTALL = /^[0-9a-f]{32}$/;
const POLICIES = ['ok', 'nag', 'dangerous'];
const KEEP_INSTALLS_SEC = 180 * 86400;
const KEEP_BAD_SEC = 90 * 86400;

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

// "0.5.0-dev" < "0.5.0" < "0.5.1"; stamps compare the same way (the app's own order, bundles.js).
export function compareVersions(a, b) {
  const core = (v) => String(v || '').split('-')[0].split('.').map((x) => parseInt(x, 10) || 0);
  const ca = core(a), cb = core(b);
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    const x = ca[i] || 0, y = cb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  const pa = String(a || '').includes('-') ? String(a).slice(String(a).indexOf('-') + 1) : '';
  const pb = String(b || '').includes('-') ? String(b).slice(String(b).indexOf('-') + 1) : '';
  if (pa === pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pa < pb ? -1 : 1;
}

async function soft(env, sql, ...binds) {
  try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; } catch { return []; }
}
async function softFirst(env, sql, ...binds) {
  try { return await env.DB.prepare(sql).bind(...binds).first(); } catch { return null; }
}

/** GET /streamdaw/update — what this app should know. Public; answers even before the tables exist. */
export async function streamdawUpdateCheck(req, env, url) {
  const q = url.searchParams;
  const app = q.get('app') || '', bundle = q.get('bundle') || '0', install = q.get('install') || '';
  if (!APP_VER.test(app) || !(bundle === '0' || STAMP.test(bundle)) || !INSTALL.test(install)) return json({ error: 'bad_request' }, 400);
  const t = now();

  // Who is out there, by version: one row per install, written at most every 10 minutes.
  const seen = await softFirst(env, 'SELECT last_seen FROM streamdaw_update_installs WHERE install_id = ?', install);
  if (!seen || t - (seen.last_seen || 0) >= 600) {
    try {
      await env.DB.prepare(
        `INSERT INTO streamdaw_update_installs (install_id, app_version, bundle_version, first_seen, last_seen, checks)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(install_id) DO UPDATE SET app_version = excluded.app_version, bundle_version = excluded.bundle_version,
           last_seen = excluded.last_seen, checks = streamdaw_update_installs.checks + 1`
      ).bind(install, app, bundle, t, t).run();
    } catch { /* before the migration: the answer still goes out */ }
  }
  // A bundle this Mac rolled back by itself (it crashed at start twice there).
  for (const v of String(q.get('bad') || '').split(',').filter((x) => STAMP.test(x)).slice(0, 5)) {
    try { await env.DB.prepare('INSERT OR IGNORE INTO streamdaw_bundle_bad (version, install_id, at) VALUES (?, ?, ?)').bind(v, install, t).run(); } catch {}
  }

  const rel = await softFirst(env, 'SELECT version FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1', ASSET);
  const mine = await softFirst(env, 'SELECT policy, message FROM streamdaw_app_versions WHERE version = ?', app);
  const latest = rel && APP_VER.test(String(rel.version || '')) ? String(rel.version) : null;
  const latestRow = latest ? await softFirst(env, 'SELECT notes FROM streamdaw_app_versions WHERE version = ?', latest) : null;
  const policy = mine && POLICIES.includes(mine.policy) ? mine.policy : 'ok';

  // The newest active bundle newer than what the app runs that this app may run.
  const rows = await soft(env, "SELECT version, min_app_version, sha256, bytes, notes, status FROM streamdaw_bundles WHERE status IN ('active', 'pulled')");
  let offer = null;
  for (const r of rows) {
    if (r.status !== 'active' || !STAMP.test(r.version) || !APP_VER.test(String(r.min_app_version))) continue;
    if (compareVersions(r.version, bundle) <= 0 || compareVersions(app, r.min_app_version) < 0) continue;
    if (!offer || compareVersions(r.version, offer.version) > 0) offer = r;
  }
  return json({
    ok: true,
    checkEveryHours: 24,
    app: { version: app, latest, url: DOWNLOAD_URL, notes: (latestRow && latestRow.notes) || '', policy,
           message: (policy !== 'ok' && mine && mine.message) || '' },
    bundle: offer ? { version: offer.version, url: `${SITE}/api/streamdaw/bundles/${offer.version}.tgz`, sha256: offer.sha256,
                      size: offer.bytes || 0, minApp: offer.min_app_version, notes: offer.notes || '' } : null,
    pulled: rows.filter((r) => r.status === 'pulled' && STAMP.test(r.version)).map((r) => r.version).slice(0, 50),
  });
}

/** GET /streamdaw/bundles/<ver>.tgz — the signed file, from R2. A pulled one is gone (410). */
export async function streamdawBundleFile(req, env, version) {
  if (!STAMP.test(version)) return json({ error: 'not_found' }, 404);
  const row = await softFirst(env, 'SELECT r2_key, status, bytes, sha256 FROM streamdaw_bundles WHERE version = ?', version);
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.status !== 'active') return json({ error: 'pulled' }, 410);
  const obj = await env.APPS.get(row.r2_key);
  if (!obj) return json({ error: 'file_missing' }, 404);
  return new Response(req.method === 'HEAD' ? null : obj.body, {
    headers: {
      'content-type': 'application/gzip',
      'content-length': String(obj.size || row.bytes || ''),
      // a version is never rebuilt under the same name: cacheable for good
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-sha256': row.sha256,
    },
  });
}

/** GET|POST /streamdaw/updates/admin — the dashboard's StreamDAW › App › Updates. Admin only. */
export async function streamdawUpdatesAdmin(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const t = now();
  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (b.op === 'policy') {
      const version = String(b.version || '').trim();
      if (!APP_VER.test(version)) return json({ error: 'bad_version' }, 400);
      if (!POLICIES.includes(b.policy)) return json({ error: 'bad_policy' }, 400);
      const message = String(b.message || '').trim().slice(0, 400), notes = String(b.notes || '').trim().slice(0, 1200);
      await env.DB.prepare(
        `INSERT INTO streamdaw_app_versions (version, policy, message, notes, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(version) DO UPDATE SET policy = excluded.policy, message = excluded.message,
           notes = CASE WHEN excluded.notes = '' THEN streamdaw_app_versions.notes ELSE excluded.notes END, updated_at = excluded.updated_at`
      ).bind(version, b.policy, message || null, notes, t).run();
      return json({ ok: true, version, policy: b.policy });
    }
    if (b.op === 'bundle') {
      const version = String(b.version || '');
      if (!STAMP.test(version) || !['active', 'pulled'].includes(b.status)) return json({ error: 'bad_request' }, 400);
      const r = await env.DB.prepare('UPDATE streamdaw_bundles SET status = ?, pulled_at = ? WHERE version = ?')
        .bind(b.status, b.status === 'pulled' ? t : null, version).run();
      if (!r || !r.meta || !r.meta.changes) return json({ error: 'not_found' }, 404);
      return json({ ok: true, version, status: b.status });
    }
    return json({ error: 'bad_op' }, 400);
  }
  const day = t - 86400, week = t - 7 * 86400, month = t - 30 * 86400;
  const bundles = await soft(env,
    `SELECT b.version, b.min_app_version, b.sha256, b.bytes, b.notes, b.status, b.created_at, b.pulled_at,
            (SELECT COUNT(*) FROM streamdaw_bundle_bad x WHERE x.version = b.version) AS crashed,
            (SELECT COUNT(*) FROM streamdaw_update_installs i WHERE i.bundle_version = b.version AND i.last_seen > ?) AS running
       FROM streamdaw_bundles b ORDER BY b.created_at DESC LIMIT 50`, week);
  const versions = await soft(env,
    `SELECT app_version AS version, COUNT(*) AS installs30d, SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS installs7d,
            SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS installs1d
       FROM streamdaw_update_installs WHERE last_seen > ? GROUP BY app_version`, week, day, month);
  const relays = await soft(env,
    `SELECT bundle_version AS version, COUNT(*) AS installs7d FROM streamdaw_update_installs WHERE last_seen > ? GROUP BY bundle_version`, week);
  const policies = await soft(env, 'SELECT version, policy, message, notes, updated_at FROM streamdaw_app_versions ORDER BY updated_at DESC LIMIT 100');
  const rel = await softFirst(env, 'SELECT version FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1', ASSET);
  // Every version seen or given a word, newest first, with its word.
  const byVer = new Map();
  for (const v of versions) byVer.set(v.version, { ...v, policy: 'ok', message: '', notes: '' });
  for (const p of policies) byVer.set(p.version, { installs30d: 0, installs7d: 0, installs1d: 0, ...(byVer.get(p.version) || {}), version: p.version, policy: p.policy, message: p.message || '', notes: p.notes || '' });
  if (rel && !byVer.has(rel.version)) byVer.set(rel.version, { version: rel.version, installs30d: 0, installs7d: 0, installs1d: 0, policy: 'ok', message: '', notes: '' });
  const apps = [...byVer.values()].sort((a, b) => compareVersions(b.version, a.version));
  return json({
    now: t,
    latest: rel ? rel.version : null,
    totals: {
      installs7d: apps.reduce((n, a) => n + (a.installs7d || 0), 0),
      installs30d: apps.reduce((n, a) => n + (a.installs30d || 0), 0),
      onLatest7d: rel ? ((byVer.get(rel.version) || {}).installs7d || 0) : 0,
    },
    apps, bundles, relays: relays.sort((a, b) => compareVersions(b.version, a.version)),
  });
}

/** The daily cron. `t` (unix seconds) for the tests. */
export async function streamdawUpdatesCleanup(env, t = now()) {
  try { await env.DB.prepare('DELETE FROM streamdaw_update_installs WHERE last_seen < ?').bind(t - KEEP_INSTALLS_SEC).run(); } catch {}
  try { await env.DB.prepare('DELETE FROM streamdaw_bundle_bad WHERE at < ?').bind(t - KEEP_BAD_SEC).run(); } catch {}
}
