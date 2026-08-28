/**
 * Trash for rejected uploads.
 *
 * A rejected submission used to keep its audio in the live bucket forever. It
 * was invisible — off the catalogue, off the review queue — but still stored,
 * still counted against the bucket, and still fetchable by anyone who knew the
 * key. Over a few hundred rejections that is real money and a real leak.
 *
 * Deleting on rejection would be worse. Rejections get reversed: a file is
 * turned down for a bad master, the artist asks, and the decision changes. So
 * rejection MOVES the object to a trash/ prefix, where it is out of the way,
 * plainly accounted for in the storage report, restorable, and deleted only
 * when somebody says so.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const TRASH = 'trash/';

/**
 * Move one object into the trash prefix.
 *
 * R2 has no rename, so this is copy-then-delete. The delete only happens if the
 * copy verifiably landed — a half-done move that deleted the original would
 * turn a reversible rejection into a lost master.
 */
export async function trashObject(env, key) {
  if (!key || key.startsWith(TRASH)) return { moved: false, reason: 'already_trash' };
  const obj = await env.MEDIA.get(key).catch(() => null);
  if (!obj) return { moved: false, reason: 'not_found' };

  const dest = TRASH + key;
  await env.MEDIA.put(dest, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: { ...(obj.customMetadata || {}), trashedFrom: key,
                      trashedAt: String(Math.floor(Date.now() / 1000)) },
  });
  const landed = await env.MEDIA.head(dest).catch(() => null);
  if (!landed) return { moved: false, reason: 'copy_failed' };

  await env.MEDIA.delete(key);
  return { moved: true, from: key, to: dest };
}

/** GET /storage/trash — what is in there, so "empty" is never a blind click. */
export async function listTrash(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  let cursor, items = [], bytes = 0, truncated = false;
  for (let page = 0; page < 12; page++) {
    const r = await env.MEDIA.list({ prefix: TRASH, cursor, limit: 1000 }).catch(() => null);
    if (!r) break;
    for (const o of r.objects) {
      bytes += o.size || 0;
      if (items.length < 200) {
        items.push({ key: o.key, size: o.size,
                     at: (o.customMetadata && Number(o.customMetadata.trashedAt)) || null });
      } else truncated = true;
    }
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  return json({ count: items.length + (truncated ? 1 : 0), bytes, truncated, items });
}

/**
 * DELETE /storage/trash — empty it.
 *
 * Requires ?confirm=<the exact object count> from the caller. This is the one
 * irreversible button in the dashboard, and a stale page that thinks there are
 * three files must not be able to delete three hundred.
 */
export async function emptyTrash(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const keys = [];
  let cursor;
  for (let page = 0; page < 12; page++) {
    const r = await env.MEDIA.list({ prefix: TRASH, cursor, limit: 1000 }).catch(() => null);
    if (!r) break;
    r.objects.forEach((o) => keys.push(o.key));
    if (!r.truncated) break;
    cursor = r.cursor;
  }

  const confirm = Number(url.searchParams.get('confirm'));
  if (!Number.isFinite(confirm) || confirm !== keys.length) {
    return json({ error: 'confirm_mismatch', expected: keys.length,
                  detail: 'The trash changed since the page loaded. Reload and try again.' }, 409);
  }
  if (!keys.length) return json({ ok: true, deleted: 0 });

  let deleted = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    await env.MEDIA.delete(batch).catch(async () => {
      for (const k of batch) await env.MEDIA.delete(k).catch(() => null);
    });
    deleted += batch.length;
  }

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'empty_trash', null, `${deleted} objects`, Math.floor(Date.now() / 1000))
   .run().catch(() => null);

  return json({ ok: true, deleted });
}

/** POST /storage/trash/restore — put one file back where it came from. */
export async function restoreFromTrash(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const key = String(b.key || '');
  if (!key.startsWith(TRASH)) return json({ error: 'not_in_trash' }, 400);

  const obj = await env.MEDIA.get(key).catch(() => null);
  if (!obj) return json({ error: 'not_found' }, 404);
  const dest = (obj.customMetadata && obj.customMetadata.trashedFrom) || key.slice(TRASH.length);

  await env.MEDIA.put(dest, obj.body, { httpMetadata: obj.httpMetadata });
  if (!(await env.MEDIA.head(dest).catch(() => null))) return json({ error: 'copy_failed' }, 500);
  await env.MEDIA.delete(key);
  return json({ ok: true, restored: dest });
}
