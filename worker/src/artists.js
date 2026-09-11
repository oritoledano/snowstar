/**
 * Artist submissions — musicians upload tracks, Ori reviews before anything
 * touches the public catalog.
 *
 * Files land in R2 under submissions/ — a prefix the public CDN never links
 * to and this API only streams to the uploader or the owner. Approval flags
 * the track for catalog ingestion (analysis, waveform, artwork happen in the
 * studio pipeline, not here); rejection keeps the file but tells the artist.
 */

import { sendMail, mailFrom, mailTo } from './mail.js';
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
    // meta and lane come back too: without them the artist's edit form has
    // nothing to prefill and no way to show why a track is quote-only.
    `SELECT s.id, s.title, s.status, s.review_note, s.size, s.ext, s.created_at,
            s.reviewed_at, s.meta, s.lane, s.published_slug
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
    `INSERT INTO submissions (user_id, title, file_key, size, ext, artist_note, status, created_at, managed_artist_id, lane, meta)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).bind(user.id, title, key, head.size, key.split('.').pop(),
         String(b.note || '').trim().slice(0, 2000), now(), managed ? managed.id : null,
         // anything the uploader doesn't wholly own or control is bookable but
         // never self-serve; the server decides rather than trusting the client
         (parsed.decl.kind === 'solo' && !(parsed.controllers || []).length) ? 'instant' : 'quote',
         /* Measured tempo, key, voice, lyrics, tags and links, as the uploader
            left them. Stored as JSON rather than columns because it is a
            suggestion sheet that will grow, and it is read once at publish
            time — not something to query across. */
         (() => { try { return b.meta ? JSON.stringify(b.meta).slice(0, 8000) : null; }
                  catch { return null; } })()).run();

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
      to: mailTo(env, 'submissions'),
      from: mailFrom(env, 'submissions'),
      subject: `Mutra submission: “${title}” by ${creditedName}`,
      text: `${creditedName} uploaded “${title}”.\n\nReview it: https://snowstar.company/dashboard.html#submissions`,
    }).catch(() => {}));
  }

  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

/**
 * PATCH a submission the artist already sent — title and the metadata sheet.
 *
 * Deliberately narrow. An artist can correct what a track IS: its name, tempo,
 * key, voice, tags, lyrics, links. They cannot touch status, lane, file_key or
 * the rights declaration — those are the record of a decision somebody else
 * made, or of something they signed, and letting an edit form rewrite either
 * would make the declaration worthless as evidence.
 *
 * The ownership test is the same one streamSubmission uses, including the
 * claimed-managed-artist case: somebody who claimed a ghost profile owns the
 * uploads that were made for them.
 */
