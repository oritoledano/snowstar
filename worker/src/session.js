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

/* Resolved users, keyed by the Request itself.
 *
 * index.js calls currentUser inline on ~157 route lines, and a browser holding
 * two ss_session cookies costs a D1 JOIN per cookie per call. One request only
 * ever runs one of those lines today, so this is not undoing a stampede — but
 * it does mean the request health log can name the person who made a request
 * WITHOUT paying for a second lookup on every single request, which is the
 * difference between instrumentation that is free and instrumentation that
 * doubles the database traffic it is there to measure.
 *
 * A WeakMap keyed on the Request, not a module-level variable: one isolate
 * serves many requests at once, and a shared `let` would hand one visitor's
 * identity to another. The key dies with the request, so nothing accumulates. */
const resolved = new WeakMap();

/** What currentUser already worked out for this request, or null. Costs nothing
 *  and never queries — callers that need a lookup should call currentUser. */
export function peekUser(req) {
  return resolved.get(req) || null;
}

export async function currentUser(req, env) {
  if (resolved.has(req)) return resolved.get(req);
  const found = await lookUp(req, env);
  resolved.set(req, found);
  return found;
}

async function lookUp(req, env) {
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
