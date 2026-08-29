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

/* Who manages an artist. A member can upload on behalf of somebody, and more
   than one person can look after the same artist — a manager and a label, two
   halves of a duo. So this is a join table rather than the single
   claimed_user_id it replaces, and de-assigning is just deleting a row. */
async function managersFor(env, ids) {
  if (!ids.length) return {};
  const q = ids.map(() => '?').join(',');
  const r = await env.DB.prepare(
    `SELECT am.artist_id, am.user_id, u.email, u.name
       FROM artist_managers am LEFT JOIN users u ON u.id = am.user_id
      WHERE am.artist_id IN (${q})`
  ).bind(...ids).all().catch(() => ({ results: [] }));
  const out = {};
  for (const x of r.results || []) {
    (out[x.artist_id] ||= []).push({ user_id: x.user_id, email: x.email || '(deleted account)', name: x.name || '' });
  }
  return out;
}

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

  // Managers apply to managed artists only — somebody with their own account
  // manages themselves, and showing an empty list against them would imply
  // otherwise.
  const mIds = artists.filter((a) => a.pid.startsWith('m:')).map((a) => Number(a.pid.slice(2)));
  const mans = await managersFor(env, mIds);
  artists.forEach((a) => {
    a.managers = a.pid.startsWith('m:') ? (mans[Number(a.pid.slice(2))] || []) : null;
  });

  /* A ghost artist whose email matches a real account is somebody who has
     signed up since you filed them. Deliberately NOT linked automatically:
     typing an address is not proof of owning it, and linking would hand over
     that artist's tracks, earnings and declarations. So the match is surfaced
     and you approve it — which needs no table, because "unclaimed ghost whose
     email matches an account" is the pending claim. */
  const waiting = await env.DB.prepare(
    `SELECT m.id, u.id AS user_id, u.email, u.name, u.created_at
       FROM managed_artists m JOIN users u ON lower(u.email) = lower(m.email)
      WHERE m.claimed_user_id IS NULL AND m.email IS NOT NULL AND m.email <> ''`
  ).all().catch(() => ({ results: [] }));
  const byArtist = {};
  for (const w of waiting.results || []) byArtist[w.id] = w;
  artists.forEach((a) => {
    a.waiting = a.pid.startsWith('m:') ? (byArtist[Number(a.pid.slice(2))] || null) : null;
  });

  // Members who could be given an artist, for the picker.
  const members = await env.DB.prepare(
    'SELECT id, email, name FROM users ORDER BY email LIMIT 400'
  ).all().catch(() => ({ results: [] }));

  return json({ artists, members: members.results || [] });
}

/**
 * POST /artists/profiles — save one profile, whichever table it lives in.
 *
 * Only the fields present in the body are written, so the dashboard can save a
 * single edited field without having to send back a whole profile it might be
 * holding a stale copy of.
 */
export async function saveProfile(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const pid = clean(b.pid, 60);
  const m = /^([um]):(.+)$/.exec(pid);
  if (!m) return json({ error: 'bad_pid' }, 400);
  const [, kind, id] = m;
  /* An artist may edit exactly one profile: their own. Everything else — other
     members, ghost profiles, managed artists — stays the owner's. Checking the
     pid rather than adding a second endpoint keeps one implementation of the
     field rules, so self-service and admin can never drift apart. */
  if (!user.admin && !(kind === 'u' && id === user.id)) {
    return json({ error: 'forbidden' }, 403);
  }

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
  if (!user) return json({ error: 'unauthorized' }, 401);
  const pid = clean(url.searchParams.get('pid'), 60);
  if (!/^[um]:.+$/.test(pid)) return json({ error: 'bad_pid' }, 400);
  // Same rule as saveProfile: your own picture, or you are the owner.
  if (!user.admin && pid !== `u:${user.id}`) return json({ error: 'forbidden' }, 403);

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


/**
 * POST /artists/managers — { pid, email, remove? }
 *
 * Assign an artist to a member, or take them off. Both directions matter: an
 * artist uploaded by the wrong person needs moving, and a manager who has
 * parted ways needs removing without the artist or their tracks going anywhere.
 */
export async function setManager(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const pid = clean(b.pid, 60);
  const m = /^m:(\d+)$/.exec(pid);
  if (!m) return json({ error: 'managed_artists_only',
                        detail: 'Somebody with their own account manages themselves.' }, 400);
  const artistId = Number(m[1]);
  const email = clean(b.email, 254).toLowerCase();
  if (!email) return json({ error: 'no_email' }, 400);

  const target = await env.DB.prepare('SELECT id, email FROM users WHERE lower(email) = ?')
    .bind(email).first().catch(() => null);
  if (!target) return json({ error: 'no_such_account',
                             detail: 'That email has no account yet.' }, 404);

  if (b.remove) {
    await env.DB.prepare('DELETE FROM artist_managers WHERE artist_id = ? AND user_id = ?')
      .bind(artistId, target.id).run();
  } else {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO artist_managers (artist_id, user_id, added_at, added_by) VALUES (?, ?, ?, ?)'
    ).bind(artistId, target.id, Math.floor(Date.now() / 1000), user.email || 'owner').run();
  }

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', b.remove ? 'unassign_artist' : 'assign_artist',
         pid, target.email, Math.floor(Date.now() / 1000)).run().catch(() => null);

  return json({ ok: true, pid, email: target.email, removed: !!b.remove });
}

