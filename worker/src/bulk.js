/**
 * Bulk catalogue edits.
 *
 * 374 tracks, one owner, and every tag and price to validate by hand. Editing
 * one track at a time is not slow, it is undoable-in-practice: nobody finishes.
 *
 * Three decisions shape this file, and each of them is about the same fear —
 * that one click quietly wrecks the catalogue:
 *
 *   DRY RUN FIRST. Every request can ask for the diff without writing. The UI
 *   is expected to show that diff and make the owner press again. "Set lane to
 *   quote on 312 tracks" is not a sentence anyone should be able to execute by
 *   accident.
 *
 *   ADD, REMOVE and REPLACE ARE DIFFERENT OPERATIONS. Conflating them is the
 *   classic bulk-tag bug: the owner means "also tag these as cinematic" and the
 *   tool hears "these are cinematic and nothing else", erasing work that took
 *   weeks. So they are three named fields, and replace has to be asked for by
 *   name.
 *
 *   EVERY BATCH IS UNDOABLE. Before writing, the previous patch of every
 *   affected track is snapshotted under a batch id. Undo restores exactly those
 *   rows — including deleting rows that did not exist before, so undo of a
 *   create is a delete rather than an empty patch.
 *
 * Partial failure is reported, never swallowed: the response says which slugs
 * were written and which were not, and a batch that failed halfway is still
 * undoable, because the snapshot is taken up front.
 */

import { sanitize } from './catalog.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

/** One batch cannot touch more than this. The catalogue is 374 tracks, so this
 *  is not a throttle — it is a guard against a bug sending 100k slugs. */
const MAX_SLUGS = 1000;

/** Tag fields that support add/remove/replace. */
const TAG_FIELDS = ['genres', 'moods', 'instruments', 'packages'];
/** Scalar fields a bulk set may write. Deliberately NOT title or artist: those
 *  are per-track facts, and setting them in bulk is always a mistake. */
const SET_FIELDS = ['lane', 'hidden', 'vocal', 'key', 'scale', 'bpm'];

const clean = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);
const tagList = (v) =>
  Array.isArray(v) ? [...new Set(v.map((x) => clean(x, 60)).filter(Boolean))].slice(0, 40) : [];

/** Case-insensitive tag matching, because "Cinematic" and "cinematic" are the
 *  same tag to a human and a bulk remove that misses on case is worse than
 *  useless — it looks like it worked. */
const keyOf = (t) => t.toLowerCase();

/**
 * Apply one track's worth of operations to its existing patch.
 * Pure: takes the current patch and the merged track record, returns the next
 * patch. Nothing here touches the database, which is what makes the dry run
 * and the real run provably identical.
 */
