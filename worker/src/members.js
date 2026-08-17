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
