/**
 * Catalog overrides — the owner's edits to a catalog that ships as a static file.
 *
 * js/mutra-data.js is generated from the master Dropbox folders and committed;
 * the browser can't write to it. So edits live here as a per-slug PATCH which
 * the page merges over the shipped record at load. Two consequences worth
 * knowing: regenerating mutra-data.js never clobbers an edit, and "reset to
 * original" is just deleting the row rather than reconstructing anything.
 *
 * Reads are public (every visitor needs the same corrected catalog); writes
 * are owner-only, same gate as the site text editor.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

/** Only these may be overridden — an unknown key is dropped rather than
 *  rejected, so a newer page can post fields an older worker doesn't know. */
const STRING_FIELDS = ['title', 'artist', 'key', 'scale', 'vocal', 'cover'];
const LIST_FIELDS = ['genres', 'moods', 'instruments', 'packages'];

const clean = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);

// Exported so bulk.js runs edits through EXACTLY the same validation as a
// single-track save. Two sanitizers would drift, and the one that drifted would
// be the one nobody tested.
export function sanitize(raw) {
  const p = {};
  for (const f of STRING_FIELDS) {
    if (raw[f] === undefined) continue;
    const v = clean(raw[f], f === 'cover' ? 400 : 120);
    if (v) p[f] = v;
  }
  for (const f of LIST_FIELDS) {
    if (raw[f] === undefined) continue;
    if (!Array.isArray(raw[f])) continue;
    p[f] = [...new Set(raw[f].map((x) => clean(x, 60)).filter(Boolean))].slice(0, 24);
  }
  if (raw.bpm !== undefined) {
    const n = Math.round(Number(raw.bpm));
    if (Number.isFinite(n) && n > 0 && n < 400) p.bpm = n;
  }
  if (raw.hidden !== undefined) p.hidden = !!raw.hidden;
  // per-use-type prices, in ILS. A missing key falls back to the catalogue
  // default, so a track only stores what actually differs from the norm.
  if (raw.prices && typeof raw.prices === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(raw.prices)) {
      const key = clean(k, 30);
      const n = Math.round(Number(v));
      if (key && Number.isFinite(n) && n >= 0 && n < 1e7) out[key] = n;
    }
    p.prices = out;
  }
  if (raw.fee !== undefined) {
    const n = Math.round(Number(raw.fee));
    if (Number.isFinite(n) && n >= 0 && n < 1e7) p.fee = n;
  }
  if (raw.lyrics !== undefined) {
    const v = String(raw.lyrics).trim().slice(0, 8000);
    if (v) p.lyrics = v;
  }
  // who did what — role plus name, in the order the owner arranged them
  if (Array.isArray(raw.credits)) {
    p.credits = raw.credits.slice(0, 30).map((c) => ({
      role: clean(c.role, 40),
      name: clean(c.name, 120),
    })).filter((c) => c.role && c.name);
  }
  if (raw.lane === 'instant' || raw.lane === 'quote') p.lane = raw.lane;
  // Price class: A / B / C. C is the baseline and the same as absent, so it is
  // stored rather than dropped — an explicit C is the owner saying "I looked at
  // this one", which is different from never having graded it.
  // A per-track percentage overrides the class outright — the letter is a
  // preset, not a cage. Bounded for the same reason the class multipliers are:
  // it multiplies every band and every term at once.
  if (raw.pct !== undefined) {
    const n = Math.round(Number(raw.pct));
    if (Number.isFinite(n) && n >= 10 && n <= 2000) p.pct = n;
    else delete p.pct;
  }
  if (typeof raw.cls === 'string') {
    const c = raw.cls.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(c)) p.cls = c;
    else if (c === '') delete p.cls;
  }
  // highlight window, as [start, end] fractions of the track
  if (Array.isArray(raw.hl) && raw.hl.length === 2) {
    let [a, b] = raw.hl.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      a = Math.min(Math.max(a, 0), 1);
      b = Math.min(Math.max(b, 0), 1);
      if (b > a + 0.005) p.hl = [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4];
    }
  }
  return p;
}

/** Public: every visitor merges these over the shipped catalog. */
export async function listOverrides(env) {
  const r = await env.DB.prepare('SELECT slug, patch FROM track_overrides').all();
  const overrides = {};
  for (const row of r.results || []) {
    try { overrides[row.slug] = JSON.parse(row.patch); } catch { /* skip a corrupt row rather than break the catalog */ }
  }

  /* Which tracks are pinned to the quote lane by a signed declaration.
     The lane is otherwise a free toggle — plenty of tracks are quote-worthy for
     commercial reasons that have nothing to do with rights — but where somebody
     has DECLARED that a label, publisher or co-owner has a say, an owner must
     not be able to click past it. A legal fact is not a preference. */
  const locked = [];
  try {
    const d = await env.DB.prepare(
      `SELECT s.published_slug AS slug, rd.controllers
         FROM rights_decls rd
         JOIN submissions s ON s.id = rd.submission_id
        WHERE s.published_slug IS NOT NULL AND s.published_slug <> ''`
    ).all();
    for (const row of d.results || []) {
      let ctrl = [];
      try {
        const parsed = JSON.parse(row.controllers || '{}');
        ctrl = Array.isArray(parsed) ? parsed : (parsed.controllers || []);
      } catch { /* a corrupt declaration must not lock or unlock anything */ }
      if (ctrl.length) locked.push(row.slug);
    }
  } catch { /* pre-migration schema — nothing is locked rather than everything */ }

  return json({ overrides, laneLocked: locked });
}

