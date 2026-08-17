/**
 * Artist submissions — musicians upload tracks, Ori reviews before anything
 * touches the public catalog.
 *
 * Files land in R2 under submissions/ — a prefix the public CDN never links
 * to and this API only streams to the uploader or the owner. Approval flags
 * the track for catalog ingestion (analysis, waveform, artwork happen in the
 * studio pipeline, not here); rejection keeps the file but tells the artist.
 */

import { sendMail } from './mail.js';
import { parseDeclaration, recordDeclaration } from './rights.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const AUDIO_EXT = { wav: 'audio/wav', mp3: 'audio/mpeg', aif: 'audio/aiff', aiff: 'audio/aiff',
                    flac: 'audio/flac', m4a: 'audio/mp4', ogg: 'audio/ogg' };
const MAX_BYTES = 95 * 1024 * 1024; // stay under the Workers request ceiling

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 60) || 'track';

/** Turn a signed-in member into an artist (their choice, instant). */
export async function registerArtist(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const name = String(b.artist_name || '').trim().slice(0, 80);
  if (name.length < 2) return json({ error: 'name_required' }, 400);
  await env.DB.prepare('UPDATE users SET artist = 1, artist_name = ? WHERE id = ?')
    .bind(name, user.id).run();
  return json({ ok: true, artist_name: name });
}

export async function myUploads(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  // own uploads, plus anything uploaded on their behalf before they claimed
  const r = await env.DB.prepare(
    `SELECT s.id, s.title, s.status, s.review_note, s.size, s.ext, s.created_at, s.reviewed_at
       FROM submissions s
       LEFT JOIN managed_artists m ON m.id = s.managed_artist_id
      WHERE s.user_id = ? OR m.claimed_user_id = ?
      ORDER BY s.id DESC`
  ).bind(user.id, user.id).all();
  return json({ artist: !!user.artist, artist_name: user.artist_name || null,
                uploads: r.results || [] });
}

/** Step 1 — the audio file itself. Returns the R2 key for step 2. */
export async function uploadTrack(req, env, user, url) {
  if (!user || !user.artist) return json({ error: 'unauthorized' }, 401);
  const name = String(url.searchParams.get('filename') || 'track.wav');
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!AUDIO_EXT[ext]) return json({ error: 'bad_type', accepted: Object.keys(AUDIO_EXT) }, 400);
  const size = Number(req.headers.get('content-length') || 0);
  if (!size) return json({ error: 'bad_size' }, 400);
  if (size > MAX_BYTES) return json({ error: 'too_big', max_mb: 95 }, 413);

  const key = `submissions/${user.id.slice(0, 8)}/${Date.now().toString(36)}-${slug(name.replace(/\.[^.]+$/, ''))}.${ext}`;
  await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: AUDIO_EXT[ext] } });
  return json({ ok: true, key, size, ext });
}

