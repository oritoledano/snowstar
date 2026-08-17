/**
 * Self-service profile: the editable fields behind the Account panel, plus
 * a member's own downloads/favorites history (resolved against the `tracks`
 * mirror table so we never have to ship the full catalog JS to read a title).
 *
 * Email is the one field with a real trust boundary: it's also the login
 * identifier and, for social accounts, the key OAuth uses to link an
 * identity. So it's only editable on a password account, and only with the
 * current password re-typed as confirmation — exactly like changing a
 * password anywhere else worth trusting.
 */

import { publicUser } from './user.js';
import { verifyPassword } from './crypto.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const validEmail = (e) =>
  typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const clean = (v, max) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };

const PROFILE_SELECT =
  `id, email, name, newsletter, admin, avatar, first_name, last_name, country,
   phone, role, company, pw_hash, pw_salt, pw_iters, signup_source`;

// which body key writes which column — only keys actually present get touched,
// so an email-only request (or any partial save) can never blank out the rest
const FIELD_COLS = { first_name: 60, last_name: 60, country: 56, phone: 30, role: 80, company: 80 };

export async function updateProfile(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));

  // full row, not the trimmed session-cookie shape — needed for pw checks
  const row = await env.DB.prepare(`SELECT ${PROFILE_SELECT} FROM users WHERE id = ?`).bind(user.id).first();
  if (!row) return json({ error: 'not_found' }, 404);

  const wantsEmail = typeof b.email === 'string' && b.email.trim().toLowerCase() !== row.email;
  if (wantsEmail) {
    if (!row.pw_hash) return json({ error: 'email_locked_oauth' }, 400);
    const newEmail = b.email.trim().toLowerCase();
    if (!validEmail(newEmail)) return json({ error: 'invalid_email' }, 400);
    const ok = await verifyPassword(env, row, String(b.current_password || ''));
    if (!ok) return json({ error: 'wrong_password' }, 401);
    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?')
      .bind(newEmail, user.id).first();
    if (taken) return json({ error: 'email_taken' }, 409);
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(newEmail, user.id).run();
    row.email = newEmail;
  }

  const sets = [], vals = [];
  for (const [key, max] of Object.entries(FIELD_COLS)) {
    if (b[key] === undefined) continue;         // not part of this save — leave column alone
    const v = clean(b[key], max);
    row[key] = v;                                // keep `row` in sync for the name recompute below
    sets.push(`${key} = ?`); vals.push(v);
  }

  // recompute the display name from first+last whenever either was touched,
  // but never blank out an existing name just because both were left empty
  if (b.first_name !== undefined || b.last_name !== undefined) {
    const joined = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    if (joined) { sets.push('name = ?'); vals.push(joined); }
  }

  if (sets.length) {
    vals.push(user.id);
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  } else if (!wantsEmail) {
    return json({ error: 'nothing_to_update' }, 400);
  }

  const fresh = await env.DB.prepare(`SELECT ${PROFILE_SELECT} FROM users WHERE id = ?`).bind(user.id).first();
  return json({ ok: true, user: publicUser(fresh) });
}

/** Tracks this member has downloaded, most recent first. */
export async function myDownloads(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const r = await env.DB.prepare(
    `SELECT d.slug, t.title, MAX(d.ts) AS ts, COUNT(*) AS times
       FROM downloads d LEFT JOIN tracks t ON t.slug = d.slug
      WHERE d.user_id = ? GROUP BY d.slug ORDER BY ts DESC LIMIT 300`
  ).bind(user.id).all();
  return json({ downloads: r.results || [] });
}

/** This member's favorited tracks, with titles resolved server-side. */
export async function myFavoritesList(env, user, url) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const prod = ['mutra', 'snowstar'].includes(url.searchParams.get('product')) ? url.searchParams.get('product') : 'mutra';
  const r = await env.DB.prepare(
    `SELECT f.slug, t.title, f.created_at AS ts
       FROM favorites f LEFT JOIN tracks t ON t.slug = f.slug
      WHERE f.user_id = ? AND f.product = ? ORDER BY f.created_at DESC LIMIT 300`
  ).bind(user.id, prod).all();
  return json({ favorites: r.results || [] });
}
