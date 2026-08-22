/**
 * Owner-only member management from the dashboard: edit a member's name and
 * newsletter flag, or delete the account outright.
 *
 * Deletion is deliberately conservative. Sessions, favorites and identities
 * disappear with the account — nobody needs those once it's gone. But a
 * member with a submission, a signed rights declaration, or a collaborator
 * credit has a footprint that matters after they're deleted (an artist's
 * upload history, a legal signature, someone else's royalty split) — so
 * deletion is refused rather than silently destroying that record. Editing
 * (rename, opt them out of the newsletter) always works regardless.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function updateMember(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!id) return json({ error: 'id_required' }, 400);
  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return json({ error: 'not_found' }, 404);

  const sets = [], vals = [];
  if (b.name !== undefined) { sets.push('name = ?'); vals.push(String(b.name || '').trim().slice(0, 80) || null); }
  if (b.newsletter !== undefined) { sets.push('newsletter = ?'); vals.push(b.newsletter ? 1 : 0); }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  vals.push(id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function deleteMember(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!id) return json({ error: 'id_required' }, 400);
  if (id === user.id) return json({ error: 'cannot_delete_self' }, 400);

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return json({ error: 'not_found' }, 404);

  const footprint = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM submissions WHERE user_id = ?) AS subs,
       (SELECT COUNT(*) FROM rights_decls WHERE signer_user_id = ?) AS decls,
       (SELECT COUNT(*) FROM collaborators WHERE user_id = ?) AS credits`
  ).bind(id, id, id).first();
  if (footprint.subs || footprint.decls || footprint.credits) {
    return json({ error: 'has_rights_history', footprint }, 409);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM favorites WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM identities WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM downloads WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(id),
    // the ghost profile survives — it just becomes unclaimed again
    env.DB.prepare('UPDATE managed_artists SET claimed_user_id = NULL WHERE claimed_user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

/**
 * One member, everything about them, for the dashboard's detail drawer.
 *
 * Deliberately assembled from several small queries rather than one joined
 * monster: a member with 40 downloads and 60 favorites would multiply into
 * 2,400 rows under a naive join, and the counts would all be wrong. Each
 * relationship is read on its own and capped, so the drawer stays cheap
 * however heavy the account gets.
 *
 * Payments and invoices are read defensively — those tables arrive with the
 * checkout work and may not exist yet, so a missing table returns an empty
 * list rather than 500-ing the whole drawer.
 */
export async function memberDetail(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const id = String(url.searchParams.get('id') || '');
  if (!id) return json({ error: 'bad_id' }, 400);

  const m = await env.DB.prepare(
    `SELECT id, email, name, first_name, last_name, company, role, country, phone,
            newsletter, admin, artist, artist_name, email_verified, avatar,
            signup_source, created_at, last_login_at
       FROM users WHERE id = ?`
  ).bind(id).first();
  if (!m) return json({ error: 'not_found' }, 404);

  const soft = async (sql, ...binds) => {
    try { const r = await env.DB.prepare(sql).bind(...binds).all(); return r.results || []; }
    catch { return []; }   // table not created yet
  };

  const [downloads, favorites, payments, invoices, submissions, channels, identities] = await Promise.all([
    soft(`SELECT slug, ts FROM downloads WHERE user_id = ? ORDER BY ts DESC LIMIT 200`, id),
    soft(`SELECT slug, product FROM favorites WHERE user_id = ? LIMIT 300`, id),
    soft(`SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 100`, id),
    soft(`SELECT * FROM invoices WHERE user_id = ? ORDER BY id DESC LIMIT 100`, id),
    soft(`SELECT id, title, status, published_slug, created_at FROM submissions
           WHERE user_id = ? ORDER BY id DESC LIMIT 100`, id),
    soft(`SELECT platform, value, status FROM channels WHERE user_id = ? LIMIT 60`, id),
    soft(`SELECT provider FROM identities WHERE user_id = ?`, id),
  ]);

  // activity is keyed by session, not user, so it is only joinable where a
  // session was seen while signed in — report what we have rather than imply
  // a completeness we cannot deliver
  const plays = await soft(
    `SELECT detail AS slug, COUNT(*) AS n FROM events
      WHERE type = 'play' AND session_id IN (SELECT session_id FROM sessions_seen WHERE user_id = ?)
      GROUP BY detail ORDER BY n DESC LIMIT 25`, id);

  return json({
    member: m,
    downloads, favorites, payments, invoices, submissions, channels, plays,
    providers: identities.map((r) => r.provider),
    totals: {
      downloads: downloads.length, favorites: favorites.length,
      payments: payments.length, invoices: invoices.length,
      submissions: submissions.length,
    },
  });
}
