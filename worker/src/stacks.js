/**
 * Track stacks — alternate versions filed under the track they belong to.
 *
 * The catalogue is full of families: ACTION TENSION plus its EPIC ENDING and
 * its DRUMS stem, five BASEGROUND mixes, BIG FAT FUNERAL in three vintages,
 * BICYCLETTE with and without the vocal. As separate rows they are noise —
 * a buyer scrolling the list meets the same piece of music five times and has
 * no way to tell which one is the main one. Stacked, the family is one row
 * that says "5 versions".
 *
 * Stored in its own table rather than in track_overrides. Overrides are a
 * free-form patch blob that the bulk editor rewrites wholesale; a parent/child
 * relationship living in there would be destroyed the first time somebody
 * bulk-edited a genre, and the damage would be silent.
 *
 * Reads are public: the collapsing is the point of the feature, and a signed-out
 * visitor should see the tidy list. Writes are owner-only.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v) => String(v == null ? '' : v).trim().slice(0, 120);

/** GET /stacks — every parent/child pair. Small enough to send whole. */
export async function listStacks(env) {
  const r = await env.DB.prepare(
    'SELECT child_slug, parent_slug, sort FROM track_stacks ORDER BY parent_slug, sort, child_slug'
  ).all().catch(() => ({ results: [] }));

  const stacks = {};
  for (const row of r.results || []) {
    (stacks[row.parent_slug] ||= []).push(row.child_slug);
  }
  return json({ stacks });
}

/**
 * POST /stacks — { child, parent } to stack, { child, parent: null } to free it.
 *
 * Guards against the two shapes that would corrupt the list: a track filed
 * under itself, and a chain (A under B while B is under C), which would make
 * a version disappear from the catalogue entirely because the renderer only
 * ever expands one level.
 */
export async function saveStack(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const child = clean(b.child);
  const parent = b.parent == null ? null : clean(b.parent);
  if (!child) return json({ error: 'no_child' }, 400);

  if (parent === null) {
    await env.DB.prepare('DELETE FROM track_stacks WHERE child_slug = ?').bind(child).run();
    return json({ ok: true, child, parent: null });
  }
  if (parent === child) return json({ error: 'self' }, 400);

  // A track that already has children cannot become a child itself, and a
  // track that is already a child cannot become a parent. One level only.
  const kids = await env.DB.prepare('SELECT 1 FROM track_stacks WHERE parent_slug = ? LIMIT 1')
    .bind(child).first().catch(() => null);
  if (kids) return json({ error: 'child_has_own_versions' }, 409);

  const parentIsChild = await env.DB.prepare('SELECT parent_slug FROM track_stacks WHERE child_slug = ?')
    .bind(parent).first().catch(() => null);
  // Dropping onto a version files the new track alongside it, under the same
  // parent — which is what somebody aiming at a stack almost always means.
  const realParent = parentIsChild ? parentIsChild.parent_slug : parent;
  if (realParent === child) return json({ error: 'cycle' }, 400);

  const n = await env.DB.prepare('SELECT COUNT(*) c FROM track_stacks WHERE parent_slug = ?')
    .bind(realParent).first().catch(() => ({ c: 0 }));

  await env.DB.prepare(
    `INSERT INTO track_stacks (child_slug, parent_slug, sort, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(child_slug) DO UPDATE SET parent_slug = excluded.parent_slug,
                                           sort = excluded.sort`
  ).bind(child, realParent, (n && n.c) || 0, Math.floor(Date.now() / 1000)).run();

  return json({ ok: true, child, parent: realParent });
}