export async function updateSubmission(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);

  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.meta, m.claimed_user_id
       FROM submissions s LEFT JOIN managed_artists m ON m.id = s.managed_artist_id
      WHERE s.id = ?`).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.user_id !== user.id && row.claimed_user_id !== user.id && !user.admin) {
    return json({ error: 'forbidden' }, 403);
  }

  const sets = [], vals = [];
  if (b.title !== undefined) {
    const t = String(b.title).trim().slice(0, 120);
    if (t.length < 1) return json({ error: 'title_required' }, 400);
    sets.push('title = ?'); vals.push(t);
  }
  if (b.meta !== undefined) {
    // Merged, not replaced: the form may only carry the fields it shows, and a
    // partial save must not silently drop lyrics or links it never rendered.
    let prev = {};
    try { prev = JSON.parse(row.meta || '{}') || {}; } catch { /* older rows */ }
    const merged = { ...prev, ...(b.meta && typeof b.meta === 'object' ? b.meta : {}) };
    sets.push('meta = ?'); vals.push(JSON.stringify(merged).slice(0, 8000));
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);

  vals.push(id);
  await env.DB.prepare(`UPDATE submissions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const back = await env.DB.prepare('SELECT id, title, meta FROM submissions WHERE id = ?')
    .bind(id).first();
  return json({ ok: true, submission: back });
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
    // s.meta carries what the uploader actually told us — tags, bpm, key, vocal,
    // streaming links. It was written at submit and never read back, which is why
    // reviewing a track showed none of it.
    `SELECT s.id, s.title, s.status, s.size, s.ext, s.artist_note, s.review_note, s.meta,
            s.created_at, s.reviewed_at, u.email,
            COALESCE(m.name, u.artist_name) AS artist_name,
            d.kind AS decl_kind, d.signed_name, d.acum, d.splits_snapshot,
            d.evidence_kind, d.evidence_note, d.controllers, s.lane, s.published_slug,
            (SELECT json_group_array(json_object('name', c.name, 'email', c.email,
               'share_bp', c.share_bp, 'status', c.status))
               FROM collaborators c WHERE c.submission_id = s.id) AS collabs
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
import { trashObject } from './trash.js';

export async function reviewSubmission(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!['approved', 'rejected', 'pending'].includes(b.status)) return json({ error: 'bad_status' }, 400);
  const row = await env.DB.prepare('SELECT id, file_key, status FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  const note = String(b.note || '').trim().slice(0, 2000);
  await env.DB.prepare(
    'UPDATE submissions SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?'
  ).bind(b.status, note, now(), id).run();

  // Tell the artist. Until now a decision was invisible from their side: they
  // uploaded, and then nothing — no approval, no rejection, no reason. It goes
  // through mail_outbox rather than straight out, because that queue is the
  // owner's "nothing is sent without me" gate and a status email is exactly the
  // kind of thing worth reading before it leaves.
  /* …unless the owner says not to. Sorting a backlog is not the same act as
     answering an artist: re-filing a stem, fixing a mis-tag, or approving the
     twelve tracks already discussed in a meeting should not fire twelve emails.
     `notify:false` records the decision and sends nothing. The default stays
     ON, so silence is always a choice someone made. */
  const notify = b.notify !== false;
  if (b.status !== 'pending' && notify) {
    try { await queueReviewMail(env, id, b.status, note); }
    catch { /* the decision is recorded either way */ }
  }

  /* A rejected upload's audio used to sit in the live bucket forever — off the
     catalogue but still stored, still billed, still fetchable by key. It moves
     to trash/ rather than being deleted, because rejections get reversed. */
    let trashed = null;
  if (b.status === 'rejected' && row.file_key && row.status !== 'rejected') {
    try { trashed = await trashObject(env, row.file_key); } catch { /* keep the decision */ }
  }
  return json({ ok: true, notified: notify && b.status !== 'pending',
                trashed: trashed && trashed.moved ? trashed.to : null });
}

async function queueReviewMail(env, submissionId, status, note) {
  // The address can come from either side: an uploader with an account, or a
  // managed artist someone filed on behalf of. Prefer the account — that is the
  // person who pressed upload and is waiting for an answer.
  const s = await env.DB.prepare(
    `SELECT sub.title,
            u.email  AS user_email,  u.name AS user_name,
            ma.email AS artist_email, ma.name AS artist_name
       FROM submissions sub
       LEFT JOIN users u            ON u.id  = sub.user_id
       LEFT JOIN managed_artists ma ON ma.id = sub.managed_artist_id
      WHERE sub.id = ?`
  ).bind(submissionId).first().catch(() => null);
  if (!s) return;
  const to = s.user_email || s.artist_email;
  if (!to) return;

  const who = s.user_name || s.artist_name || '';
  const title = s.title || 'your track';
  const approved = status === 'approved';

  const subject = approved
    ? `“${title}” is approved for Mutra`
    : `About “${title}”`;

  const body = approved
    ? `Hi${who ? ' ' + who : ''},

“${title}” has been approved for the Mutra catalogue.
${note ? '\n' + note + '\n' : ''}
It is not live yet — approval means it is queued to be prepared: analysed, given a
waveform and artwork, and added to the catalogue. We will email you again when it
is up and licensable.

Your rights declaration is on file as you submitted it. If anything about the
splits or the controlling parties changes, tell us and we will amend it.

— Snowstar
snowstar.company/mutra.html`
    : `Hi${who ? ' ' + who : ''},

We are not able to take “${title}” into the Mutra catalogue.

${note}

This is not a judgement of the track — most of the time it is about fit with what
the catalogue is being asked for, or something unresolved in the rights. If you
think we have it wrong, reply to this email and we will look again.

You are welcome to submit other work.

