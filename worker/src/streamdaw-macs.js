/* StreamDAW: a Mac tied to the Snowstar account that runs it (2026-10-15).
 *
 * Ori: a sign-up who downloads StreamDAW for the 7-day trial should show up in the dashboard, with
 * what they did with it. The trial starts inside the app with no account, and what the app sends
 * (stream health, usage) carries only a hash of the Mac's machine ID, so nothing joined the two.
 * Now the app opens /apps/streamdaw-connect.html#m=<machine ID>&v=<version> once, at its first
 * start (and from Settings › Licence until it is done); the signed-in person's page posts it here.
 *
 *   POST /streamdaw/macs/link     {machine, app}  signed in: this Mac is this account's (the last
 *                                                 one to link it wins; one row per Mac)
 *   POST /streamdaw/macs/status   {machine}       the app's relay: {linked} only, nothing about who
 *                                                 (no cookie, no Origin: CSRF-exempt, like telemetry)
 *   peopleOnTrial(env)                            the dashboard's StreamDAW › App › People rows
 *
 * The hash is the relay's (server/telemetry.js): sha256(machine ID) in hex, first 16 characters.
 * Privacy: privacy.html says it (stream health and usage from a connected Mac are linked to the
 * account); reset.js erasePerson takes these Macs' rows with the person.
 *
 *   CREATE TABLE streamdaw_macs (machine_id TEXT PRIMARY KEY, machine_hash TEXT NOT NULL,
 *     user_id TEXT NOT NULL, app_version TEXT, linked_at INTEGER NOT NULL, seen_at INTEGER NOT NULL)
 *   (schema-streamdaw-macs.sql)
 */
import { currentUser } from './session.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const now = () => Math.floor(Date.now() / 1000);
const MACHINE_ID_RE = /^SD[0-9A-F]{12,20}$/;                 // streamdaw.js's
const APP_VER = /^\d{1,3}(\.\d{1,4}){1,3}(-[0-9A-Za-z.]{1,20})?$/;
const machineHash = async (m) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(m))))]
  .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
const body = async (req) => { try { return await req.json(); } catch { return null; } };

export async function streamdawMacLink(req, env) {
  const user = await currentUser(req, env).catch(() => null);
  if (!user) return json({ error: 'sign_in_required' }, 401);
  const b = await body(req);
  const machine = String((b && b.machine) || '').trim().toUpperCase();
  if (!MACHINE_ID_RE.test(machine)) return json({ error: 'bad_machine' }, 400);
  const app = b && APP_VER.test(String(b.app || '')) ? String(b.app) : null;
  const t = now();
  await env.DB.prepare(
    `INSERT INTO streamdaw_macs (machine_id, machine_hash, user_id, app_version, linked_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (machine_id) DO UPDATE SET user_id = excluded.user_id, app_version = COALESCE(excluded.app_version, streamdaw_macs.app_version),
         linked_at = CASE WHEN streamdaw_macs.user_id = excluded.user_id THEN streamdaw_macs.linked_at ELSE excluded.linked_at END, seen_at = excluded.seen_at`
  ).bind(machine, await machineHash(machine), user.id, app, t, t).run();
  return json({ ok: true, name: user.name || null });
}

export async function streamdawMacStatus(req, env) {
  const b = await body(req);
  const machine = String((b && b.machine) || '').trim().toUpperCase();
  if (!MACHINE_ID_RE.test(machine)) return json({ error: 'bad_machine' }, 400);
  const row = await env.DB.prepare('SELECT user_id FROM streamdaw_macs WHERE machine_id = ?').bind(machine).first().catch(() => null);
  return json({ linked: !!row });
}

/* Everyone who took the free installer or connected a Mac, newest first: who, what they took, and what
   their connected Macs did (sd_streams: sittings, minutes on air, the most people at once, the last
   tier the app said). Before the migration: [] (soft), the dashboard says so. */
export async function peopleOnTrial(env) {
  const soft = async (sql, ...binds) => { try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; } catch { return null; } };
  const people = await soft(
    `SELECT u.id, u.name, u.email, MIN(f.created_at) AS first_dl, MAX(f.created_at) AS last_dl, COUNT(f.user_id) AS dls,
            (SELECT f2.version FROM streamdaw_free_downloads f2 WHERE f2.user_id = u.id ORDER BY f2.created_at DESC LIMIT 1) AS version
       FROM users u JOIN streamdaw_free_downloads f ON f.user_id = u.id
      GROUP BY u.id ORDER BY last_dl DESC LIMIT 300`);
  const macs = await soft('SELECT m.machine_hash, m.user_id, m.app_version, m.linked_at, m.seen_at, u.name, u.email FROM streamdaw_macs m LEFT JOIN users u ON u.id = m.user_id');
  if (people === null) return { ok: false, people: [] };
  const byUser = new Map(people.map((p) => [p.id, { ...p, macs: [] }]));
  for (const m of macs || []) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, { id: m.user_id, name: m.name, email: m.email, first_dl: null, last_dl: null, dls: 0, version: null, macs: [] });
    byUser.get(m.user_id).macs.push(m);
  }
  const hashes = [...new Set((macs || []).map((m) => m.machine_hash))];
  const use = new Map();
  for (let i = 0; i < hashes.length; i += 50) {
    const part = hashes.slice(i, i + 50);
    const rows = await soft(
      `SELECT machine, COUNT(*) AS sittings, COALESCE(SUM(on_air_sec), 0) AS on_air_sec, MAX(peak) AS peak, MAX(last_at) AS last_at,
              (SELECT s2.tier FROM sd_streams s2 WHERE s2.machine = s.machine ORDER BY s2.last_at DESC LIMIT 1) AS tier,
              (SELECT s2.app FROM sd_streams s2 WHERE s2.machine = s.machine ORDER BY s2.last_at DESC LIMIT 1) AS app
         FROM sd_streams s WHERE machine IN (${part.map(() => '?').join(',')}) GROUP BY machine`, ...part) || [];
    for (const r of rows) use.set(r.machine, r);
  }
  const out = [...byUser.values()].map((p) => {
    const u = p.macs.map((m) => use.get(m.machine_hash)).filter(Boolean);
    return {
      name: p.name || null, email: p.email || null, firstDownload: p.first_dl, lastDownload: p.last_dl, downloads: p.dls, version: p.version,
      macs: p.macs.length, linkedAt: p.macs.reduce((a, m) => Math.max(a, m.linked_at || 0), 0) || null,
      sittings: u.reduce((a, r) => a + (r.sittings || 0), 0), onAirMin: Math.round(u.reduce((a, r) => a + (r.on_air_sec || 0), 0) / 60),
      peak: u.reduce((a, r) => Math.max(a, r.peak || 0), 0),
      lastStream: u.reduce((a, r) => Math.max(a, r.last_at || 0), 0) || null,       // ms (sd_streams)
      tier: (u.sort((a, b) => (b.last_at || 0) - (a.last_at || 0))[0] || {}).tier || null,
      app: (u[0] || {}).app || (p.macs[0] || {}).app_version || null,
    };
  });
  out.sort((a, b) => Math.max(b.lastDownload || 0, b.linkedAt || 0, (b.lastStream || 0) / 1000) - Math.max(a.lastDownload || 0, a.linkedAt || 0, (a.lastStream || 0) / 1000));
  return { ok: true, people: out };
}
