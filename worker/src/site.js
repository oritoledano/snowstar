/**
 * Site editor backing — inline text overrides and the owner's markup notes.
 *
 * Texts: only OVERRIDES live here, keyed to data-txt attributes in the HTML.
 * An element with no row keeps its built-in copy, so the table stays tiny and
 * a fresh page never flashes for unedited text. Saving an empty string deletes
 * the override (back to the built-in default).
 *
 * Notes: the pencil/pin layer. Coordinates are document-relative fractions
 * plus a nearby-text snippet so a note can be located even when the layout
 * reflows on another screen. Notes are private to the owner — and to Claude,
 * who reads the open ones and does the work they describe.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/* The slash is here because section visibility is keyed by page path —
   `sections.hidden./` on the homepage, `sections.hidden./artists.html`
   elsewhere. Without it every save of that panel was rejected as a bad key and
   the client reported nothing, so hiding a section looked like it worked until
   the next reload. The key is only ever a bound D1 parameter, never a path or
   a filename, so widening the class costs nothing. */
const KEY_RE = /^[a-z0-9][a-z0-9./-]{1,80}$/;

export async function listTexts(env) {
  const r = await env.DB.prepare('SELECT key, html FROM site_texts').all();
  const texts = {};
  for (const row of r.results || []) texts[row.key] = row.html;
  return json({ texts });
}

export async function saveText(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const key = String(b.key || '');
  if (!KEY_RE.test(key)) return json({ error: 'bad_key' }, 400);
  const html = String(b.html || '').slice(0, 20000);

  if (!html.trim()) {
    await env.DB.prepare('DELETE FROM site_texts WHERE key = ?').bind(key).run();
    return json({ ok: true, reset: true });
  }
  await env.DB.prepare(
    `INSERT INTO site_texts (key, html, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET html = excluded.html, updated_at = excluded.updated_at`
  ).bind(key, html, now()).run();
  return json({ ok: true });
}

export async function listNotes(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const page = url.searchParams.get('page');
  const status = url.searchParams.get('status') || 'open';
  const q = page
    ? env.DB.prepare('SELECT * FROM site_notes WHERE page = ? AND status = ? ORDER BY id').bind(page, status)
    : env.DB.prepare('SELECT * FROM site_notes WHERE status = ? ORDER BY id').bind(status);
  const r = await q.all();
  return json({ notes: r.results || [] });
}

