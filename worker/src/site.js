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
  const prefixes = {};
  let total = 0, count = 0, cursor;
  do {
    const page = await env.MEDIA.list({ cursor, limit: 1000 });
    for (const o of page.objects) {
      const p = o.key.includes('/') ? o.key.split('/')[0] : '(root)';
      prefixes[p] = (prefixes[p] || 0) + (o.size || 0);
      total += o.size || 0; count++;
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);

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

  return json({
    r2: { total, count, prefixes, limit: 10 * 1024 * 1024 * 1024 },   // free tier: 10GB
    d1: { tables, limit_note: '500MB per database on the free tier' },
  });
}

export async function deleteNote(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM site_notes WHERE id = ?').bind(Number(b.id)).run();
  return json({ ok: true });
}