— Snowstar
snowstar.company/mutra.html`;

  await env.DB.prepare(
    `INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, submission_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(to, who, subject, body,
         approved ? 'submission-approved' : 'submission-rejected',
         submissionId, Math.floor(Date.now() / 1000)).run();
}

/* ═══════════ Bulk review ═══════════════════════════════════════════════════
   One artist arriving with thirty tracks is the normal case, not the edge, and
   deciding them one dialog at a time is how a backlog becomes a month old.

   This is deliberately a LOOP over the same reviewSubmission logic rather than
   a clever single UPDATE: every decision must still queue its own mail and move
   its own rejected audio to trash, and a bulk path that skipped either would
   quietly break the two things the single path exists to guarantee. */
export async function bulkReview(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
  if (!ids.length) return json({ error: 'no_ids' }, 400);
  if (!['approved', 'rejected', 'pending'].includes(b.status)) return json({ error: 'bad_status' }, 400);
  const note = String(b.note || '').trim().slice(0, 2000);

  const done = [], failed = [];
  for (const id of ids) {
    try {
      const row = await env.DB.prepare('SELECT id, file_key, status FROM submissions WHERE id = ?')
        .bind(id).first();
      if (!row) { failed.push({ id, why: 'not_found' }); continue; }
      await env.DB.prepare(
        'UPDATE submissions SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?'
      ).bind(b.status, note, now(), id).run();
      if (b.status !== 'pending') {
        if (b.notify !== false) {
          try { await queueReviewMail(env, id, b.status, note); } catch { /* decision stands */ }
        }
      }
      if (b.status === 'rejected' && row.file_key && row.status !== 'rejected') {
        try { await trashObject(env, row.file_key); } catch { /* decision stands */ }
      }
      done.push(id);
    } catch (e) {
      failed.push({ id, why: String((e && e.message) || e).slice(0, 120) });
    }
  }
  try {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.email || 'owner', 'bulk_review', b.status,
           `${done.length} of ${ids.length}`, now()).run();
  } catch { /* logging must not fail the batch */ }
  return json({ ok: true, done, failed });
}

/* ═══════════ Bulk edit of submissions ══════════════════════════════════════
   The catalogue already has a bulk editor (bulk.js) but it writes
   track_overrides, which only exist AFTER a track is published. Everything an
   artist sends arrives before that, so titles and notes have to be fixable
   while the rows are still submissions — which is exactly when a batch of
   thirty needs the most work. */
