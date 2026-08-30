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
    { id: 'mitsubishi', brand: 'Mitsubishi', logo: 'assets/clients/mitsubishi.png',
      title: 'MITSUBISHI — ASX',
      img: 'assets/thumbs/mitsubishi-asx.jpg', mp4: 'https://cdn.snowstar.company/work/mitsubishi-asx.mp4',
      credits: { work: 'Catalog music placement', agency: 'Gitam B.B.D.O' },
      slug: 'the-rise-and-fall-original-ver' },
    { id: 'fiverr', brand: 'Fiverr', logo: 'assets/clients/logo12.png', title: 'FIVERR — DIRECTOR’S CUT',
      img: 'assets/thumbs/fiverr-director-s-cut.jpg', mp4: 'https://cdn.snowstar.company/work/fiverr-director-s-cut.mp4',
      credits: { work: 'Original music & sound design', production: 'Green Productions', director: 'Guy Bolandi' },
      slug: 'cyber-tunnel' },
    { id: 'pepsi', brand: 'Pepsi', logo: 'assets/clients/logo10.png', title: 'PEPSI — VIETNAM',
      img: 'assets/thumbs/pepsi-vietnam.jpg', mp4: 'https://cdn.snowstar.company/work/pepsi-vietnam.mp4',
      credits: { work: 'Original Music', production: 'May Production', director: 'Guy Bolandi' },
      slug: 'do-it-major' },
  ];

  /* One commercial, one custom-licence artist, repeat — proof of work, then a
     person to license, in strict alternation. TALMA's strip stays out of the
     cycle until her songs and portrait exist (empty slugs = skipped), so the
     rotation never shows a hollow card. */
  const TALMA = { id: 'talma', custom: true, artist: 'TALMA',
                  img: 'https://cdn.snowstar.company/mutra/artists/talma.jpg',
                  blurb: 'Every licence goes through us — custom terms, cleared properly.',
                  slugs: [] };
  const CYCLE = [PROMOS[0], { id: 'custom-license', spotlight: true },
                 PROMOS[1], TALMA, PROMOS[2]];

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

  /* Per page load, not per session — a browse long enough to earn several
     moments deserves several strips, and yesterday's visit should not mute
     today's. Each brand exists in the DOM once: when the rotation comes back
     around, its strip MOVES to where the visitor is now instead of cloning. */
  const shown = new Set();
  const nodes = new Map();      // promo id -> its strip node
  const live = [];              // strips currently owed to the page, for re-insertion

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
          <b><span>Once used by ${p.brand}.</span>
             <span class="promo-l2">License it today.</span></b>
          <p>Starting at 99₪ for 6 months</p>
        </div>
      </div>`;
    // The claim, then the sound that earned it — the catalogue's own row, so it
    // plays, seeks, and licenses exactly like every other row on the page.
    const row = window.mutraCatalog && mutraCatalog.row(p.slug);
    if (row) { row.classList.add('promo-track'); wrap.appendChild(row); }
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
          <b>${p.artist} — music chosen for campaigns</b>
          <p>${p.blurb}</p>
        </div>
      </div>`;
    for (const slug of p.slugs.slice(0, 3)) {
      const row = window.mutraCatalog && mutraCatalog.row(slug);
      if (row) { row.classList.add('promo-track'); wrap.appendChild(row); }
    }
    wrap.querySelector('.promo-banner').addEventListener('click', () => {
      if (window.mutraTrack) mutraTrack('promo_click', p.id);
      location.href = 'artist.html?name=' + encodeURIComponent(p.artist);
    });
    return wrap;
  }

  /** After the last row whose top is above the middle of the window — a natural
      break near the reader, not the top of a list they have already left. */
  function insertionPoint() {
    const rows = [...tracksEl.querySelectorAll(':scope > .trk')];
    let after = null;
    for (const r of rows) { if (r.getBoundingClientRect().top < innerHeight * 0.55) after = r; else break; }
    return after;
  }

  function place(node) {
    const at = insertionPoint();
    if (at) at.insertAdjacentElement('afterend', node);
    else tracksEl.prepend(node);
  }

  function fire(kind) {
    if (kind === 'frustrated') return;      // help-not-sell; the agent dock is the answer there
    const ready = (p) => !p.custom || (p.slugs && p.slugs.length);
    let next = CYCLE.find((p) => !shown.has(p.id) && ready(p));
    if (!next) { shown.clear(); next = CYCLE.find(ready); }   // rotation wraps
    if (!next) return;
    shown.add(next.id);

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
      const rows = [...tracksEl.querySelectorAll(':scope > .trk')];
      const at = insertionPoint();
      window.MUTRA_SPOTLIGHT_INSERT_AFTER = at ? rows.indexOf(at) + 1 : 2;
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
