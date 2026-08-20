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

function sanitize(raw) {
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
  if (raw.lane === 'instant' || raw.lane === 'quote') p.lane = raw.lane;
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
  return json({ overrides });
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
