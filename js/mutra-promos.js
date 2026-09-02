/* ═══════════ Mutra — promo strips, inserted at behaviour moments ═════════════
   Three brand banners and the KAYMA custom-licence row, none of them at a fixed
   position. The intent engine (mutra-behavior.js) fires a moment when somebody
   is browsing and hesitating; this file decides which strip that moment earns
   and drops it into the catalogue near where they actually are.

   A brand strip is proof, not decoration: a real commercial from the portfolio,
   and directly beneath it the REAL catalogue row of the track that scored it —
   play, wave, licence and all — built by the catalogue's own row builder so it
   can never drift from the list it sits in. "This exact sound sold a car" is
   the whole pitch, so the sound must be one click away from the claim.

   Rotation: brands first (fresher proof), the custom-licence row last. One
   strip per moment, each shown once per session (sessionStorage), and a
   frustrated visitor gets none of them — somebody who cannot find what they
   want needs help, not an advert.

   Re-insertion: the catalogue rebuilds its rows on every filter and re-render,
   which throws inserted strips away. A MutationObserver puts the current strip
   back — but only while the list is unfiltered, so a search never has a banner
   sitting in its results. */
(function () {
  const tracksEl = document.querySelector('.tracks');
  if (!tracksEl) return;

  /* The brand, not the filename: a visitor is sold by "Pepsi used this", never
     by the project's internal title. Logos where the client-logo strip already
     has one; Mitsubishi has no logo on file, so its wordmark carries it in the
     display face rather than a redrawn trademark. Credits mirror the works
     table on the Snowstar side, so the lightbox tells the same story there and
     here. */
  const PROMOS = [
    { id: 'mitsubishi', brand: 'Mitsubishi', color: '#ff2a3c', logo: 'assets/clients/mitsubishi.png',
      title: 'MITSUBISHI — ASX',
      img: 'assets/thumbs/mitsubishi-asx.jpg', mp4: 'https://cdn.snowstar.company/work/mitsubishi-asx.mp4',
      credits: { work: 'Catalog music placement', agency: 'Gitam B.B.D.O' },
      slug: 'the-rise-and-fall-original-ver' },
    { id: 'fiverr', brand: 'Fiverr', color: '#1dbf73', logo: 'assets/clients/logo12.png', title: 'FIVERR — DIRECTOR’S CUT',
      img: 'assets/thumbs/fiverr-director-s-cut.jpg', mp4: 'https://cdn.snowstar.company/work/fiverr-director-s-cut.mp4',
      credits: { work: 'Original music & sound design', production: 'Green Productions', director: 'Guy Bolandi' },
      slug: 'cyber-tunnel' },
    { id: 'pepsi', brand: 'Pepsi', color: '#2f9bff', logo: 'assets/clients/logo10.png', title: 'PEPSI — VIETNAM',
      img: 'assets/thumbs/pepsi-vietnam.jpg', mp4: 'https://cdn.snowstar.company/work/pepsi-vietnam.mp4',
      credits: { work: 'Original Music', production: 'May Production', director: 'Guy Bolandi' },
      slug: 'do-it-major' },
    /* The PLAYBACK sits first in this stack on purpose: the original's lyrics
       are welded to the SodaStream brand, so the instrumental is the version
       a licence actually fits. */
    { id: 'sodastream', brand: 'SodaStream', color: '#00b4e0', logo: 'assets/clients/logo01.png',
      title: 'SODASTREAM',
      img: 'assets/thumbs/sodastream.jpg', mp4: 'https://cdn.snowstar.company/work/sodastream.mp4',
      credits: { work: 'Original music, lyrics & vocal performance', production: 'Rabel',
                 agency: 'Lemonade', director: 'Aviv Maaravi' },
      slug: 'stream-of-love-playback' },
    { id: 'ahava', brand: 'AHAVA', color: '#2fbfa7', logo: 'assets/clients/logo24.png',
      title: 'AHAVA',
      img: 'assets/thumbs/ahava.jpg', mp4: 'https://cdn.snowstar.company/work/ahava.mp4',
      credits: { work: 'Original music & sound design', production: 'Mamash Productions',
                 director: 'Amit Sides' },
      slug: 'desert-desire' },
    // no Plus500 logo in the client set — the wordmark carries it
    { id: 'plus500', brand: 'Plus500', color: '#5468ff',
      title: 'PLUS 500 — ATLETICO MADRID',
      img: 'assets/thumbs/atletico-madrid.jpg', mp4: 'https://cdn.snowstar.company/work/atletico-madrid.mp4',
      credits: { work: 'Original music & sound design', production: 'Mamash Productions',
                 agency: 'PLUS 500', director: 'Amit Sides' },
      slug: 'shorditch-14' },
    { id: 'johnnie', brand: 'Johnnie Walker', color: '#d9a21b', logo: 'assets/clients/logo20.png',
      title: 'JOHNNIE WALKER',
      img: 'assets/thumbs/johnnie-walker.jpg', mp4: 'https://cdn.snowstar.company/work/johnnie-walker.mp4',
      credits: { work: 'Original music', production: 'We do productions',
                 agency: 'KDA', director: 'Uri Shizer' },
      slug: 'epic-journey' },
  ];

  /* One commercial, one custom-licence artist, repeat — proof of work, then a
     person to license, in strict alternation. TALMA's strip stays out of the
     cycle until her songs and portrait exist (empty slugs = skipped), so the
     rotation never shows a hollow card. */
  const TALMA = { id: 'talma', custom: true, artist: 'TALMA', color: '#ffc24b',
                  img: 'https://cdn.snowstar.company/mutra/artists/talma.jpg',
                  blurb: 'Every licence goes through us — custom terms, cleared properly.',
                  // her catalogue, staff-picks order; the strip shows the first three
                  slugs: ['all-my-time', 'great-powers', 'man-is-gone', 'glida', 'isha',
                          'latus', 'love-to-love-you', 'pashut', 'route-de-l-amour',
                          'train-is-on'] };
  const CUSTOMS = [{ id: 'custom-license', spotlight: true }, TALMA];

  /* Every refresh opens the reel somewhere new: the first brand shown is a
     rotating offset persisted per browser, so the same visitor meets a
     different advert each visit instead of Mitsubishi forever. Storage
     blocked? A random start does the same job for one visit. */
  let bi = 0;
  try {
    bi = (parseInt(localStorage.getItem('mutra-promo-rot'), 10) || 0) % PROMOS.length;
    localStorage.setItem('mutra-promo-rot', String(bi + 1));
  } catch { bi = Math.floor(Math.random() * PROMOS.length); }
  let ci = 0, wantBrand = true;
  const ready = (p) => !p.custom || (p.slugs && p.slugs.length);
  function nextStrip() {
    if (!wantBrand) {
      wantBrand = true;
      for (let k = 0; k < CUSTOMS.length; k++) {
        const c = CUSTOMS[ci++ % CUSTOMS.length];
        if (ready(c)) return c;
      }
      // no custom is ready — show a brand rather than stall the moment
    }
    wantBrand = false;
    return PROMOS[bi++ % PROMOS.length];
  }

  /* ── the commercial, full screen ──────────────────────────────────────────
     The same move the Snowstar portfolio makes: the film with its credits, in
     a lightbox, and nothing else competing with it. Built once, reused. */
  let lb = null;
  function openFilm(p) {
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'promo-lb';
      lb.innerHTML = '<div class="promo-lb-in"><button class="promo-lb-x" aria-label="Close">×</button>' +
                     '<div class="promo-lb-body"></div><div class="promo-lb-title"></div></div>';
      document.body.appendChild(lb);
      const close = () => { lb.hidden = true; lb.querySelector('.promo-lb-body').innerHTML = '';
                            document.body.style.overflow = ''; };
      lb.querySelector('.promo-lb-x').addEventListener('click', close);
      lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.hidden) close(); });
    }
    lb.querySelector('.promo-lb-body').innerHTML =
      `<video src="${p.mp4}" controls autoplay playsinline poster="${p.img}"></video>`;
    const c = p.credits || {};
    lb.querySelector('.promo-lb-title').innerHTML = `<strong>${p.title}</strong><span class="promo-lb-credits">${[
      c.work && `<span><em>Snowstar</em>${c.work}</span>`,
      c.director && `<span><em>Director</em>${c.director}</span>`,
      c.production && `<span><em>Production</em>${c.production}</span>`,
      c.agency && `<span><em>Agency</em>${c.agency}</span>`,
    ].filter(Boolean).join('')}</span>`;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /* ── the ignition ─────────────────────────────────────────────────────────
     A promoted row lights up like a neon tube — once, and only after the
     visitor has scrolled it FULLY into view. Half-seen rows stay dark: an
     effect firing under the fold is an effect wasted, and one that re-fires
     on every pass is a nag. WeakSet + unobserve make it once per row per
     page load, even when the rotation moves a strip to a new position. */
  /* The sweep replays every few seconds for as long as the row stays fully
     in view — a neon sign, not a one-shot — and the first firing still waits
     until the visitor has scrolled the whole row past the fold. Leaving the
     view (or the DOM) stops the cycle; coming back restarts it.
     threshold .98, not 1: at fractional zoom/DPR the browser reports 0.999x
     for a fully visible row and a strict ==1 gate would never open. */
  const REIGNITE_MS = 4200;          // 1.7s sweep + a beat of dark
  const cycles = new WeakMap();      // row -> its repeat timer
  const wired = new WeakSet();       // rows that already clean up after a sweep
  function ignite(row) {
    if (!row.isConnected) return;
    if (!wired.has(row)) {
      wired.add(row);
      row.addEventListener('animationend', (ev) => {
        if (ev.animationName === 'promoSweep') row.classList.remove('promo-lit');
      });
    }
    row.classList.remove('promo-lit');
    void row.offsetWidth;            // restart cleanly even if a sweep is mid-flight
    row.classList.add('promo-lit');
  }
  const igniter = 'IntersectionObserver' in window
    ? new IntersectionObserver((ents) => {
        for (const en of ents) {
          const row = en.target;
          const fullySeen = en.isIntersecting && en.intersectionRatio >= 0.98;
          if (fullySeen && !cycles.has(row)
              && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            ignite(row);
            cycles.set(row, setInterval(() => {
              if (!row.isConnected) { clearInterval(cycles.get(row)); cycles.delete(row); return; }
              ignite(row);
            }, REIGNITE_MS));
          } else if (!fullySeen && cycles.has(row)) {
            clearInterval(cycles.get(row));
            cycles.delete(row);
          }
        }
      }, { threshold: [0, 0.98] })
    : null;
  const armGlow = (row) => { if (igniter && row) igniter.observe(row); };

  /* Per page load, not per session — a browse long enough to earn several
     moments deserves several strips, and yesterday's visit should not mute
     today's. Each brand exists in the DOM once: when the rotation comes back
     around, its strip MOVES to where the visitor is now instead of cloning. */
  const nodes = new Map();      // promo id -> its strip node
  const live = [];              // strips currently owed to the page, for re-insertion

  /* The banner's price is the funnel's price, not a slogan: the cheapest
     self-serve entry for THIS track (own work, 6 months), computed by the
     same priceFor the licence chooser uses, so the number on the ad and the
     number at checkout can never disagree. Strips build at behaviour moments,
     long after mutra-license.js has loaded. */
  function entryPrice(slug) {
    try {
      const t = window.mutraCatalog && mutraCatalog.all().find((x) => x.slug === slug);
      const f = t && window.mutraLicense && mutraLicense.priceFor(t, 'individual-own', 'standard', '6m');
      if (f && !f.quote && f.amount > 0) return `Starting at ${f.amount}₪ for 6 months`;
    } catch {}
    return 'Licensed per project — get a quote';
  }

  function buildStrip(p) {
    const wrap = document.createElement('div');
    wrap.className = 'promo-strip';
    wrap.innerHTML = `
      <div class="promo-banner">
        <button type="button" class="promo-film" aria-label="Watch the ${p.brand} commercial">
          <img src="${p.img}" alt="" loading="lazy">
          <span class="promo-play">▶</span>
        </button>
        <div class="promo-copy">
          ${p.logo ? `<img class="promo-logo" src="${p.logo}" alt="${p.brand}">`
                   : `<span class="promo-wordmark">${p.brand}</span>`}
          <b><span>Once used by <em class="promo-brand"
               style="color:${p.color}">${p.brand}</em>.</span>
             <span class="promo-l2">License it today.</span></b>
          <p>${entryPrice(p.slug)}</p>
        </div>
      </div>`;
    // The claim, then the sound that earned it — the catalogue's own row, so it
    // plays, seeks, and licenses exactly like every other row on the page.
    const row = window.mutraCatalog && mutraCatalog.row(p.slug);
    if (row) { row.classList.add('promo-track'); wrap.appendChild(row); armGlow(row); }
    // The commercial IS the proof, so clicking anywhere on the banner opens the
    // film — the same lightbox the Snowstar portfolio uses, credits and all.
    wrap.querySelector('.promo-banner').addEventListener('click', () => {
      if (window.mutraTrack) mutraTrack('promo_click', p.id);
      openFilm(p);
      const r = wrap.querySelector('.promo-track');
      if (r) { r.classList.add('promo-flash');
               setTimeout(() => r.classList.remove('promo-flash'), 1600); }
    });
    return wrap;
  }

  /* The custom-licence artist: portrait, the pitch, and their songs as real
     catalogue rows — the same anatomy as a brand strip, with a person where
     the commercial was. Quote-only artists are the product here, so the strip
     sells the ARTIST and the rows carry the licensing. */
  function buildArtistStrip(p) {
    const wrap = document.createElement('div');
    wrap.className = 'promo-strip';
    wrap.innerHTML = `
      <div class="promo-banner promo-artist">
        <span class="promo-film"><img src="${p.img}" alt="${p.artist}"></span>
        <div class="promo-copy">
          <span class="promo-kicker">Custom License</span>
          <b><span>Music by <em class="promo-brand"
               style="color:${p.color}">${p.artist}</em>.</span>
             <span class="promo-l2">Get a custom quote.</span></b>
          <p>${p.blurb}</p>
        </div>
      </div>`;
    for (const slug of p.slugs.slice(0, 3)) {
      const row = window.mutraCatalog && mutraCatalog.row(slug);
      if (row) { row.classList.add('promo-track'); wrap.appendChild(row); armGlow(row); }
    }
    wrap.querySelector('.promo-banner').addEventListener('click', () => {
      if (window.mutraTrack) mutraTrack('promo_click', p.id);
      location.href = 'artist.html?name=' + encodeURIComponent(p.artist);
    });
    return wrap;
  }

  /* Placement is a zigzag with breathing room: near the reader, but never
     within GAP tracks of another strip. Ads that stack up read as a wall of
     advertising; ads with real catalogue between them read as a catalogue
     that occasionally says something. */
  const GAP = 7;                     // minimum catalogue rows between strips

  /** The slot a strip occupies = how many .trk rows sit before it. */
  function slotOf(el) {
    let n = 0;
    for (const c of tracksEl.children) {
      if (c === el) return n;
      if (c.classList.contains('trk')) n++;
    }
    return n;
  }

  function targetSlot() {
    const rows = [...tracksEl.querySelectorAll(':scope > .trk')];
    // preferred: just under whatever the reader is looking at
    let pref = 0;
    for (const r of rows) { if (r.getBoundingClientRect().top < innerHeight * 0.55) pref++; else break; }
    // pushed past any existing strip so GAP real tracks always separate them
    let min = 0;
    for (const el of tracksEl.querySelectorAll(':scope > .promo-strip, :scope > .spotlight-row')) {
      min = Math.max(min, slotOf(el) + GAP);
    }
    return { slot: Math.max(pref, min), rows };
  }

  /** Versions render as consecutive `.trk-child` siblings right after their
   *  parent row, and a strip between a song and its own mixes reads as the
   *  list cutting the song in half. Never insert there: walk to the end of
   *  the group first. */
  function stackEnd(row) {
    let n = row;
    while (n.nextElementSibling && n.nextElementSibling.classList.contains('trk-child'))
      n = n.nextElementSibling;
    return n;
  }

  function place(node) {
    // A strip detached mid-sweep keeps promo-lit (its animationend never
    // came); re-entering the DOM would replay the ignition wherever it lands.
    if (node.classList) {
      node.classList.remove('promo-lit');
      node.querySelectorAll('.promo-lit').forEach((r) => r.classList.remove('promo-lit'));
    }
    const { slot, rows } = targetSlot();
    if (!rows.length) { tracksEl.prepend(node); return; }
    if (slot <= 0) { rows[0].insertAdjacentElement('beforebegin', node); return; }
    // Past the end: sit after the last row — infinite scroll will keep adding
    // rows beneath it, so the gap grows back on its own.
    stackEnd(rows[Math.min(slot, rows.length) - 1]).insertAdjacentElement('afterend', node);
  }

  function fire(kind) {
    if (kind === 'frustrated') return;      // help-not-sell; the agent dock is the answer there
    const next = nextStrip();
    if (!next) return;

    // Around again: the strip already exists, so it travels to the visitor
    // rather than duplicating above them.
    const existing = nodes.get(next.id);
    if (existing) {
      if (existing.isConnected) existing.remove();
      place(existing);
      if (window.mutraTrack) mutraTrack('promo_seen', next.id);
      return;
    }

    if (next.custom) {
      const node = buildArtistStrip(next);
      nodes.set(next.id, node);
      live.push(node);
      place(node);
      if (window.mutraTrack) mutraTrack('promo_seen', next.id);
      return;
    }

    if (next.spotlight) {
      // The custom-licence row: arm the catalogue's own machinery and let it
      // place and re-place the row it already owns.
      // +1: the spotlight machinery counts its insert-after index one shy of the
      // slot arithmetic used here, and the gap rule should mean the same thing
      // for every strip.
      window.MUTRA_SPOTLIGHT_INSERT_AFTER = Math.max(2, targetSlot().slot + 1);
      window.MUTRA_SPOTLIGHT_ARMED = true;
      if (window.mutraTrack) mutraTrack('promo_seen', 'custom-license');
      if (mutraCatalog.recheckSpotlight) mutraCatalog.recheckSpotlight();
      // remember its row so the rotation can move it next time around
      setTimeout(() => { const r = tracksEl.querySelector('.spotlight-row');
                         if (r) nodes.set('custom-license', r); }, 1500);
      return;
    }
    const node = buildStrip(next);
    nodes.set(next.id, node);
    live.push(node);
    place(node);
    if (window.mutraTrack) mutraTrack('promo_seen', next.id);
  }

  // The catalogue wipes its rows on re-render; put owed strips back, but never
  // into a filtered list.
  new MutationObserver(() => {
    if (!window.mutraCatalog || mutraCatalog.narrowed()) return;
    for (const n of live) if (!n.isConnected) place(n);
  }).observe(tracksEl, { childList: true });

  (function arm(tries) {
    if (window.mutraBehavior) { mutraBehavior.onMoment(fire); return; }
    if (tries > 0) setTimeout(() => arm(tries - 1), 150);
  })(20);
})();