function applyOps(current, track, ops) {
  const next = { ...current };

  // ── scalars ──────────────────────────────────────────────────────────────
  if (ops.set && typeof ops.set === 'object') {
    for (const [k, v] of Object.entries(ops.set)) {
      if (!SET_FIELDS.includes(k)) continue;
      if (v === null) { delete next[k]; continue; }   // null means "clear the override"
      next[k] = v;
    }
  }

  // ── tags: three distinct verbs ───────────────────────────────────────────
  if (ops.tags && typeof ops.tags === 'object') {
    for (const field of TAG_FIELDS) {
      const op = ops.tags[field];
      if (!op || typeof op !== 'object') continue;

      // Start from what the track ACTUALLY shows — the merged value — not from
      // the patch. A track with no override has its tags in the shipped file,
      // and adding to an empty patch would silently drop them.
      let list = next[field] !== undefined ? tagList(next[field])
               : tagList(track[field]);

      if (Array.isArray(op.replace)) {
        list = tagList(op.replace);
      } else {
        if (Array.isArray(op.remove)) {
          const drop = new Set(tagList(op.remove).map(keyOf));
          list = list.filter((t) => !drop.has(keyOf(t)));
        }
        if (Array.isArray(op.add)) {
          const have = new Set(list.map(keyOf));
          for (const t of tagList(op.add)) {
            if (!have.has(keyOf(t))) { list.push(t); have.add(keyOf(t)); }
          }
        }
        // rename is add+remove done atomically, which is the operation the
        // owner actually wants when a tag is misspelt across 60 tracks
        if (op.rename && op.rename.from && op.rename.to) {
          const from = keyOf(clean(op.rename.from, 60));
          const to = clean(op.rename.to, 60);
          const have = new Set(list.map(keyOf));
          list = list.filter((t) => keyOf(t) !== from);
          if (to && !list.some((t) => keyOf(t) === keyOf(to))) list.push(to);
          void have;
        }
      }
      next[field] = list.slice(0, 24);
    }
  }

  // ── prices ───────────────────────────────────────────────────────────────
  if (ops.prices && typeof ops.prices === 'object') {
    const base = { ...(next.prices || track.prices || {}) };
    if (ops.prices.set && typeof ops.prices.set === 'object') {
      for (const [tier, v] of Object.entries(ops.prices.set)) {
        const n = Math.round(Number(v));
        if (v === null) { delete base[clean(tier, 30)]; continue; }
        if (Number.isFinite(n) && n >= 0 && n < 1e7) base[clean(tier, 30)] = n;
      }
    }
    // A percentage move is the operation that needs the dry run most: it is the
    // one where the owner cannot predict the result by reading the form.
    if (Number.isFinite(Number(ops.prices.scalePct))) {
      const f = 1 + Number(ops.prices.scalePct) / 100;
      for (const k of Object.keys(base)) {
        const n = Math.round(base[k] * f);
        if (Number.isFinite(n) && n >= 0 && n < 1e7) base[k] = n;
      }
    }
    // round to a real price point, e.g. nearest 10 shekels
    if (Number.isFinite(Number(ops.prices.roundTo)) && Number(ops.prices.roundTo) > 0) {
      const r = Number(ops.prices.roundTo);
      for (const k of Object.keys(base)) base[k] = Math.round(base[k] / r) * r;
    }
    if (Object.keys(base).length) next.prices = base; else delete next.prices;
  }

  return sanitize(next);
}

/** What changed, field by field — this is what the owner reads before pressing
 *  the second button, so it has to be legible rather than complete. */
function diffOf(before, after) {
  const out = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const k of keys) {
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) out.push({ field: k, from: before[k] ?? null, to: after[k] ?? null });
  }
  return out;
}

/**
 * POST /tracks/bulk
 *   { slugs: [...], ops: {...}, dryRun: true|false, note: "..." }
 *
 * Returns the per-track diff either way. dryRun writes nothing.
 */
