/**
 * Portfolio works — the Work grid's data, editable by the owner.
 *
 * The grid used to live in js/data.js, which meant every change was a git
 * commit and a Pages build. Now the list lives in D1 and the files in R2
 * (public at cdn.snowstar.company), so edits in the admin UI are live the
 * moment they're saved.
 *
 * GET  /works            public — ordered list
 * POST /works            admin  — create (no id) or update (with id)
 * POST /works/reorder    admin  — {ids: [...]} full new order
 * POST /works/delete     admin  — {id}; also removes this work's R2 files
 * PUT  /works/upload     admin  — ?key=work/...|work-thumbs/... raw body → R2
 */

const CDN = 'https://cdn.snowstar.company/';
const now = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const MEDIA_TAGS = new Set(['TV', 'DIGITAL', 'RADIO', 'IN_APP']);
const WORK_TAGS = new Set(['ORIGINAL_MUSIC', 'SOUND_DESIGN', 'VOICE_OVER', 'PERFORMANCE', 'KAYMA']);
const CREDIT_KEYS = ['work', 'production', 'agency', 'director'];

const rowOut = (r) => ({
  id: r.id,
  title: r.title,
  thumb: r.thumb || undefined,
  preview: r.preview || undefined,
  mp4: r.mp4 || undefined,
  vimeo: r.vimeo || undefined,
  credits: JSON.parse(r.credits || '{}'),
  tags: JSON.parse(r.tags || '[]'),
  media: JSON.parse(r.media || '[]'),
});

export async function listWorks(env) {
  const r = await env.DB.prepare(
    'SELECT id, title, thumb, preview, mp4, vimeo, credits, tags, media FROM works ORDER BY position'
  ).all();
  return json({ works: (r.results || []).map(rowOut) });
}

/** Accept only our own asset locations — repo-relative or our CDN. */
function cleanUrl(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (s.startsWith('assets/') || s.startsWith(CDN)) return s.slice(0, 500);
  return null;
}

