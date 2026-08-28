/**
 * Artist profiles, editable from the dashboard.
 *
 * There were two problems, and the second is the one that made this
 * unbuildable rather than merely missing.
 *
 * First, nothing edited a profile. `saveArtist` existed in artistreg.js and
 * nothing in the entire frontend called it, so bio, avatar and links were
 * writable in theory and unreachable in practice.
 *
 * Second — the real blocker — an artist comes from one of two tables. Somebody
 * with an account is a row in `users` (artist = 1); somebody credited on a
 * track who has never signed up is a row in `managed_artists`. The admin list
 * UNIONed both and selected no id from either, so a row on screen could not be
 * addressed at all. `saveArtist` only ever wrote to `managed_artists`, which
 * means it could not have edited a real artist even if something had called it.
 *
 * So this file speaks one language for both: a composite id of "u:<uuid>" or
 * "m:<n>". The dashboard neither knows nor cares which table a profile lives
 * in, and adding a third source later changes one function here rather than
 * every caller.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/** [{platform,url}] and [{title,url}] are kept as JSON so the shape can grow
 *  without a migration. Parsed defensively — a corrupt blob must not take the
 *  whole artists tab down with it. */
const parseJson = (v, fallback = []) => {
  if (!v) return fallback;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : fallback; }
  catch { return fallback; }
};

const listOf = (v, keys, max = 12) =>
  (Array.isArray(v) ? v : []).slice(0, max)
    .map((x) => Object.fromEntries(keys.map((k) => [k, clean(x && x[k], k === 'url' ? 400 : 80)])))
    .filter((x) => keys.every((k) => x[k]));

/** GET /artists/profiles — every artist, both kinds, with everything editable. */
export async function listProfiles(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const accounts = await env.DB.prepare(
    `SELECT 'u:' || u.id AS pid, u.artist_name AS name, u.email, u.created_at,
            u.artist_bio AS bio, u.avatar, u.artist_links AS links, u.artist_videos AS videos,
            'account' AS kind,
            (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.managed_artist_id IS NULL) AS uploads,
            (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.managed_artist_id IS NULL AND s.status='approved') AS approved
       FROM users u WHERE u.artist = 1`
  ).all().catch(() => ({ results: [] }));

  const managed = await env.DB.prepare(
    `SELECT 'm:' || m.id AS pid, m.name, m.email, m.created_at,
            m.bio, m.avatar, m.links, m.videos,
            CASE WHEN m.claimed_user_id IS NULL THEN 'ghost' ELSE 'claimed' END AS kind,
            (SELECT COUNT(*) FROM submissions s WHERE s.managed_artist_id = m.id) AS uploads,
            (SELECT COUNT(*) FROM submissions s WHERE s.managed_artist_id = m.id AND s.status='approved') AS approved
       FROM managed_artists m`
  ).all().catch(() => ({ results: [] }));

  const shape = (r) => ({
    pid: r.pid, name: r.name || '', email: r.email || '', kind: r.kind,
    created_at: r.created_at, uploads: r.uploads, approved: r.approved,
    bio: r.bio || '', avatar: r.avatar || '',
    links: parseJson(r.links), videos: parseJson(r.videos),
  });

  const artists = [...(accounts.results || []), ...(managed.results || [])]
    .map(shape)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return json({ artists });
}

/**
 * POST /artists/profiles — save one profile, whichever table it lives in.
 *
 * Only the fields present in the body are written, so the dashboard can save a
 * single edited field without having to send back a whole profile it might be
 * holding a stale copy of.
 */
export async function saveProfile(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const pid = clean(b.pid, 60);
  const m = /^([um]):(.+)$/.exec(pid);
  if (!m) return json({ error: 'bad_pid' }, 400);
  const [, kind, id] = m;

  // Same five fields either side; only the column names differ.
  const COLS = kind === 'u'
    ? { name: 'artist_name', bio: 'artist_bio', avatar: 'avatar', links: 'artist_links', videos: 'artist_videos' }
    : { name: 'name', bio: 'bio', avatar: 'avatar', links: 'links', videos: 'videos' };

  const sets = [], vals = [];
  const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };

  if (b.name !== undefined && clean(b.name, 120).length >= 2) put(COLS.name, clean(b.name, 120));
  if (b.bio !== undefined) put(COLS.bio, clean(b.bio, 4000));
  if (b.avatar !== undefined) put(COLS.avatar, clean(b.avatar, 400));
  if (b.links !== undefined) put(COLS.links, JSON.stringify(listOf(b.links, ['platform', 'url'])));
  if (b.videos !== undefined) put(COLS.videos, JSON.stringify(listOf(b.videos, ['title', 'url'], 8)));
  // Email is the join key for a managed artist claiming their account later,
  // so it is editable on ghosts and left alone on real accounts — changing the
  // address somebody signs in with is not a profile edit.
  if (b.email !== undefined && kind === 'm') put('email', clean(b.email, 254));

  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  vals.push(kind === 'u' ? id : Number(id));

  const table = kind === 'u' ? 'users' : 'managed_artists';
  await env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'edit_artist_profile', pid,
         Object.keys(b).filter((k) => k !== 'pid').join(', '), Math.floor(Date.now() / 1000))
   .run().catch(() => null);

  return json({ ok: true, pid, fields: sets.length });
}

/**
 * PUT /artists/photo?pid= — raw image body, straight to R2.
 *
 * Same shape as the track cover upload: the browser sends bytes, the Worker
 * names the object. Letting the client choose the key would let it overwrite
 * anything in the bucket.
 */
export async function uploadArtistPhoto(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const pid = clean(url.searchParams.get('pid'), 60);
  if (!/^[um]:.+$/.test(pid)) return json({ error: 'bad_pid' }, 400);

  const type = req.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp|avif)$/.test(type)) return json({ error: 'bad_type' }, 415);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 6 * 1024 * 1024) return json({ error: 'bad_size' }, 413);

  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  // Timestamped so a replacement is never served from a stale cache under the
  // key the old one had.
  const key = `mutra/artists/${pid.replace(':', '-')}-${Date.now()}.${ext}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000' } });
  const publicUrl = `https://cdn.snowstar.company/${key}`;

  const [, k, id] = /^([um]):(.+)$/.exec(pid);
  const col = k === 'u' ? 'avatar' : 'avatar';
  const table = k === 'u' ? 'users' : 'managed_artists';
  await env.DB.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`)
    .bind(publicUrl, k === 'u' ? id : Number(id)).run();

  return json({ ok: true, url: publicUrl });
}
