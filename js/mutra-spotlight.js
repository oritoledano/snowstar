/* ═══════════ Mutra — Artist Spotlight row ═══════════
   A horizontal, hover-to-preview row inserted after the Nth catalog row
   (see mutra-page.js's maybeInsertSpotlight). Data-driven off
   MUTRA_SPOTLIGHTS (mutra-spotlight-data.js) so the same code serves any
   future artist/album/playlist — nothing here is Kayma-specific.

   Rest state: the track's cover art, like a sleeve.
   Hover (or tap, on touch): the card grows in place, a vinyl disc slides
   out from behind the sleeve and spins, and a short audio snippet fades
   in. Hover-out reverses all three and fades the audio back out.

   window.mutraPauseMainPlayer (exposed by mutra-page.js) is called on
   hover-start so a spotlight preview never plays under whatever the
   sticky catalog player is already doing. */
(function () {
  if (typeof MUTRA_SPOTLIGHTS === 'undefined' || !MUTRA_SPOTLIGHTS.length) return;

  const INSERT_AFTER = 10; // Nth catalog row this appears after

  let builtRow = null;
  let activeCard = null;
  const snippetAudio = new Audio();
  snippetAudio.loop = true;
  snippetAudio.preload = 'none';
  let fadeRaf = 0;

  function fadeTo(target, ms) {
    cancelAnimationFrame(fadeRaf);
    const start = snippetAudio.volume, t0 = performance.now();
    if (target > 0 && snippetAudio.paused) snippetAudio.play().catch(() => {});
    (function step(t) {
      const p = Math.min(1, (t - t0) / ms);
      snippetAudio.volume = start + (target - start) * p;
      if (p < 1) { fadeRaf = requestAnimationFrame(step); }
      else if (target === 0) { snippetAudio.pause(); }
    })(t0);
  }

  function activate(card, track) {
    if (activeCard === card) return;
    activeCard = card;
    if (window.mutraPauseMainPlayer) window.mutraPauseMainPlayer();
    if (snippetAudio.src !== track.snippetUrl) snippetAudio.src = track.snippetUrl;
    snippetAudio.currentTime = 0;
    fadeTo(0.55, 220);
    if (window.mutraTrack) mutraTrack('play', 'spotlight:' + track.slug, { once: true });
  }
  function deactivate(card) {
    if (activeCard !== card) return;
    activeCard = null;
    fadeTo(0, 260);
  }

  function buildCard(track) {
    const card = document.createElement('div');
    card.className = 'spot-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', track.title + ' — preview');
    card.innerHTML = `
      <div class="spot-sleeve"><img src="${track.cover}" alt="${track.title} cover art" loading="lazy"></div>
      <div class="spot-vinyl"><img src="${track.vinyl}" alt="" loading="lazy"></div>
      <div class="spot-meta"><b>${track.title}</b>${track.placeholder ? '<span class="spot-ph" title="Placeholder preview — real snippet coming soon">●</span>' : ''}</div>`;

    card.addEventListener('mouseenter', () => activate(card, track));
    card.addEventListener('mouseleave', () => deactivate(card));
    card.addEventListener('focus', () => activate(card, track));
    card.addEventListener('blur', () => deactivate(card));
    // touch: tap toggles (no real hover on mobile)
    card.addEventListener('click', (e) => {
      if (!matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        if (activeCard === card) deactivate(card); else activate(card, track);
      }
    });
    return card;
  }

  function buildRow(spot) {
    const row = document.createElement('div');
    row.className = 'spotlight-row';
    row.setAttribute('aria-label', spot.kicker + ': ' + spot.artist + ' — ' + spot.album);
    row.innerHTML = `
      <div class="spot-head">
        <span class="spot-kicker">${spot.kicker}</span>
        <h3>${spot.artist} <span class="spot-album">— ${spot.album}</span></h3>
      </div>
      <div class="spot-strip"></div>`;
    const strip = row.querySelector('.spot-strip');
    spot.tracks.forEach(t => strip.appendChild(buildCard(t)));

    // stop preview + spin whenever the row leaves view (scrolled past, tab switch, etc.)
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting && activeCard) deactivate(activeCard);
    }, { threshold: 0 }).observe(row);

    if (window.mutraTrack) {
      new IntersectionObserver((entries, obs) => {
        if (entries[0].isIntersecting) {
          mutraTrack('view', 'spotlight:' + spot.id, { once: true });
          obs.disconnect();
        }
      }, { threshold: 0.3 }).observe(row);
    }

    return row;
  }

  /** Idempotent — builds once, returns the same node on every call so
   * re-insertion after a catalog filter/re-render doesn't lose state
   * or rebuild images that are already loaded. */
  window.mutraSpotlightRow = function () {
    if (!builtRow) builtRow = buildRow(MUTRA_SPOTLIGHTS[0]);
    return builtRow;
  };
  window.MUTRA_SPOTLIGHT_INSERT_AFTER = INSERT_AFTER;

  addEventListener('pagehide', () => activeCard && deactivate(activeCard));
})();