/**
 * DELETE /artists/profiles?pid= — remove a managed artist.
 *
 * Refused while they still have uploads. Deleting the artist row would leave
 * those submissions pointing at nothing: the review queue would show tracks
 * credited to a blank, and the rights declarations attached to them would name
 * a person no longer in the database. Move or delete the uploads first, and
 * the error says which.
 *
 * Only managed artists can be deleted. Somebody with an account is a member,
 * and removing a member is a different act with different consequences.
 */
export async function deleteProfile(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const pid = clean(url.searchParams.get('pid'), 60);
  const m = /^m:(\d+)$/.exec(pid);
  if (!m) {
    return json({ error: 'accounts_not_deletable',
                  detail: 'This artist has their own account. Remove them from Members instead.' }, 400);
  }
  const id = Number(m[1]);

  const n = await env.DB.prepare(
    'SELECT COUNT(*) c FROM submissions WHERE managed_artist_id = ?'
  ).bind(id).first().catch(() => ({ c: 0 }));
  if (n && n.c > 0) {
    return json({ error: 'has_uploads', uploads: n.c,
                  detail: `This artist still has ${n.c} upload${n.c === 1 ? '' : 's'}. `
                        + 'Reassign or delete those first — deleting the artist now would leave '
                        + 'them credited to nobody.' }, 409);
  }

  const row = await env.DB.prepare('SELECT name FROM managed_artists WHERE id = ?')
    .bind(id).first().catch(() => null);
  await env.DB.prepare('DELETE FROM artist_managers WHERE artist_id = ?').bind(id).run().catch(() => null);
  await env.DB.prepare('DELETE FROM managed_artists WHERE id = ?').bind(id).run();

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'delete_artist', pid, (row && row.name) || '',
         Math.floor(Date.now() / 1000)).run().catch(() => null);

  return json({ ok: true, pid, name: (row && row.name) || '' });
}


/**
 * POST /artists/claim — link a premade artist to the account that signed up.
 *
 * The one step that cannot be automatic. linkOnSignIn already does this for a
 * Google sign-in, where the provider has verified the address; for a password
 * account nothing has, and the code refuses on purpose. This is the owner
 * saying "yes, that is them", which is the verification.
 *
 * Once linked, the artist sees their tracks and the countersigning flow that
 * was already built for them starts working.
 */
export async function approveClaim(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const m = /^m:(\d+)$/.exec(clean(b.pid, 60));
  if (!m) return json({ error: 'bad_pid' }, 400);
  const id = Number(m[1]);

  const row = await env.DB.prepare(
    `SELECT m.id, m.name, m.email, u.id AS user_id, u.email AS user_email
       FROM managed_artists m JOIN users u ON lower(u.email) = lower(m.email)
      WHERE m.id = ? AND m.claimed_user_id IS NULL`
  ).bind(id).first().catch(() => null);
  if (!row) return json({ error: 'no_match',
                          detail: 'No account signed up with that email, or it is already linked.' }, 404);

  await env.DB.batch([
    env.DB.prepare('UPDATE managed_artists SET claimed_user_id = ? WHERE id = ? AND claimed_user_id IS NULL')
      .bind(row.user_id, id),
    // artist_name only if they have not set one — their own wins over ours.
    env.DB.prepare('UPDATE users SET artist = 1, artist_name = COALESCE(artist_name, ?) WHERE id = ?')
      .bind(row.name, row.user_id),
    env.DB.prepare(
      'INSERT OR IGNORE INTO artist_managers (artist_id, user_id, added_at, added_by) VALUES (?, ?, ?, ?)'
    ).bind(id, row.user_id, Math.floor(Date.now() / 1000), user.email || 'owner'),
  ]);

  await env.DB.prepare(
    `INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, created_at)
     VALUES (?, ?, ?, ?, 'artists', ?)`
  ).bind(row.user_email, row.name || null, 'Your Mutra profile is ready',
    `Hello${row.name ? ' ' + row.name : ''},\n\n`
    + `Your artist profile on Mutra is now linked to this account. Sign in and you will see `
    + `the tracks filed under your name, and anything waiting for your signature.\n\nSnowstar`,
    Math.floor(Date.now() / 1000)).run().catch(() => null);

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'approve_artist_claim', 'm:' + id, row.user_email,
         Math.floor(Date.now() / 1000)).run().catch(() => null);

  return json({ ok: true, pid: 'm:' + id, linked: row.user_email });
}


/** GET /artist/profile — the signed-in artist's own profile, for their editor. */
export async function myProfile(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const r = await env.DB.prepare(
    `SELECT id, artist_name, artist_bio, avatar, artist_links, artist_videos
       FROM users WHERE id = ?`).bind(user.id).first();
  if (!r) return json({ error: 'not_found' }, 404);
  const parse = (v) => { try { return JSON.parse(v || '[]') || []; } catch { return []; } };
  return json({
    pid: `u:${r.id}`,
    name: r.artist_name || '',
    bio: r.artist_bio || '',
    avatar: r.avatar || '',
    links: parse(r.artist_links),
    videos: parse(r.artist_videos),
  });
}