export async function bulkEdit(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  const slugs = [...new Set((Array.isArray(b.slugs) ? b.slugs : [])
    .map((s) => String(s || '')).filter((s) => SLUG_RE.test(s)))];
  if (!slugs.length) return json({ error: 'no_slugs' }, 400);
  if (slugs.length > MAX_SLUGS) return json({ error: 'too_many', max: MAX_SLUGS }, 400);

  const ops = (b.ops && typeof b.ops === 'object') ? b.ops : null;
  if (!ops) return json({ error: 'no_ops' }, 400);

  // The current patches, and the shipped values the page merges them over. The
  // client sends the latter because only it has mutra-data.js — but it is used
  // ONLY as the base for tag maths, never as an amount or a permission.
  const rows = await env.DB.prepare(
    `SELECT slug, patch FROM track_overrides WHERE slug IN (${slugs.map(() => '?').join(',')})`
  ).bind(...slugs).all();
  const existing = new Map();
  for (const r of rows.results || []) {
    try { existing.set(r.slug, JSON.parse(r.patch)); } catch { existing.set(r.slug, {}); }
  }
  const shipped = (b.base && typeof b.base === 'object') ? b.base : {};

  const results = [];
  for (const slug of slugs) {
    const before = existing.get(slug) || {};
    const track = { ...(shipped[slug] || {}), ...before };
    let after;
    try { after = applyOps(before, track, ops); }
    catch { results.push({ slug, error: 'apply_failed' }); continue; }
    const changes = diffOf(before, after);
    results.push({ slug, changes, changed: changes.length > 0, after });
  }

  const changing = results.filter((r) => r.changed);
  if (b.dryRun !== false) {
    return json({
      ok: true, dryRun: true,
      considered: slugs.length,
      willChange: changing.length,
      results: results.map(({ after, ...r }) => r),   // the diff, not the payload
    });
  }

  // ── the write ────────────────────────────────────────────────────────────
  const batch = `b${now()}-${Math.abs(hash(slugs.join(',') + JSON.stringify(ops)))}`;
  const t = now();

  // Snapshot FIRST, and snapshot every affected track including the ones with
  // no row yet — undo has to be able to delete those, not leave an empty patch
  // behind. Taking it up front is what makes a half-failed batch undoable.
  try {
    for (const r of changing) {
      const prev = existing.has(r.slug) ? JSON.stringify(existing.get(r.slug)) : null;
      await env.DB.prepare(
        'INSERT INTO catalog_snapshots (batch, slug, prev_patch, ts, actor, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(batch, r.slug, prev, t, String(user.id), clean(b.note, 200)).run();
    }
  } catch (e) {
    // No snapshot means no undo, and no undo means we do not write.
    return json({ error: 'snapshot_failed', detail: String(e).slice(0, 200) }, 500);
  }

  const written = [], failed = [];
  for (const r of changing) {
    try {
      if (!Object.keys(r.after).length) {
        await env.DB.prepare('DELETE FROM track_overrides WHERE slug = ?').bind(r.slug).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO track_overrides (slug, patch, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET patch = excluded.patch, updated_at = excluded.updated_at`
        ).bind(r.slug, JSON.stringify(r.after), t).run();
      }
      written.push(r.slug);
    } catch (e) {
      failed.push({ slug: r.slug, error: String(e).slice(0, 120) });
    }
  }

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(String(user.id), 'catalog.bulk', batch,
         `${written.length} written, ${failed.length} failed; ops=${JSON.stringify(ops).slice(0, 500)}`,
         t).run().catch(() => {});

  return json({
    ok: true, batch,
    considered: slugs.length,
    written: written.length,
    failed,
    results: results.map(({ after, ...r }) => r),
  });
}

/** POST /tracks/bulk/undo  { batch }  — restores exactly what the batch changed. */
export async function bulkUndo(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const batch = clean(b.batch, 80);
  if (!batch) return json({ error: 'no_batch' }, 400);

  const rows = await env.DB.prepare(
    'SELECT slug, prev_patch FROM catalog_snapshots WHERE batch = ?'
  ).bind(batch).all();
  const snap = rows.results || [];
  if (!snap.length) return json({ error: 'unknown_batch' }, 404);

  const t = now();
  let restored = 0, failed = 0;
  for (const r of snap) {
    try {
      if (r.prev_patch == null) {
        // there was no override before this batch — undo means removing the row
        await env.DB.prepare('DELETE FROM track_overrides WHERE slug = ?').bind(r.slug).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO track_overrides (slug, patch, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET patch = excluded.patch, updated_at = excluded.updated_at`
        ).bind(r.slug, r.prev_patch, t).run();
      }
      restored++;
    } catch { failed++; }
  }
  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(String(user.id), 'catalog.bulk.undo', batch, `${restored} restored, ${failed} failed`, t)
   .run().catch(() => {});

  return json({ ok: true, restored, failed });
}

/** GET /tracks/bulk/batches — recent batches, so undo is reachable later too. */
export async function listBatches(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT batch, COUNT(*) AS tracks, MIN(ts) AS ts, MIN(note) AS note
       FROM catalog_snapshots GROUP BY batch ORDER BY ts DESC LIMIT 40`
  ).all();
  return json({ batches: r.results || [] });
}

/** Cheap, stable, non-cryptographic — this only has to make a batch id unique
 *  within a second, not resist anything. */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}
