/**
 * Packs and Characters — named groups of tracks.
 *
 * One table for both, distinguished by `kind`, because they are the same thing
 * wearing different clothes: a name, a set of tracks, a switch that hides it,
 * and eventually a piece of artwork. Building Packs as its own feature and then
 * Characters as a copy of it would mean every later change happening twice.
 *
 * Membership is a join table rather than the `packages` array that used to live
 * on each track. An array on the track can only answer "which packs is this
 * track in"; the questions actually being asked are "what is in this pack",
 * "how many", and "put these forty tracks in it", all of which are one row each
 * here and a rewrite of forty track records there. The existing package tags
 * were seeded across so nothing was lost.
 *
 * Hiding is two switches, not one. A single pack can be hidden while it is
 * being filled, and the whole dropdown can be hidden while none of them are
 * ready — which is the actual request: time to finish building before anyone
 * sees a half-made shelf.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);
const clean = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const KINDS = new Set(['pack', 'character']);

/* Whether a whole shelf is shown at all. Kept in `meta` rather than as a
   column on every row, because it is a property of the shelf and not of any
   collection on it. */
async function shelfHidden(env, kind) {
  // meta is (k, v) — not (key, value). Checked, not assumed.
  const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?')
    .bind(`shelf_hidden_${kind}`).first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

/**
 * GET /collections?kind=pack — public.
 *
 * A visitor sees only what is meant to be seen; the owner sees everything with
 * its hidden flag, so the same endpoint drives the catalogue and the editor
 * and they cannot disagree about what exists.
 */
export async function listCollections(env, user, url) {
  const kind = KINDS.has(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'pack';
  const admin = !!(user && user.admin);

  const r = await env.DB.prepare(
    `SELECT c.id, c.name, c.blurb, c.art, c.hidden, c.sort,
            (SELECT COUNT(*) FROM collection_tracks ct WHERE ct.collection_id = c.id) AS n
       FROM collections c WHERE c.kind = ? ORDER BY c.sort, c.name`
  ).bind(kind).all().catch(() => ({ results: [] }));

  const rows = (r.results || []).filter((x) => admin || !x.hidden);
  const ids = rows.map((x) => x.id);
  let members = {};
  if (ids.length) {
    const q = ids.map(() => '?').join(',');
    const m = await env.DB.prepare(
      `SELECT collection_id, slug FROM collection_tracks WHERE collection_id IN (${q}) ORDER BY sort, slug`
    ).bind(...ids).all().catch(() => ({ results: [] }));
    for (const x of m.results || []) (members[x.collection_id] ||= []).push(x.slug);
  }

  return json({
    kind,
    shelfHidden: await shelfHidden(env, kind),
    collections: rows.map((x) => ({
      id: x.id, name: x.name, blurb: x.blurb || '', art: x.art || '',
      hidden: !!x.hidden, sort: x.sort, count: x.n, tracks: members[x.id] || [],
    })),
  });
}

/** POST /collections — create, rename, hide, reorder, or delete one. */
export async function saveCollection(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const kind = KINDS.has(b.kind) ? b.kind : 'pack';

  if (b.shelf_hidden !== undefined) {
    await env.DB.prepare(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(`shelf_hidden_${kind}`, b.shelf_hidden ? '1' : '0').run();
    return json({ ok: true, shelfHidden: !!b.shelf_hidden });
  }

  if (b.remove) {
    const id = Number(b.remove);
    // Membership goes with it. The tracks themselves are untouched — a pack is
    // a way of looking at the catalogue, not a thing the catalogue belongs to.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM collection_tracks WHERE collection_id = ?').bind(id),
      env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id),
    ]);
    return json({ ok: true, removed: id });
  }

  if (b.id) {
    const id = Number(b.id);
    const sets = [], vals = [];
    if (b.name !== undefined && clean(b.name).length >= 2) { sets.push('name = ?'); vals.push(clean(b.name)); }
    if (b.blurb !== undefined) { sets.push('blurb = ?'); vals.push(clean(b.blurb, 400)); }
    if (b.art !== undefined) { sets.push('art = ?'); vals.push(clean(b.art, 400)); }
    if (b.hidden !== undefined) { sets.push('hidden = ?'); vals.push(b.hidden ? 1 : 0); }
    if (b.sort !== undefined) { sets.push('sort = ?'); vals.push(Math.round(Number(b.sort) || 0)); }
    if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
    vals.push(id);
    await env.DB.prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true, id });
  }

  const name = clean(b.name);
  if (name.length < 2) return json({ error: 'name_required' }, 400);
  const dupe = await env.DB.prepare('SELECT id FROM collections WHERE kind = ? AND name = ?')
    .bind(kind, name).first().catch(() => null);
  if (dupe) return json({ error: 'name_taken', id: dupe.id }, 409);

  const max = await env.DB.prepare('SELECT MAX(sort) m FROM collections WHERE kind = ?')
    .bind(kind).first().catch(() => ({ m: 0 }));
  const r = await env.DB.prepare(
    `INSERT INTO collections (kind, name, blurb, art, hidden, sort, created_at)
     VALUES (?, ?, ?, '', 1, ?, ?)`
  ).bind(kind, name, clean(b.blurb, 400), ((max && max.m) || 0) + 1, now()).run();

  // Created hidden on purpose: a pack with nothing in it is not something a
  // visitor should meet, and the alternative is a race between creating it and
  // filling it.
  return json({ ok: true, id: r.meta.last_row_id, name, hidden: true });
}