export async function saveNote(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const t = now();

  if (b.id) {
    // status flips and note edits; nothing else changes after creation
    const id = Number(b.id);
    const status = ['open', 'done'].includes(b.status) ? b.status : null;
    const note = typeof b.note === 'string' ? b.note.slice(0, 4000) : null;
    const row = await env.DB.prepare('SELECT id FROM site_notes WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'not_found' }, 404);
    if (status) await env.DB.prepare('UPDATE site_notes SET status = ?, updated_at = ? WHERE id = ?').bind(status, t, id).run();
    if (note !== null) await env.DB.prepare('UPDATE site_notes SET note = ?, updated_at = ? WHERE id = ?').bind(note, t, id).run();
    return json({ ok: true, id });
  }

  const page = String(b.page || '').slice(0, 80);
  if (!page.startsWith('/')) return json({ error: 'bad_page' }, 400);
  const note = String(b.note || '').slice(0, 4000);
  const drawing = String(b.drawing || '').slice(0, 60000);
  if (!note.trim() && !drawing) return json({ error: 'empty' }, 400);
  const r = await env.DB.prepare(
    `INSERT INTO site_notes (page, x, y, vw, near, note, drawing, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(page, Number(b.x) || 0, Number(b.y) || 0, Math.round(Number(b.vw)) || 0,
         String(b.near || '').slice(0, 300), note, drawing, t, t).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

/**
 * Infrastructure usage for the dashboard: every byte in R2 summed by product
 * prefix, plus the D1 database size. (~1.3k objects — two list calls.)
 */
export async function storageReport(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  /* Every bucket, not just MEDIA. The free allowance is 10 GB across the
     ACCOUNT, so a report that counted one bucket could say "fine" while the
     bill said otherwise — which is exactly what it was doing. */
  const buckets = [
    ['media', env.MEDIA], ['masters', env.MASTERS], ['apps', env.APPS],
  ].filter(([, b]) => b);

  const out = {}, prefixes = {};
  let total = 0, count = 0;
  /* Reclaimable, counted while we are already walking the keys:
       trash/…            rejected uploads, kept in case a rejection is reversed
       superseded covers  every cover upload writes a NEW versioned key and the
                          old object was left behind on purpose — harmless once,
                          a slow leak over a year of re-artworking. */
  const trash = { bytes: 0, count: 0 };
  const covers = new Map();               // slug -> [{key, size, ts}]

  for (const [name, bucket] of buckets) {
    let bTotal = 0, bCount = 0, cursor;
    do {
      const page = await bucket.list({ cursor, limit: 1000 });
      for (const o of page.objects) {
        const size = o.size || 0;
        bTotal += size; bCount++;
        if (name === 'media') {
          const p = o.key.includes('/') ? o.key.split('/')[0] : '(root)';
          prefixes[p] = (prefixes[p] || 0) + size;
          if (o.key.startsWith('trash/')) { trash.bytes += size; trash.count++; }
          const m = /^mutra\/covers\/(.+)-(\d{9,})\.(jpg|png|webp)$/.exec(o.key);
          if (m) {
            if (!covers.has(m[1])) covers.set(m[1], []);
            covers.get(m[1]).push({ key: o.key, size, ts: Number(m[2]) });
          }
        }
      }
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
    out[name] = { bytes: bTotal, count: bCount };
    total += bTotal; count += bCount;
  }

  /* Raw uploads are the largest class in the bucket and the least obvious —
     nothing on the site serves them, they are the artist's original file kept
     in case it is needed again. Split by what the upload turned into, because
     the answer to "can this go?" is completely different for each. */
  let uploads = { total: 0, stems: 0, fulls: 0, rejected: 0, pending: 0,
                  stem_files: 0, rejected_files: 0 };
  try {
    const r = await env.DB.prepare(
      `SELECT s.size AS size, s.status AS status, s.published_slug AS slug,
              (SELECT COUNT(*) FROM track_stacks ts WHERE ts.child_slug = s.published_slug) AS is_child
         FROM submissions s
        WHERE s.file_key IS NOT NULL AND s.file_key <> ''
          AND COALESCE(json_extract(s.meta, '$.raw_pruned'), 0) = 0`).all();
    for (const row of r.results || []) {
      const size = row.size || 0;
      uploads.total += size;
      if (row.status === 'rejected') { uploads.rejected += size; uploads.rejected_files++; }
      else if (!row.slug) uploads.pending += size;
      else if (row.is_child) { uploads.stems += size; uploads.stem_files++; }
      else uploads.fulls += size;
    }
  } catch { /* pre-migration: report nothing rather than a wrong number */ }

  let staleCovers = { bytes: 0, count: 0 };
  for (const versions of covers.values()) {
    if (versions.length < 2) continue;
    versions.sort((a, b) => b.ts - a.ts);
    for (const v of versions.slice(1)) { staleCovers.bytes += v.size; staleCovers.count++; }
  }

  // D1 refuses size pragmas (SQLITE_AUTH), so report row counts per table —
  // more readable anyway, and `events` is the only one that really grows
  let tables = {};
  try {
    const names = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'").all();
    for (const { name } of names.results || []) {
      const c = await env.DB.prepare(`SELECT COUNT(*) n FROM "${name}"`).first();
      tables[name] = c.n;
    }
  } catch { /* leave empty */ }

  const LIMIT = 10 * 1024 * 1024 * 1024;
  return json({
    r2: {
      total, count, prefixes, buckets: out, limit: LIMIT,
      over: Math.max(0, total - LIMIT),
      /* R2 bills storage per GB-month beyond the allowance. Reported so the
         number in the dashboard is a cost, not a scare. */
      overage_usd_month: Math.round(Math.max(0, total - LIMIT) / (1024 ** 3) * 0.015 * 1000) / 1000,
      uploads,
      reclaimable: { trash, staleCovers,
                     bytes: trash.bytes + staleCovers.bytes,
                     count: trash.count + staleCovers.count },
    },
    d1: { tables, limit_note: '500MB per database on the free tier' },
  });
}

/**
 * POST /storage/reclaim — delete what is provably dead weight.
 *
 * Two kinds only, and neither is a judgement call:
 *   trash/…            rejected audio, older than the grace window
 *   superseded covers  a cover whose slug has a newer version on disk
 *
 * Nothing else is touched. Deleting from R2 is not reversible, so the rule has
 * to be one that cannot be wrong about what it is deleting.
 */
export async function storageReclaim(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const doTrash = b.trash !== false;
  const doCovers = b.covers !== false;
  /* Two more classes, both opt-IN because both destroy an artist's original
     file rather than a derivative:
       stems      the raw upload behind a stem or an alternate cut. The published
                  master, stream copy and watermarked preview all survive, so the
                  track stays licensable — what goes is the ability to re-render
                  it from source one day.
       rejected   the upload behind a decision of "no", once it is old enough
                  that the decision is unlikely to be revisited. */
  const doStems = b.stems === true;
  const doRejected = b.rejected === true;
  const graceDays = Number.isFinite(Number(b.grace_days)) ? Number(b.grace_days) : 30;
  const cutoff = Date.now() / 1000 - graceDays * 86400;

  /* Every cover key anything still points at. A versioned key is only an
     orphan if NOTHING references it — and "newest wins" is not good enough on
     its own: uploading a cover writes the file immediately but the pointer is
     only saved when the owner presses save, so a later orphan can sit on disk
     while the live artwork is an earlier one. Deleting by timestamp alone would
     take the live cover and keep the abandoned upload. */
  const inUse = new Set();
  try {
    const rows = await env.DB.prepare('SELECT patch FROM track_overrides').all();
    for (const r of rows.results || []) {
      const hay = String(r.patch || '');
      for (const m of hay.matchAll(/mutra\/covers\/[A-Za-z0-9._~\-]+/g)) inUse.add(m[0]);
    }
  } catch { /* if the table cannot be read, the guard below refuses to delete */ }
  const guardReadable = inUse.size > 0;

  const covers = new Map();
  const trashKeys = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ cursor, limit: 1000, include: ['httpMetadata'] });
    for (const o of page.objects) {
      if (doTrash && o.key.startsWith('trash/')) {
        const uploaded = o.uploaded ? new Date(o.uploaded).getTime() / 1000 : 0;
        if (uploaded && uploaded < cutoff) trashKeys.push({ key: o.key, size: o.size || 0 });
      }
      const m = /^mutra\/covers\/(.+)-(\d{9,})\.(jpg|png|webp)$/.exec(o.key);
      if (doCovers && m) {
        if (!covers.has(m[1])) covers.set(m[1], []);
        covers.get(m[1]).push({ key: o.key, size: o.size || 0, ts: Number(m[2]) });
      }
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);

  const doomed = [...trashKeys];
  let spared = 0, skippedCovers = null;
  /* No references readable means no way to tell an orphan cover from the live
     one, so the cover sweep is abandoned — but ONLY the cover sweep. Returning
     here, as this did at first, silently cancelled the trash and upload sweeps
     too and reported "0 freed" as if there had been nothing to free. */
  const sweepCovers = doCovers && guardReadable;
  if (doCovers && !guardReadable) skippedCovers = 'no_references_readable';
  for (const versions of sweepCovers ? covers.values() : []) {
    if (versions.length < 2) continue;
    versions.sort((a, b2) => b2.ts - a.ts);
    for (const v of versions.slice(1)) {        // keep the newest…
      if (inUse.has(v.key)) { spared++; continue; }   // …and anything still pointed at
      doomed.push(v);
    }
  }

  if (doStems || doRejected) {
    const graceCut = Math.floor(Date.now() / 1000) - graceDays * 86400;
    const rows = await env.DB.prepare(
      `SELECT s.id, s.file_key, s.size, s.status, s.published_slug AS slug, s.reviewed_at,
              (SELECT COUNT(*) FROM track_stacks ts WHERE ts.child_slug = s.published_slug) AS is_child
         FROM submissions s
        WHERE s.file_key IS NOT NULL AND s.file_key <> ''
          AND COALESCE(json_extract(s.meta, '$.raw_pruned'), 0) = 0`).all();
    for (const r of rows.results || []) {
      const stem = doStems && r.status === 'approved' && r.slug && r.is_child;
      // A rejection made this week is still being argued about. Only sweep the
      // ones old enough that nobody is coming back to them.
      const rej = doRejected && r.status === 'rejected'
                  && r.reviewed_at && r.reviewed_at < graceCut;
      if (!stem && !rej) continue;
      doomed.push({ key: r.file_key, size: r.size || 0, sub_id: r.id });
    }
  }

  let freed = 0, deleted = 0;
  const pruned = [];
  for (const d of doomed) {
    try {
      await env.MEDIA.delete(d.key);
      freed += d.size; deleted++;
      if (d.sub_id) pruned.push(d.sub_id);
    } catch { /* skip, keep going */ }
  }
  /* Flag the row, or the dashboard shows a player for a file that is gone and
     the tidying looks like breakage. */
  for (const id of pruned) {
    try {
      await env.DB.prepare(
        `UPDATE submissions SET meta = json_patch(COALESCE(NULLIF(meta,''),'{}'),
           json_object('raw_pruned', 1, 'raw_pruned_why',
             'Original upload deleted to free storage. The published master, stream copy and watermarked preview are intact.'))
         WHERE id = ?`).bind(id).run();
    } catch { /* the file is gone either way */ }
  }
  try {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.email || 'owner', 'storage_reclaim', String(deleted),
           `${Math.round(freed / 1048576)}MB freed`, Math.floor(Date.now() / 1000)).run();
  } catch { /* logging must not fail the sweep */ }
  return json({ ok: true, deleted, freed, spared, pruned: pruned.length,
                ...(skippedCovers ? { skipped_covers: skippedCovers } : {}) });
}

export async function deleteNote(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM site_notes WHERE id = ?').bind(Number(b.id)).run();
  return json({ ok: true });
}
