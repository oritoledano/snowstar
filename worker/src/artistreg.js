/**
 * Artist registry — the roster behind the credited names.
 *
 * A track's artist field is free text, and real credits routinely read
 * "KAYMA, Omri Smadar". Rather than leave those as a string nobody can act
 * on, splitting the field mints a real artist record per name. They arrive
 * blank apart from the name — that is the point: the record exists so the
 * owner can find it on the dashboard, fill in a profile, and assign more
 * tracks, instead of discovering later that a collaborator was only ever a
 * substring.
 *
 * Names are matched case-insensitively so "kayma" never becomes a second
 * KAYMA, and email is '' for auto-created rows (the column is NOT NULL and
 * we genuinely do not know one yet) — an empty email is the signal that a
 * profile still needs filling in.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** "KAYMA, Omri Smadar" -> ['KAYMA', 'Omri Smadar'] */
export const splitNames = (s) =>
  String(s || '').split(',').map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 12);

/** Public: the roster, for the credit pickers. */
export async function listArtists(env) {
  const r = await env.DB.prepare(
    `SELECT id, name, email, bio, avatar, links, claimed_user_id
       FROM managed_artists ORDER BY name COLLATE NOCASE`
  ).all();
  return json({ artists: r.results || [] });
}

/**
 * Ensure every name has a record; returns the full roster.
 * Owner-only — this is called from the catalog editor.
 */
export async function ensureArtists(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const names = Array.isArray(b.names) ? b.names : splitNames(b.artist);
  if (!names.length) return listArtists(env);

  const created = [];
  for (const raw of names.slice(0, 12)) {
    const name = String(raw).trim().slice(0, 120);
    if (name.length < 2) continue;
    const hit = await env.DB.prepare(
      'SELECT id FROM managed_artists WHERE name = ? COLLATE NOCASE'
    ).bind(name).first();
    if (hit) continue;
    await env.DB.prepare(
      `INSERT INTO managed_artists (name, email, created_at, created_from)
       VALUES (?, '', ?, 'catalog')`
    ).bind(name, now()).run();
    created.push(name);
  }
  const all = await env.DB.prepare(
    `SELECT id, name, email, bio, avatar, links, claimed_user_id
       FROM managed_artists ORDER BY name COLLATE NOCASE`
  ).all();
  return json({ artists: all.results || [], created });
}

/** Owner: fill in or correct an artist profile. */
export async function saveArtist(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);

  const sets = [], vals = [];
  const put = (col, v, max = 300) => { sets.push(`${col} = ?`); vals.push(String(v ?? '').trim().slice(0, max)); };
  if (b.name !== undefined && String(b.name).trim().length >= 2) put('name', b.name, 120);
  if (b.email !== undefined) put('email', b.email, 254);
  if (b.bio !== undefined) put('bio', b.bio, 4000);
  if (b.avatar !== undefined) put('avatar', b.avatar, 400);
  if (b.links !== undefined) {
    // [{platform, url}] — kept as JSON so the shape can grow without a migration
    const links = Array.isArray(b.links) ? b.links.slice(0, 12).map((l) => ({
      platform: String(l.platform || '').trim().slice(0, 40),
      url: String(l.url || '').trim().slice(0, 400),
    })).filter((l) => l.platform && l.url) : [];
    sets.push('links = ?'); vals.push(JSON.stringify(links));
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  vals.push(id);
  await env.DB.prepare(`UPDATE managed_artists SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return listArtists(env);
}