/** POST /collections/tracks — { id, slugs, remove? } add or take tracks out. */
export async function setCollectionTracks(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  const slugs = (Array.isArray(b.slugs) ? b.slugs : [])
    .map((s) => clean(s, 140)).filter(Boolean).slice(0, 500);
  if (!slugs.length) return json({ error: 'no_tracks' }, 400);

  if (b.remove) {
    const q = slugs.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM collection_tracks WHERE collection_id = ? AND slug IN (${q})`)
      .bind(id, ...slugs).run();
    return json({ ok: true, removed: slugs.length });
  }

  /* Only real slugs get in. A membership row is just a string, so a mistyped or
     pasted-in TITLE was accepted happily and then matched no track — which is
     how "Secret Agent" came to hold one member, `THE DEVIOUS FOX`, and still
     look empty. Titles are mapped to their slug where we can, so pasting a
     title now does the obvious thing instead of failing quietly. */
  const known = await env.DB.prepare(
    `SELECT slug, title FROM tracks`).all().catch(() => ({ results: [] }));
  const bySlug = new Set((known.results || []).map((t) => t.slug));
  const byTitle = new Map((known.results || []).map((t) => [String(t.title || '').toLowerCase(), t.slug]));

  const resolved = [], unknown = [];
  for (const s of slugs) {
    if (bySlug.has(s)) resolved.push(s);
    else if (byTitle.has(s.toLowerCase())) resolved.push(byTitle.get(s.toLowerCase()));
    else unknown.push(s);
  }
  if (!resolved.length) return json({ error: 'no_known_tracks', unknown }, 400);

  const max = await env.DB.prepare('SELECT MAX(sort) m FROM collection_tracks WHERE collection_id = ?')
    .bind(id).first().catch(() => ({ m: 0 }));
  let n = ((max && max.m) || 0) + 1;
  await env.DB.batch(resolved.map((s) => env.DB.prepare(
    'INSERT OR IGNORE INTO collection_tracks (collection_id, slug, sort) VALUES (?, ?, ?)'
  ).bind(id, s, n++)));

  return json({ ok: true, added: resolved.length, unknown });
}


/**
 * PUT /collections/art?id= — raw image body, straight to R2.
 *
 * The character's picture. Uploaded rather than generated because generated art
 * costs credits and a character can perfectly well be drawn, commissioned or
 * pulled from a shoot — the package does not care where the picture came from.
 * Named by the Worker, not the caller, so nothing can overwrite another key.
 */
export async function uploadCollectionArt(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);

  const type = req.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) return json({ error: 'bad_type' }, 415);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 8 * 1024 * 1024) return json({ error: 'bad_size' }, 413);

  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  // Timestamped so a replacement is never served from the cache of the one it
  // replaced — the same trap the track covers fell into.
  const key = `mutra/collections/${id}-${Date.now()}.${ext}`;
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000' },
  });
  const publicUrl = `https://cdn.snowstar.company/${key}`;
  await env.DB.prepare('UPDATE collections SET art = ? WHERE id = ?').bind(publicUrl, id).run();
  return json({ ok: true, url: publicUrl });
}