/** Owner-only. An empty patch deletes the row, i.e. reverts to the source file. */
export async function saveOverride(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug || '');
  if (!SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);

  const patch = sanitize(b.patch && typeof b.patch === 'object' ? b.patch : {});
  if (!Object.keys(patch).length) {
    await env.DB.prepare('DELETE FROM track_overrides WHERE slug = ?').bind(slug).run();
    return json({ ok: true, reset: true });
  }
  await env.DB.prepare(
    `INSERT INTO track_overrides (slug, patch, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET patch = excluded.patch, updated_at = excluded.updated_at`
  ).bind(slug, JSON.stringify(patch), now()).run();
  return json({ ok: true, patch });
}

/** Owner-only: replace a track's cover art. Body is the raw image. */
export async function uploadCover(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const slug = String(url.searchParams.get('slug') || '');
  if (!SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);
  const type = req.headers.get('content-type') || '';
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!ext) return json({ error: 'unsupported_type' }, 415);
  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > 8 * 1024 * 1024) return json({ error: 'bad_size' }, 400);

  // versioned key so a replacement is never served from a stale cache — the
  // override carries the new URL, so the old object can stay put harmlessly
  const key = `mutra/covers/${slug}-${now()}.${ext}`;
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  return json({ ok: true, url: `https://cdn.snowstar.company/${key}` });
}


/* ═══════════ Where a track has been used before ═══════════

   A sync library's most persuasive fact about a track is not its tempo, it is
   that it has already carried a national campaign. "Shorditch 14" was written
   for Plus 500 / Atletico Madrid and later placed on April Perfumes — that
   history sells the track, and it is also the thing the owner most needs at
   hand when a buyer asks whether it has been used before, because an exclusive
   cannot be sold over a placement nobody remembered.

   Kept as rows rather than a text field so the same track can carry several,
   each dated, and so a year can be filtered on later. */

const USE_MAX = 40;

export async function listUses(env, url) {
  const slug = String(url.searchParams.get('slug') || '').trim();
  if (slug && !SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);
  const r = slug
    ? await env.DB.prepare(
        'SELECT * FROM track_uses WHERE slug = ? ORDER BY year DESC, id DESC LIMIT ?'
      ).bind(slug, USE_MAX).all()
    : await env.DB.prepare(
        'SELECT * FROM track_uses ORDER BY year DESC, id DESC LIMIT 500'
      ).all();
  return json({ uses: r.results || [] });
}

export async function saveUse(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  if (b.remove) {
    const id = Number(b.remove);
    if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
    await env.DB.prepare('DELETE FROM track_uses WHERE id = ?').bind(id).run();
    return json({ ok: true, removed: id });
  }

  const slug = String(b.slug || '').trim();
  if (!SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);
  const client = clean(b.client, 140);
  if (!client) return json({ error: 'client_required' }, 400);
  const yr = Number(b.year);
  const year = Number.isInteger(yr) && yr >= 1990 && yr <= 2100 ? yr : null;

  const r = await env.DB.prepare(
    'INSERT INTO track_uses (slug, client, project, year, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(slug, client, clean(b.project, 200), year, clean(b.note, 500), now()).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

/** Owner: the original title a track shipped with, so a renamed one is still
 *  recognisable. Only meaningful for the catalogue that was imported in bulk —
 *  anything uploaded since was named once, by the person who made it. */
export async function setOrigTitle(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug || '').trim();
  if (!SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);
  await env.DB.prepare('UPDATE tracks SET orig_title = ? WHERE slug = ?')
    .bind(clean(b.orig_title, 200), slug).run();
  return json({ ok: true });
}

/** Public: slug -> the name it shipped with, where that differs from now.
 *  Only the differences travel; sending 374 identical pairs would be pure
 *  weight on every page load. */
export async function listOrigTitles(env) {
  const r = await env.DB.prepare(
    'SELECT slug, orig_title FROM tracks WHERE orig_title IS NOT NULL'
  ).all().catch(() => ({ results: [] }));
  const out = {};
  for (const row of r.results || []) out[row.slug] = row.orig_title;
  return json({ orig: out });
}
