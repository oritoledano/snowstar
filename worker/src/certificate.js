/**
 * The licence certificate.
 *
 * What a licensee actually needs after paying is something they can forward.
 * A row in an account panel is proof to us; a document with the track, the
 * project, the term and a reference on it is proof to their client, their
 * producer, or whoever asks six months later why this music is in the edit.
 *
 * It is an SVG, not a PNG, and that is deliberate. Workers have no rasteriser,
 * so making a PNG would mean either a paid browser-rendering binding or a
 * third-party image service — a dependency and a cost for a document nobody
 * needs at a specific pixel size. An SVG opens in any browser, prints to PDF
 * from the same window, embeds in a document, and stays sharp at any size. The
 * one thing it does not do is preview inline in an email client, which is why
 * the email links to it rather than attaching it.
 *
 * Everything on it is read back from the granted row. Nothing is recomputed:
 * a certificate that disagreed with the licence would be worse than none.
 */

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDate = (ts) => ts
  ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  : null;

/** Wrap a long line so it cannot run off the page. SVG has no text flow, so
 *  this is done by hand rather than left to overflow invisibly. */
function wrap(text, perLine) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export function certificateSvg(lic, track) {
  const title = track && track.title ? track.title : lic.slug;
  const artist = track && track.artist ? track.artist : '';
  const granted = fmtDate(lic.granted_at);
  const starts = fmtDate(lic.starts_at);
  const expires = fmtDate(lic.expires_at);
  const revoked = !!lic.revoked_at;

  const rows = [
    ['Track', title + (artist ? ` — ${artist}` : '')],
    ['Licensee', lic.licensee_name || lic.email || ''],
    ['Project', lic.project_name || '—'],
    ['Use', lic.scope_text || lic.tier || ''],
    ['Granted', granted],
    ['Term', expires ? `${starts} to ${expires}` : 'No end date'],
    ['Reference', lic.ref],
  ].filter(([, v]) => v);

  const scopeLines = wrap(
    'This licence covers the one project named above and no other. A second project '
    + 'requires a second licence, even for the same track and the same client.', 78);

  const termLines = expires
    ? wrap(`When the term ends on ${expires}, so does the right to use the track — including in `
      + 'material already published. Renew before that date and nothing changes.', 78)
    : wrap('This licence does not expire. It covers organic use — the licensee’s own site, '
      + 'social pages and channels — and does not cover paid promotion of the project.', 78);

  let y = 232;
  const rowSvg = rows.map(([k, v]) => {
    const out = `<text x="64" y="${y}" class="k">${esc(k)}</text>`
              + `<text x="210" y="${y}" class="v">${esc(v)}</text>`;
    y += 34;
    return out;
  }).join('');

  const bodyY = y + 22;
  const scopeSvg = scopeLines.map((l, i) =>
    `<text x="64" y="${bodyY + i * 21}" class="p">${esc(l)}</text>`).join('');
  const termY = bodyY + scopeLines.length * 21 + 18;
  const termSvg = termLines.map((l, i) =>
    `<text x="64" y="${termY + i * 21}" class="p">${esc(l)}</text>`).join('');
  const footY = termY + termLines.length * 21 + 46;
  const height = footY + 70;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="${height}"
     viewBox="0 0 820 ${height}" role="img" aria-label="Mutra licence ${esc(lic.ref)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4e7d6"/><stop offset="1" stop-color="#e8c9a0"/>
    </linearGradient>
  </defs>
  <style>
    .k{font:500 12px/1.4 "Helvetica Neue",Arial,sans-serif;fill:#8a8072;letter-spacing:.09em;text-transform:uppercase}
    .v{font:400 15px/1.4 "Helvetica Neue",Arial,sans-serif;fill:#1a1712}
    .p{font:400 13px/1.6 "Helvetica Neue",Arial,sans-serif;fill:#4a4238}
    .h{font:700 30px/1.1 "Helvetica Neue",Arial,sans-serif;fill:#1a1712;letter-spacing:-.01em}
    .kick{font:600 11px/1 "Helvetica Neue",Arial,sans-serif;fill:#a08a68;letter-spacing:.22em}
    .foot{font:400 11px/1.5 "Helvetica Neue",Arial,sans-serif;fill:#9a9184}
    .void{font:700 62px/1 "Helvetica Neue",Arial,sans-serif;fill:#c0392b;opacity:.18}
  </style>
  <rect width="820" height="${height}" fill="#fdfbf7"/>
  <rect x="0" y="0" width="820" height="6" fill="url(#g)"/>
  <rect x="32" y="32" width="756" height="${height - 64}" fill="none" stroke="#e6ded1" stroke-width="1" rx="10"/>

  <text x="64" y="98" class="kick">MUTRA · SNOWSTAR.COMPANY</text>
  <text x="64" y="140" class="h">Licence certificate</text>
  <line x1="64" y1="176" x2="756" y2="176" stroke="#e6ded1" stroke-width="1"/>

  ${rowSvg}
  ${scopeSvg}
  ${termSvg}

  <line x1="64" y1="${footY - 24}" x2="756" y2="${footY - 24}" stroke="#e6ded1" stroke-width="1"/>
  <text x="64" y="${footY}" class="foot">Full terms: snowstar.company/terms.html · Verify this certificate by quoting ${esc(lic.ref)} to licensing@snowstar.company</text>
  ${revoked ? `<text x="410" y="${Math.round(height / 2)}" class="void" text-anchor="middle"
      transform="rotate(-18 410 ${Math.round(height / 2)})">REVOKED</text>` : ''}
</svg>`;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * GET /licence/certificate?ref=…
 *
 * Readable by the licensee, and by the owner. Deliberately NOT public: the
 * certificate carries a licensee's name and their project, and a reference is
 * guessable enough that an open endpoint would leak both.
 */
export async function certificate(req, env, user) {
  const ref = String(new URL(req.url).searchParams.get('ref') || '').trim();
  if (!/^[A-Z0-9][A-Z0-9-]{4,60}$/.test(ref)) return json({ error: 'bad_ref' }, 400);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const lic = await env.DB.prepare('SELECT * FROM licences WHERE ref = ?').bind(ref).first();
  if (!lic) return json({ error: 'not_found' }, 404);
  if (!user.admin && lic.user_id !== user.id && lic.email !== user.email) {
    return json({ error: 'forbidden' }, 403);
  }

  const track = await env.DB.prepare('SELECT title FROM tracks WHERE slug = ?')
    .bind(lic.slug).first().catch(() => null);

  return new Response(certificateSvg(lic, track), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-disposition': `inline; filename="mutra-licence-${ref}.svg"`,
    },
  });
}