/** Step 2 — the submission record: title, note, signed rights declaration. */
export async function createSubmission(req, env, user, ctx) {
  if (!user || !user.artist) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim().slice(0, 120);
  const key = String(b.key || '');
  if (!title) return json({ error: 'title_required' }, 400);
  if (!key.startsWith(`submissions/${user.id.slice(0, 8)}/`)) return json({ error: 'bad_key' }, 400);
  const head = await env.MEDIA.head(key);
  if (!head) return json({ error: 'file_missing' }, 400);

  // owner uploading on behalf of a managed (ghost) artist — admin only
  let managed = null;
  if (b.managed_artist_id) {
    if (!user.admin) return json({ error: 'forbidden' }, 403);
    managed = await env.DB.prepare('SELECT id, name, email FROM managed_artists WHERE id = ?')
      .bind(Number(b.managed_artist_id)).first();
    if (!managed) return json({ error: 'managed_artist_not_found' }, 404);
  }

  let parsed;
  try {
    parsed = parseDeclaration(b, user, managed);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
  // on-behalf uploads must use the behalf declaration, and vice versa
  if (!!managed !== (parsed.decl.kind === 'behalf')) return json({ error: 'declaration_kind_mismatch' }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO submissions (user_id, title, file_key, size, ext, artist_note, status, created_at, managed_artist_id)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(user.id, title, key, head.size, key.split('.').pop(),
         String(b.note || '').trim().slice(0, 2000), now(), managed ? managed.id : null).run();

  const creditedName = managed ? managed.name : (user.artist_name || user.email);
  try {
    await recordDeclaration(env, r.meta.last_row_id, user, parsed, creditedName, title);
  } catch (e) {
    // a submission without its signed declaration must not exist — undo and fail
    await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(r.meta.last_row_id).run().catch(() => {});
    throw e;
  }

  if (!managed) {
    ctx.waitUntil(sendMail(env, {
      to: env.ALERT_TO,
      subject: `Mutra submission: “${title}” by ${creditedName}`,
      text: `${creditedName} uploaded “${title}”.\n\nReview it: https://snowstar.company/dashboard.html#submissions`,
    }).catch(() => {}));
  }

  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

/** Stream a submission's audio — only to its artist or the owner. */
export async function streamSubmission(req, env, user, url) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const id = Number(url.searchParams.get('id'));
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.file_key, s.ext, m.claimed_user_id
       FROM submissions s LEFT JOIN managed_artists m ON m.id = s.managed_artist_id
      WHERE s.id = ?`).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.user_id !== user.id && row.claimed_user_id !== user.id && !user.admin) {
    return json({ error: 'forbidden' }, 403);
  }

  const range = req.headers.get('range');
  let obj, status = 200;
  const headers = new Headers({ 'accept-ranges': 'bytes', 'cache-control': 'private, no-store' });
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const head = await env.MEDIA.head(row.file_key);
    if (!head) return json({ error: 'file_missing' }, 404);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    obj = await env.MEDIA.get(row.file_key, { range: { offset: start, length: end - start + 1 } });
    status = 206;
    headers.set('content-range', `bytes ${start}-${end}/${head.size}`);
    headers.set('content-length', String(end - start + 1));
  } else {
    obj = await env.MEDIA.get(row.file_key);
  }
  if (!obj) return json({ error: 'file_missing' }, 404);
  headers.set('content-type', AUDIO_EXT[row.ext] || 'application/octet-stream');
  return new Response(obj.body, { status, headers });
}

/**
 * Daily sweep: files uploaded to R2 but never turned into a submission
 * (abandoned staging, closed tabs) are deleted after 48 hours.
 */
export async function cleanupOrphanUploads(env) {
  try {
    const cutoff = Date.now() - 48 * 3600 * 1000;
    let cursor;
    do {
      const page = await env.MEDIA.list({ prefix: 'submissions/', cursor, limit: 500 });
      const old = page.objects.filter((o) => o.uploaded && new Date(o.uploaded).getTime() < cutoff);
      for (const o of old) {
        const used = await env.DB.prepare('SELECT 1 FROM submissions WHERE file_key = ?').bind(o.key).first();
        if (!used) await env.MEDIA.delete(o.key).catch(() => {});
      }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
  } catch (e) {
    console.error('orphan sweep', e && e.message);
  }
}

/** Owner: everyone the label works with — real artist accounts and ghosts. */
export async function listArtistsAdmin(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const real = await env.DB.prepare(
    `SELECT u.artist_name AS name, u.email, u.created_at, u.last_login_at,
            'account' AS kind,
            (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.managed_artist_id IS NULL) AS uploads,
            (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.managed_artist_id IS NULL AND s.status='approved') AS approved
       FROM users u WHERE u.artist = 1 ORDER BY u.artist_name`
  ).all();
  const ghosts = await env.DB.prepare(
    `SELECT m.name, m.email, m.created_at, NULL AS last_login_at,
            CASE WHEN m.claimed_user_id IS NULL THEN 'ghost' ELSE 'claimed' END AS kind,
            (SELECT COUNT(*) FROM submissions s WHERE s.managed_artist_id = m.id) AS uploads,
            (SELECT COUNT(*) FROM submissions s WHERE s.managed_artist_id = m.id AND s.status='approved') AS approved
       FROM managed_artists m ORDER BY m.name`
  ).all();
  return json({ artists: [...(real.results || []), ...(ghosts.results || [])] });
}

/** Owner: the review queue. */
export async function listSubmissions(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const status = url.searchParams.get('status') || 'pending';
  const r = await env.DB.prepare(
    `SELECT s.id, s.title, s.status, s.size, s.ext, s.artist_note, s.review_note,
            s.created_at, s.reviewed_at, u.email,
            COALESCE(m.name, u.artist_name) AS artist_name,
            d.kind AS decl_kind, d.signed_name, d.acum, d.splits_snapshot,
            d.evidence_kind, d.evidence_note
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN managed_artists m ON m.id = s.managed_artist_id
       LEFT JOIN rights_decls d ON d.id =
         (SELECT id FROM rights_decls WHERE submission_id = s.id AND kind != 'claim' ORDER BY id LIMIT 1)
      WHERE s.status = ? ORDER BY s.id DESC`
  ).bind(status).all();
  return json({ submissions: r.results || [] });
}

/** Owner: approve (queues for catalog ingestion) or reject, with a note. */
export async function reviewSubmission(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!['approved', 'rejected', 'pending'].includes(b.status)) return json({ error: 'bad_status' }, 400);
  const row = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  await env.DB.prepare(
    'UPDATE submissions SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?'
  ).bind(b.status, String(b.note || '').trim().slice(0, 2000), now(), id).run();
  return json({ ok: true });
}
