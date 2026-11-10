/**
 * Per-work share pages — /w/<id>.
 *
 * Selected work lives on the homepage, in a grid built by JavaScript from
 * /api/works. That is fine for someone browsing and useless for someone being
 * sent one piece: the only address was snowstar.company, so a link to the
 * Pepsi film and a link to the Goldstar film were the same link, and both
 * previewed as the same generic Snowstar card. Scrapers do not run the grid.
 *
 * So each work gets an address of its own, rendered here with its own title,
 * its own card image and the film itself on the page. A person who opens it
 * sees the work, not a homepage they then have to search. The grid is one
 * click away rather than in the way.
 *
 * The same page is what /?work=<id> on the homepage opens in the lightbox, so
 * a link shared from the site and a link typed by hand land in the same place.
 */

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const SITE = 'https://snowstar.company';
const CDN = 'https://cdn.snowstar.company';

/* thumb and mp4 are stored either repo-relative ("assets/...") or already on
   the CDN; works.js refuses anything else on the way in. Absolute is what the
   tags and the <video> need. */
const abs = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `${SITE}/${s.replace(/^\/+/, '')}`;
};

export async function workSharePage(req, env, url) {
  const raw = url.pathname.replace(/^\/w\/?/, '').replace(/\/$/, '');
  const id = Number(raw);

  /* Anything that is not a plain id goes to the grid rather than 404ing: these
     links get pasted into briefs and mail threads that outlive the work. */
  if (!Number.isInteger(id) || id <= 0) return Response.redirect(`${SITE}/#work`, 302);

  const row = await env.DB.prepare(
    'SELECT id, title, thumb, preview, mp4, vimeo, credits, media, year FROM works WHERE id = ?'
  ).bind(id).first().catch(() => null);
  if (!row) return Response.redirect(`${SITE}/#work`, 302);

  let credits = {};
  try { credits = JSON.parse(row.credits || '{}') || {}; } catch { credits = {}; }
  let media = [];
  try { media = JSON.parse(row.media || '[]') || []; } catch { media = []; }

  const title = row.title || 'Snowstar';
  const pageUrl = `${SITE}/w/${id}`;
  const img = abs(row.thumb) || `${SITE}/assets/og-snowstar.jpg`;
  const video = abs(row.mp4);

  /* The description is the credits, because that is what the person being sent
     this actually wants to know: who made it and for whom. */
  const bits = [credits.work, credits.director && `Director: ${credits.director}`,
                credits.production, credits.agency].filter(Boolean);
  const desc = bits.length
    ? `${title} — ${bits.join(' · ')}. Sound and music by Snowstar.`
    : `${title} — sound and music by Snowstar.`;

  const creditRow = (label, value) => value
    ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '';

  const player = video
    ? `<video controls playsinline preload="metadata" poster="${esc(img)}" src="${esc(video)}"></video>`
    : row.vimeo
      ? `<div class="frame"><iframe src="https://player.vimeo.com/video/${encodeURIComponent(row.vimeo)}?title=0&byline=0&portrait=0"
            allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(title)}"></iframe></div>`
      : `<img class="still" src="${esc(img)}" alt="${esc(title)}">`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Snowstar</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Snowstar.Company">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(img)}">
${video ? `<meta property="og:video" content="${esc(video)}">
<meta property="og:video:type" content="video/mp4">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="${SITE}/favicon.ico" sizes="any">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'CreativeWork',
  name: title, url: pageUrl, image: img,
  description: desc,
  ...(row.year ? { dateCreated: String(row.year) } : {}),
  creator: { '@type': 'Organization', name: 'Snowstar.Company', url: SITE },
})}
</script>
<style>
  :root{--paper:#efe9da;--ink:#16160f;--ink-2:#403a2c;--line:rgba(22,22,15,.14)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
       font:400 16px/1.6 Inter,system-ui,-apple-system,sans-serif;
       -webkit-font-smoothing:antialiased}
  .wrap{max-width:900px;margin:0 auto;padding:28px 16px 72px}
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}
  .brand{font:600 15px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;
         color:var(--ink);text-decoration:none}
  .all{font-size:14px;color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:2px}
  h1{font:600 clamp(28px,5vw,46px)/1.08 Fraunces,Georgia,serif;letter-spacing:-.01em;margin:0 0 6px}
  .meta{color:var(--ink-2);font-size:14px;margin:0 0 22px}
  video,.frame,.still{width:100%;border-radius:16px;background:#000;display:block}
  video,.still{aspect-ratio:16/9;object-fit:cover}
  .frame{position:relative;aspect-ratio:16/9;overflow:hidden}
  .frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  dl{display:grid;gap:12px 28px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
     margin:26px 0 0;padding:22px 0 0;border-top:1px solid var(--line)}
  dl div{display:block}
  dt{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);margin-bottom:3px}
  dd{margin:0;font-weight:500}
  footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);
         color:var(--ink-2);font-size:13px}
  footer a{color:inherit}
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){--paper:#16160f;--ink:#efe9da;--ink-2:rgba(239,233,218,.66);
                                    --line:rgba(239,233,218,.16)}
  }
</style>
</head><body>
<div class="wrap">
  <header>
    <a class="brand" href="${SITE}/">Snowstar</a>
    <a class="all" href="${SITE}/#work">All selected work</a>
  </header>

  <h1>${esc(title)}</h1>
  <p class="meta">${esc([media.join(' · '), row.year || ''].filter(Boolean).join(' · ')) || 'Snowstar.Company'}</p>

  ${player}

  ${bits.length ? `<dl>
    ${creditRow('Snowstar', credits.work)}
    ${creditRow('Director', credits.director)}
    ${creditRow('Production', credits.production)}
    ${creditRow('Agency', credits.agency)}
  </dl>` : ''}

  <footer>Sound and music by <a href="${SITE}/">Snowstar.Company</a>, Tel Aviv ·
    <a href="${SITE}/#work">See the rest of the work</a></footer>
</div>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /* Short, because the owner edits this list live from the dashboard and a
         renamed work should not keep previewing under its old name for a day. */
      'cache-control': 'public, max-age=300',
    },
  });
}