export async function bulkEditSubmissions(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const edits = Array.isArray(b.edits) ? b.edits.slice(0, 200) : [];
  if (!edits.length) return json({ error: 'no_edits' }, 400);

  const saved = [];
  for (const e of edits) {
    const id = Number(e.id);
    if (!Number.isInteger(id)) continue;
    const sets = [], vals = [];
    if (typeof e.title === 'string' && e.title.trim()) {
      sets.push('title = ?'); vals.push(e.title.trim().slice(0, 200));
    }
    if (e.lane === 'instant' || e.lane === 'quote' || e.lane === 'demo') {
      sets.push('lane = ?'); vals.push(e.lane);
    }
    /* meta is the free-form bag the review screen already reads (tags, bpm,
       key, lyrics). Merged, never replaced: a bulk pass that set only titles
       must not wipe the analysis somebody ran this morning. */
    if (e.meta && typeof e.meta === 'object') {
      const cur = await env.DB.prepare('SELECT meta FROM submissions WHERE id = ?').bind(id).first();
      let merged = {};
      try { merged = cur && cur.meta ? JSON.parse(cur.meta) : {}; } catch { merged = {}; }
      Object.assign(merged, e.meta);
      sets.push('meta = ?'); vals.push(JSON.stringify(merged).slice(0, 20000));
    }
    if (!sets.length) continue;
    vals.push(id);
    try {
      await env.DB.prepare(`UPDATE submissions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      saved.push(id);
    } catch { /* skip the row, keep the batch */ }
  }
  return json({ ok: true, saved });
}


/* ═══════════ Ask the artist a question ════════════════════════════════════
   Between "approve" and "reject" sits the real answer most of the time: I need
   to know something first. Who actually sings on this? Is any of it AI? Is the
   sample cleared? Without this the only ways to ask were to reject the track or
   to leave the dashboard and write an email by hand — so the question got
   skipped and the track sat in the queue.

   The question is stored ON the submission, not just mailed, so that:
     • the artist sees it on their uploads page and can answer in place,
     • the answer lands back in the dashboard next to the track,
     • and the thread survives whoever forgot they had asked.                  */
export async function askSubmission(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const question = String(b.question || '').trim().slice(0, 1200);
  if (!question) return json({ error: 'no_question' }, 400);

  const s = await env.DB.prepare(
    `SELECT sub.id, sub.title, sub.meta,
            u.email  AS user_email,  u.name AS user_name,
            ma.email AS artist_email, ma.name AS artist_name
       FROM submissions sub
       LEFT JOIN users u            ON u.id  = sub.user_id
       LEFT JOIN managed_artists ma ON ma.id = sub.managed_artist_id
      WHERE sub.id = ?`).bind(id).first();
  if (!s) return json({ error: 'not_found' }, 404);

  let meta = {};
  try { meta = JSON.parse(s.meta || '{}') || {}; } catch { meta = {}; }
  const thread = Array.isArray(meta.questions) ? meta.questions : [];
  const qid = `q${Date.now().toString(36)}`;
  thread.push({ qid, q: question, asked_at: now(), asked_by: user.email || 'owner', a: null });
  meta.questions = thread.slice(-20);

  // Asking moves the track OUT of the undecided pile and into "waiting on them",
  // otherwise the queue count lies about how much is actually yours to do.
  await env.DB.prepare(
    "UPDATE submissions SET meta = ?, status = 'info', review_note = ? WHERE id = ?"
  ).bind(JSON.stringify(meta), question, id).run();

  const to = s.user_email || s.artist_email;
  const who = s.user_name || s.artist_name || '';
  let mailed = false;
  if (to && b.notify !== false) {
    const title = s.title || 'your track';
    await env.DB.prepare(
      `INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, submission_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(to, who,
      `A question about \u201c${title}\u201d`,
      `Hi${who ? ' ' + who : ''},

Before we can take \u201c${title}\u201d further, one thing to check:

${question}

Reply to this email, or answer it on your uploads page:
snowstar.company/artists.html#uploads

Nothing is rejected \u2014 the track is just on hold until we have this.

\u2014 Snowstar
snowstar.company/mutra.html`,
      'submission-question', id, Math.floor(Date.now() / 1000)).run();
    mailed = true;
  }
  return json({ ok: true, qid, mailed, questions: meta.questions });
}

/** POST /artist/answer — the artist's side of the same thread. */
export async function answerSubmission(req, env, user) {
  if (!user) return json({ error: 'auth' }, 401);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const answer = String(b.answer || '').trim().slice(0, 2000);
  if (!answer) return json({ error: 'no_answer' }, 400);

  /* Their own upload only — a submission id is a guessable integer, and the
     question thread would otherwise be writable by any logged-in account. */
  const row = await env.DB.prepare(
    `SELECT sub.id, sub.meta, sub.title, sub.user_id
       FROM submissions sub WHERE sub.id = ? AND sub.user_id = ?`
  ).bind(id, user.id).first();
  if (!row) return json({ error: 'not_found' }, 404);

  let meta = {};
  try { meta = JSON.parse(row.meta || '{}') || {}; } catch { meta = {}; }
  const thread = Array.isArray(meta.questions) ? meta.questions : [];
  const open = b.qid ? thread.find(q => q.qid === b.qid) : [...thread].reverse().find(q => !q.a);
  if (!open) return json({ error: 'nothing_asked' }, 400);
  open.a = answer; open.answered_at = now();
  meta.questions = thread;

  await env.DB.prepare(
    "UPDATE submissions SET meta = ?, status = 'pending' WHERE id = ?"
  ).bind(JSON.stringify(meta), id).run();

  /* Back to me, not to them: an answer is only useful if it reaches the queue.
     The thread itself lives on the submission (the dashboard reads it there and
     badges the row) — this is just the audit trail. */
  try {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.email || String(user.id), 'submission_answer', String(id),
           answer.slice(0, 400), Math.floor(Date.now() / 1000)).run();
  } catch { /* the answer is saved on the submission regardless */ }
  return json({ ok: true });
}
