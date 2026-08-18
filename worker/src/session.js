/** Session-cookie lookup — shared by index.js (every gated route) and
 * analytics.js (to attach a signed-in visitor's real identity to their own
 * beacons, never trusting anything the client itself asserts). */
import { sha256b64 } from './crypto.js';

const now = () => Math.floor(Date.now() / 1000);

export function readCookies(req, name) {
  const raw = req.headers.get('cookie') || '';
  const values = [];
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) values.push(part.slice(i + 1));
  }
  return values;
}

export async function currentUser(req, env) {
  // A browser can hold SEVERAL ss_session cookies — the pre-umbrella host-only
  // one next to today's Domain= cookie — and it sends the OLDEST first. Never
  // trust just the first match: a dead old cookie would shadow a live session
  // forever. Try each one.
  for (const token of readCookies(req, 'ss_session')) {
    if (!token) continue;
    const hash = await sha256b64(token);
    const row = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.newsletter, u.admin, u.avatar,
              u.artist, u.artist_name, u.first_name, u.last_name, u.country,
              u.phone, u.role, u.company, u.pw_hash, u.signup_source, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`
    ).bind(hash).first();
    if (row && row.expires_at > now()) return row;
  }
  return null;
}
