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
  /* This page's own address. The canonical used to be `target`, which told
     Google the real page was the catalogue and left all 402 tracks unindexed. */
  const pageUrl = `${SITE}/t/${encodeURIComponent(slug)}`;
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
  /* No artist default. The Worker has no artist column, so guessing "Ori
     Toledano" made the description say one name while the card image said
     another — BLUE is by KAYMA. Named only when an override actually states
     it; otherwise the card carries the credit and the text does not repeat it. */
  let artist = '';
  let cover = '';
  /* The WHOLE override, not three fields of it. Reading only title/artist/cover
     lost the genres, moods and instruments — which for GENTLE live entirely in
     the override, because the shipped catalogue has them empty. The page was
     rendering a track with no tags and a JSON-LD with no genre while the
     catalogue showed both. */
  let patch = {};
  try {
    const o = await env.DB.prepare('SELECT patch FROM track_overrides WHERE slug = ?')
      .bind(slug).first();
    if (o && o.patch) {
      patch = JSON.parse(o.patch) || {};
      if (patch.title) title = patch.title;
      if (patch.artist) artist = patch.artist;
      if (patch.cover) cover = patch.cover;
    }
  } catch { /* the shipped title is fine */ }

  /* Prefer the composed card. If it is absent — which is exactly what happens
     for the window between somebody uploading new artwork and the cards being
     rebuilt — fall back to the cover itself. A plain cover is right; a card
     showing the artwork it just replaced is wrong. */
  let img = `${CDN}/og/${slug}.jpg`;
  const card = await env.MEDIA.head('og/' + slug + '.jpg').catch(() => null);
  if (!card && cover) img = cover;
  const desc = artist
    ? `${title} by ${artist}. Preview and licence it on Mutra, by Snowstar.`
    : `${title} — preview and licence it on Mutra, by Snowstar.`;

  /* The full catalogue, fetched from the site and cached at the edge.
     The Worker's own tables hold a title and an audio key; genres, moods,
     instruments, tempo, key and duration live in the shipped js/mutra-data.js,
     and only 74 of 402 tracks have an override rich enough to substitute. A
     page with nothing on it but a title is not worth indexing, so the page
     reads the same file the catalogue reads. */
  let meta = null;
  try {
    const url = 'https://snowstar.company/js/mutra-data.js';
    const cache = caches.default;
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url, { cf: { cacheTtl: 3600 } });
      if (res.ok) {
        const copy = new Response(await res.clone().text(),
          { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } });
        await cache.put(url, copy.clone());
        res = copy;
      }
    }
    if (res && res.ok) {
      const txt = await res.text();
      const cat = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      meta = (cat.tracks || []).find((t) => t.slug === slug) || null;
    }
  } catch { /* a thinner page is still a page */ }

  /* The override wins over the shipped file — it is the newer statement, and
     it is where every tag added since the last catalogue build lives. */
  const t = { ...(meta || {}), ...patch, slug };
  if (title) t.title = title;
  if (artist) t.artist = artist;
  if (cover) t.cover = cover;

  const tags = [...(t.genres || []), ...(t.moods || []), ...(t.characteristics || [])];
  const mins = t.duration
    ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}`
    : '';

  /* The entry price, computed the same way the catalogue computes it rather
     than written down here — a hardcoded figure on 402 pages is 402 places to
     be wrong the next time the ladder moves. */
  let price = null, quoteOnly = false;
  try {
    const { priceFor, loadClasses } = await import('./pricing.js');
    const { laneLocked } = await import('./pricing.js');
    const classes = await loadClasses(env).catch(() => null);
    const p = priceFor(t, 'individual-own', 'standard', '6m', false, classes);
    if (p && p.quote) quoteOnly = true; else if (p && p.amount != null) price = p.amount;
    if (laneLocked && laneLocked(t)) quoteOnly = true;
  } catch { /* the page works without a figure */ }

  const facts = [
    t.artist ? `by ${t.artist}` : '', mins, t.bpm ? `${t.bpm} BPM` : '',
    t.key ? `${t.key}${t.scale ? ' ' + t.scale : ''}` : '', t.vocal || '',
  ].filter(Boolean);

  const longDesc = [
    t.artist ? `${title} by ${t.artist}.` : `${title}.`,
    tags.length ? `${tags.slice(0, 6).join(', ')}.` : '',
    mins ? `${mins} long${t.bpm ? `, ${t.bpm} BPM` : ''}.` : '',
    quoteOnly
      ? 'Licensed by quote for any commercial use.'
      : price != null
        ? `Royalty-free licensing from \u20aa${price} for six months, one track, one project.`
        : 'Royalty-free licensing for film, advertising and digital.',
    'Cleared at source by Snowstar \u2014 one owner, no sample chain, no label.',
  ].filter(Boolean).join(' ');

  /* MusicRecording plus an Offer. The whole price ladder lives behind a modal,
     so this is the only machine-readable statement of what a track costs. */
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: title,
    url: pageUrl,
    ...(t.artist ? { byArtist: { '@type': 'MusicGroup', name: t.artist } } : {}),
    ...(t.duration ? { duration: `PT${Math.floor(t.duration / 60)}M${Math.round(t.duration % 60)}S` } : {}),
    ...(t.genres && t.genres.length ? { genre: t.genres } : {}),
    ...(img ? { image: img } : {}),
    inLanguage: t.lang || undefined,
    isFamilyFriendly: true,
    publisher: { '@type': 'Organization', name: 'Snowstar.Company', url: 'https://snowstar.company/' },
    ...(price != null && !quoteOnly ? { offers: {
      '@type': 'Offer', price: String(price), priceCurrency: 'ILS',
      availability: 'https://schema.org/InStock', url: target,
      description: 'Six-month licence, one track, one project.',
    } } : {}),
  };

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${t.artist ? ' by ' + esc(t.artist) : ''} — licence it on Mutra</title>
<meta name="description" content="${esc(longDesc.slice(0, 300))}">
<!-- Canonical points at THIS page. It used to point at the catalogue while the
     page itself bounced straight there, so a crawler was told the real content
     was somewhere else and none of the 402 tracks were ever indexed. -->
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="icon" href="https://snowstar.company/favicon.ico">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="Snowstar">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  :root{--bg:#0b0a0e;--panel:#15131b;--line:rgba(255,255,255,.1);--text:#f3eee6;
        --muted:#a49c92;--accent:#e8b98a}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.6}
  a{color:var(--accent)}
  .top{padding:16px 20px;border-bottom:1px solid var(--line);font-size:.8rem;
    letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .wrap{max-width:720px;margin:0 auto;padding:34px 20px 70px}
  .head{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}
  .art{width:150px;height:150px;border-radius:14px;object-fit:cover;flex:none;
    border:1px solid var(--line);background:var(--panel)}
  h1{font-size:1.9rem;margin:0 0 6px;line-height:1.15}
  .by{color:var(--muted);margin:0 0 12px}
  .facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;font-size:.82rem;color:var(--muted)}
  .facts span{border:1px solid var(--line);border-radius:99px;padding:3px 10px}
  .tags{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 0}
  .tags a{font-size:.74rem;text-decoration:none;border:1px solid var(--line);
    border-radius:99px;padding:3px 10px;color:var(--muted)}
  .tags a:hover{color:var(--text)}
  audio{width:100%;margin:22px 0 0}
  .cta{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 0}
  .btn{display:inline-block;padding:11px 20px;border-radius:99px;text-decoration:none;
    font-weight:600;font-size:.9rem}
  .btn.go{background:linear-gradient(100deg,#ffc24b,#ff6a4d 52%,#ff3d8b);color:#1b1020}
  .btn.ghost{border:1px solid var(--line);color:var(--text)}
  .price{font-size:.88rem;color:var(--muted);margin:10px 0 0}
  .prose{margin:30px 0 0;padding:20px 22px;background:var(--panel);
    border:1px solid var(--line);border-radius:14px;font-size:.9rem}
  .prose h2{font-size:.96rem;margin:0 0 8px}
  .prose p{margin:0 0 10px;color:var(--muted)}
  .lyr{white-space:pre-wrap;color:var(--muted);font-size:.86rem;margin:10px 0 0}
  footer{border-top:1px solid var(--line);margin-top:40px;padding:20px;text-align:center;
    color:var(--muted);font-size:.8rem}
</style></head>
<body>
<div class="top"><a href="https://snowstar.company/mutra.html" style="text-decoration:none">Mutra — by Snowstar</a></div>
<div class="wrap">
  <div class="head">
    ${t.cover || img ? `<img class="art" src="${esc(t.cover || img)}" alt="${esc(title)} cover art" width="150" height="150">` : ''}
    <div style="flex:1 1 260px;min-width:0">
      <h1>${esc(title)}</h1>
      ${t.artist ? `<p class="by">by ${esc(t.artist)}</p>` : ''}
      ${facts.length ? `<div class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
      <div class="cta">
        <a class="btn go" href="${esc(target)}">${quoteOnly ? 'Ask for a quote' : 'Licence this track'}</a>
        <a class="btn ghost" href="https://snowstar.company/mutra.html">Browse the catalogue</a>
      </div>
      ${quoteOnly
        ? '<p class="price">Quoted per campaign — every use goes through a person.</p>'
        : price != null
          ? `<p class="price">From \u20aa${price} for six months. One track, one project. Royalty-free.</p>`
          : ''}
    </div>
  </div>

  <!-- A 128 kbps preview, the same rendition the catalogue player streams. -->
  <audio controls preload="none" src="https://snowstar.company/api/stream?slug=${encodeURIComponent(slug)}"
         title="Preview ${esc(title)}"></audio>

  ${tags.length ? `<div class="tags">${tags.slice(0, 12).map((x) =>
    `<a href="https://snowstar.company/mutra.html?q=${encodeURIComponent(x)}">${esc(x)}</a>`).join('')}</div>` : ''}

  <div class="prose">
    <h2>Licensing ${esc(title)}</h2>
    <p>${esc(longDesc)}</p>
    <p>A Mutra licence covers one track in one project for a set term — six, twelve,
       twenty-four or thirty-six months, or with no end date for organic use. The price
       depends on who is buying, where it runs and for how long, and it is shown in full
       before anything is charged. Every purchase produces an Israeli tax invoice.</p>
    <p>The catalogue was written in-house at Snowstar, most of it scored to picture for
       advertising. One owner, no sample-clearance chain and no label, so a licence here
       is a licence — not the first step of a clearance process.
       <a href="https://snowstar.company/terms.html">Licence terms</a> ·
       <a href="https://snowstar.company/refund.html">Refunds</a></p>
    ${t.lyrics ? `<h2>Lyrics</h2><div class="lyr">${esc(String(t.lyrics).slice(0, 4000))}</div>` : ''}
  </div>
</div>
<footer>© Snowstar.Company, Tel Aviv ·
  <a href="https://snowstar.company/mutra.html">Mutra</a> ·
  <a href="https://snowstar.company/privacy.html">Privacy</a></footer>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=900',
    },
  });
}
