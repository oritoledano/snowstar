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
  /* Both kinds of artist, in one roster.
     `managed_artists` holds the ghost profiles the owner creates for names in
     the catalogue; `users` holds people who signed up and made themselves an
     artist. They were never merged, so the catalogue's artist panel — which
     reads this — could not see a real member's bio or photo at all. Somebody
     would edit their profile, save successfully, and watch the panel stay
     empty, because the panel was reading a different table from the one the
     editor writes to.
     A real account wins on a name collision: it is the profile its owner
     actually maintains. */
  const [ghosts, members] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, email, bio, avatar, links, claimed_user_id
         FROM managed_artists ORDER BY name COLLATE NOCASE`).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT id, artist_name AS name, artist_bio AS bio, avatar,
              artist_links AS links
         FROM users WHERE artist = 1 AND artist_name IS NOT NULL AND artist_name != ''`
    ).all().catch(() => ({ results: [] })),
  ]);

  /* Two accounts can carry the same artist name — someone signs up twice, or an
     artist claims a profile they already had. Whichever is richer wins, because
     an empty duplicate silently blanking a filled-in profile is exactly the bug
     this merge was meant to end. */
  const filled = (r) => (r.bio ? 4 : 0) + (r.links && r.links !== '[]' ? 2 : 0) + (r.avatar ? 1 : 0);
  const byName = new Map();
  const put = (key, row) => {
    const cur = byName.get(key);
    if (!cur || filled(row) > filled(cur)) byName.set(key, row);
  };
  for (const g of ghosts.results || []) put(String(g.name || '').toLowerCase(), g);
  for (const m of members.results || []) {
    // Email is deliberately not carried over from a member account: the roster
    // is public, and a ghost's email is a contact the owner typed, not a
    // person's sign-in address.
    const row = { id: m.id, name: m.name, email: null, bio: m.bio, avatar: m.avatar,
                  links: m.links, claimed_user_id: m.id, member: 1 };
    const key = String(m.name || '').toLowerCase();
    // A real account still beats a ghost of the same name even when emptier —
    // it is the one its owner can actually edit.
    const cur = byName.get(key);
    if (!cur || !cur.member || filled(row) > filled(cur)) byName.set(key, row);
  }
  const artists = [...byName.values()].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  return json({ artists });
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