/** Best-effort removal of our own R2 objects (never touches repo assets). */
function dropCdnFiles(env, ctx, urls) {
  ctx.waitUntil((async () => {
    for (const u of urls) {
      if (u && u.startsWith(CDN)) {
        const key = u.slice(CDN.length);
        if (/^(work|work-thumbs|clients)\//.test(key)) await env.MEDIA.delete(key).catch(() => {});
      }
    }
  })());
}

export async function saveWork(req, env, user, ctx) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) return json({ error: 'title_required' }, 400);

  const credits = {};
  for (const k of CREDIT_KEYS) {
    const v = String((b.credits || {})[k] || '').trim().slice(0, 300);
    if (v) credits[k] = v;
  }
  const tags = (Array.isArray(b.tags) ? b.tags : []).filter((t) => WORK_TAGS.has(t));
  const media = (Array.isArray(b.media) ? b.media : []).filter((t) => MEDIA_TAGS.has(t));
  const thumb = cleanUrl(b.thumb);
  const preview = cleanUrl(b.preview);
  const mp4 = cleanUrl(b.mp4);
  const vimeo = /^\d{6,12}$/.test(String(b.vimeo || '')) ? Number(b.vimeo) : null;
  const t = now();

  if (b.id) {
    const id = Number(b.id);
    const old = await env.DB.prepare('SELECT thumb, preview, mp4 FROM works WHERE id = ?').bind(id).first();
    if (!old) return json({ error: 'not_found' }, 404);
    await env.DB.prepare(
      `UPDATE works SET title=?, thumb=?, preview=?, mp4=?, vimeo=?, credits=?, tags=?, media=?, updated_at=? WHERE id=?`
    ).bind(title, thumb, preview, mp4, vimeo, JSON.stringify(credits),
           JSON.stringify(tags), JSON.stringify(media), t, id).run();
    // a replaced upload leaves its old file orphaned in R2 — drop it
    dropCdnFiles(env, ctx, [
      old.thumb !== thumb && old.thumb,
      old.preview !== preview && old.preview,
      old.mp4 !== mp4 && old.mp4,
    ].filter(Boolean));
    return json({ ok: true, id });
  }

  // new works land on top; the owner drags them where they belong
  await env.DB.prepare('UPDATE works SET position = position + 1').run();
  const r = await env.DB.prepare(
    `INSERT INTO works (position, title, thumb, preview, mp4, vimeo, credits, tags, media, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, thumb, preview, mp4, vimeo, JSON.stringify(credits),
         JSON.stringify(tags), JSON.stringify(media), t).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function reorderWorks(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
  if (!ids.length || ids.length > 500) return json({ error: 'invalid' }, 400);
  const count = await env.DB.prepare('SELECT COUNT(*) n FROM works').first();
  if (ids.length !== count.n || new Set(ids).size !== ids.length) {
    return json({ error: 'must_include_every_work_exactly_once' }, 400);
  }
  await env.DB.batch(ids.map((id, i) =>
    env.DB.prepare('UPDATE works SET position = ? WHERE id = ?').bind(i + 1, id)));
  return json({ ok: true });
}

export async function deleteWork(req, env, user, ctx) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const row = await env.DB.prepare('SELECT thumb, preview, mp4 FROM works WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  await env.DB.prepare('DELETE FROM works WHERE id = ?').bind(id).run();
  // R2 files this work owned go with it; repo assets are left alone
  dropCdnFiles(env, ctx, [row.thumb, row.preview, row.mp4]);
  return json({ ok: true });
}

/* ═══ client logos — same shape, shared by both sites' marquees ═══
   `tone` is '' for the standard white-ink marks (inverted on Mutra's light
   theme) or 'mixed' for logos that keep their own colors. */

export async function listLogos(env) {
  const r = await env.DB.prepare(
    'SELECT id, url, tone, label FROM client_logos ORDER BY position'
  ).all();
  return json({ logos: r.results || [] });
}

export async function saveLogo(req, env, user, ctx) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const url = cleanUrl(b.url);
  const tone = b.tone === 'mixed' ? 'mixed' : '';
  const label = String(b.label || '').trim().slice(0, 80);
  const t = now();

  if (b.id) {
    const id = Number(b.id);
    const old = await env.DB.prepare('SELECT url FROM client_logos WHERE id = ?').bind(id).first();
    if (!old) return json({ error: 'not_found' }, 404);
    if (!url) return json({ error: 'url_required' }, 400);
    await env.DB.prepare('UPDATE client_logos SET url=?, tone=?, label=?, updated_at=? WHERE id=?')
      .bind(url, tone, label, t, id).run();
    if (old.url !== url) dropCdnFiles(env, ctx, [old.url]);
    return json({ ok: true, id });
  }

  if (!url) return json({ error: 'url_required' }, 400);
  const max = await env.DB.prepare('SELECT COALESCE(MAX(position),0) m FROM client_logos').first();
  const r = await env.DB.prepare(
    'INSERT INTO client_logos (position, url, tone, label, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(max.m + 1, url, tone, label, t).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function reorderLogos(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
  const count = await env.DB.prepare('SELECT COUNT(*) n FROM client_logos').first();
  if (ids.length !== count.n || new Set(ids).size !== ids.length) {
    return json({ error: 'must_include_every_logo_exactly_once' }, 400);
  }
  await env.DB.batch(ids.map((id, i) =>
    env.DB.prepare('UPDATE client_logos SET position = ? WHERE id = ?').bind(i + 1, id)));
  return json({ ok: true });
}

export async function deleteLogo(req, env, user, ctx) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT url FROM client_logos WHERE id = ?').bind(Number(b.id)).first();
  if (!row) return json({ error: 'not_found' }, 404);
  await env.DB.prepare('DELETE FROM client_logos WHERE id = ?').bind(Number(b.id)).run();
  dropCdnFiles(env, ctx, [row.url]);
  return json({ ok: true });
}

const UPLOAD_TYPES = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

export async function uploadWorkFile(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const key = url.searchParams.get('key') || '';
  // owner-supplied filename, but keep the namespace and characters strict
  if (!/^(work|work-thumbs|clients)\/[a-z0-9][a-z0-9._-]{0,120}\.(mp4|webm|mov|jpe?g|png|webp)$/.test(key)) {
    return json({ error: 'bad_key' }, 400);
  }
  const size = Number(req.headers.get('content-length') || 0);
  if (!size || size > 800 * 1024 * 1024) return json({ error: 'bad_size' }, 400);

  const ext = key.split('.').pop().toLowerCase();
  await env.MEDIA.put(key, req.body, {
    httpMetadata: { contentType: UPLOAD_TYPES[ext] || 'application/octet-stream' },
  });
  return json({ ok: true, url: CDN + key });
}
