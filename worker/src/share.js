/**
 * Per-track share pages.
 *
 * A shared track link used to be mutra.html?track=<slug> — a query string on a
 * static page. Scrapers do not run JavaScript and do not care about the query,
 * so every one of 376 tracks previewed as the same generic Mutra card. The link
 * told you nothing about what you were being sent.
 *
 * So track links get their own URL, /t/<slug>, served here with tags specific
 * to that track and its own card image. A scraper reads the tags and stops. A
 * person is sent straight on to the catalogue with the track open — the page
 * they actually wanted, not a landing page in between.
 */

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const SITE = 'https://snowstar.company';
const CDN = 'https://cdn.snowstar.company';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export async function sharePage(req, env, url) {
  const slug = url.pathname.replace(/^\/t\/?/, '').replace(/\/$/, '').toLowerCase();
  const target = `${SITE}/mutra.html?track=${encodeURIComponent(slug)}`;
  if (!SLUG_RE.test(slug)) return Response.redirect(`${SITE}/mutra.html`, 302);

  const row = await env.DB.prepare('SELECT slug, title FROM tracks WHERE slug = ?')
    .bind(slug).first().catch(() => null);

  // An unknown slug still redirects rather than 404s: these links get pasted
  // into places that keep them for years, and a dead end is worse than the
  // catalogue.
  if (!row) return Response.redirect(target, 302);

  // Overrides can have renamed the track since it shipped, and the share card
  // should say what the site says.
  let title = row.title;
  let artist = 'Ori Toledano';
  try {
    const o = await env.DB.prepare('SELECT patch FROM track_overrides WHERE slug = ?')
      .bind(slug).first();
    if (o && o.patch) {
      const p = JSON.parse(o.patch);
      if (p.title) title = p.title;
      if (p.artist) artist = p.artist;
    }
  } catch { /* the shipped title is fine */ }

  const img = `${CDN}/og/${slug}.jpg`;
  const desc = `${title} by ${artist}. Royalty-free and truly cleared — preview and licence it on Mutra.`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} — Mutra by Snowstar</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="Snowstar">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(target)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<style>body{background:#0b0a0e;color:#f3eee6;font-family:system-ui,sans-serif;
display:grid;place-items:center;height:100vh;margin:0;text-align:center}
a{color:#ffd65c}</style></head>
<body><div><p>${esc(title)}</p><p><a href="${esc(target)}">Open on Mutra</a></p></div>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Long enough that a viral link is not re-rendered per scrape, short
      // enough that a rename shows up the same day.
      'cache-control': 'public, max-age=900',
    },
  });
}
