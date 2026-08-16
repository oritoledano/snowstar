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
  const r = await env.DB.prepare(
    `SELECT id, title, status, review_note, size, ext, created_at, reviewed_at
       FROM submissions WHERE user_id = ? ORDER BY id DESC`
  ).bind(user.id).all();
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

/** Step 2 — the submission record (title + note), emails the owner. */
export async function createSubmission(req, env, user, ctx) {
  if (!user || !user.artist) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim().slice(0, 120);
  const key = String(b.key || '');
  if (!title) return json({ error: 'title_required' }, 400);
  if (!key.startsWith(`submissions/${user.id.slice(0, 8)}/`)) return json({ error: 'bad_key' }, 400);
  const head = await env.MEDIA.head(key);
  if (!head) return json({ error: 'file_missing' }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO submissions (user_id, title, file_key, size, ext, artist_note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(user.id, title, key, head.size, key.split('.').pop(),
         String(b.note || '').trim().slice(0, 2000), now()).run();

  ctx.waitUntil(sendMail(env, {
    to: env.ALERT_TO,
    subject: `Mutra submission: “${title}” by ${user.artist_name || user.email}`,
    text: `${user.artist_name || user.email} uploaded “${title}”.\n\nReview it: https://snowstar.company/review.html`,
  }).catch(() => {}));

  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

/** Stream a submission's audio — only to its artist or the owner. */
export async function streamSubmission(req, env, user, url) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const id = Number(url.searchParams.get('id'));
  const row = await env.DB.prepare('SELECT user_id, file_key, ext FROM submissions WHERE id = ?')
    .bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.user_id !== user.id && !user.admin) return json({ error: 'forbidden' }, 403);

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

/** Owner: the review queue. */
export async function listSubmissions(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const status = url.searchParams.get('status') || 'pending';
  const r = await env.DB.prepare(
    `SELECT s.id, s.title, s.status, s.size, s.ext, s.artist_note, s.review_note,
            s.created_at, s.reviewed_at, u.email, u.artist_name
       FROM submissions s JOIN users u ON u.id = s.user_id
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
