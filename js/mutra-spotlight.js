/* ═══════════ Mutra — Artist Spotlight row ═══════════
   A horizontal, hover-to-preview row inserted after the Nth catalog row
   (see mutra-page.js's maybeInsertSpotlight). Data-driven off
   MUTRA_SPOTLIGHTS (mutra-spotlight-data.js) so the same code serves any
   future artist/album/playlist — nothing here is Kayma-specific.

   Rest state: the track's cover art, at rest, full size.
   Hover (or tap, on touch): the card and its right-hand neighbor nudge
   apart a little (no size change, just a gentle shift), and a shared
   Mutra-branded vinyl disc slides out from behind the sleeve, revealed
   exactly half way, spinning, while a short audio snippet fades in.
   That reveal is tied to hover and lets go the moment the cursor does.

   The play button on the cover art (low opacity until you notice it)
   is the independent, persistent version of the same thing: click it
   and the card "pins" — vinyl keeps spinning and the snippet keeps
   playing after the cursor leaves, exactly like the always-on touch
   tap already worked. Only one card is ever active at a time either
   way; hovering a different card always takes over.

   window.mutraPauseMainPlayer (exposed by mutra-page.js) is called on
   hover-start so a spotlight preview never plays under whatever the
   sticky catalog player is already doing. */
(function () {
  if (typeof MUTRA_SPOTLIGHTS === 'undefined' || !MUTRA_SPOTLIGHTS.length) return;

  const INSERT_AFTER = 10; // Nth catalog row this appears after
  const ICON_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

  let builtRow = null;
  let allCards = [];
  let activeCard = null;
  let pinned = false; // true once the play button (or a touch tap) locked the active card on
  const snippetAudio = new Audio();
  snippetAudio.loop = true;
  snippetAudio.preload = 'none';
  snippetAudio.volume = 0; // fades up from true silence on the first activation
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

  function syncPlayButtons() {
    allCards.forEach(card => {
      const btn = card.querySelector('.spot-play');
      if (!btn) return;
      const on = card === activeCard && pinned;
      btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
      btn.classList.toggle('is-playing', on); // pause glyph is symmetric — no optical-centering offset needed
      btn.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + card.dataset.title);
    });
  }

  function activate(card, track, pin) {
    if (activeCard === card) {
      if (pin) { pinned = true; syncPlayButtons(); }
      return;
    }
    if (activeCard) deactivateEl(activeCard);
    activeCard = card;
    pinned = !!pin;
    card.classList.add('spot-active');
    if (window.mutraPauseMainPlayer) window.mutraPauseMainPlayer();
    if (snippetAudio.src !== track.snippetUrl) snippetAudio.src = track.snippetUrl;
    snippetAudio.currentTime = 0;
    fadeTo(0.55, 260);
    if (window.mutraTrack) mutraTrack('play', 'spotlight:' + track.slug, { once: true });
    syncPlayButtons();
  }
  function deactivateEl(card) { card.classList.remove('spot-active'); }
  /** force=true stops a pinned card too (scrolled away, page hidden, tapped
   * again to explicitly stop) — a plain mouseleave/blur never does. */
  function deactivate(card, force) {
    if (activeCard !== card) return;
    if (pinned && !force) return;
    activeCard = null;
    pinned = false;
    deactivateEl(card);
    fadeTo(0, 320);
    syncPlayButtons();
  }

  function buildCard(track, spot) {
    const card = document.createElement('div');
    card.className = 'spot-card' + (track.isAlbum ? ' spot-is-album' : '');
    card.tabIndex = 0;
    card.dataset.title = track.title;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', track.title + ' — preview');
    card.innerHTML = `
      <div class="spot-art">
        <div class="spot-sleeve">
          <img src="${track.cover}" alt="${track.title} cover art" loading="lazy">
          <button type="button" class="spot-play" aria-label="Play ${track.title}">${ICON_PLAY}</button>
        </div>
        <div class="spot-vinyl"><img src="${track.vinyl}" alt="" loading="lazy"></div>
      </div>
      <div class="spot-meta">
        <div class="spot-title-row"><b>${track.title}</b>${track.placeholder ? '<span class="spot-ph" title="Placeholder preview — real snippet coming soon">●</span>' : ''}</div>
        ${spot.artist ? `<button type="button" class="spot-artist" aria-label="${spot.artist} — artist page">${spot.artist}</button>` : ''}
      </div>`;

    card.addEventListener('mouseenter', () => activate(card, track));
    card.addEventListener('mouseleave', () => deactivate(card));
    card.addEventListener('focus', () => activate(card, track));
    card.addEventListener('blur', () => deactivate(card));
    // touch: tap toggles (no real hover to keep it going, so a tap pins it
    // exactly like clicking the play button would)
    card.addEventListener('click', (e) => {
      if (!matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        if (activeCard === card) deactivate(card, true); else activate(card, track, true);
      }
    });
    // the play button pins the card on: keeps spinning/playing after the
    // cursor leaves, independent of hover — click again to stop it
    card.querySelector('.spot-play').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (activeCard === card && pinned) deactivate(card, true);
      else activate(card, track, true);
    });
    // the artist name is its own click target — opens the full artist
    // page (lightbox transition if available, else a plain nav)
    const artistBtn = card.querySelector('.spot-artist');
    if (artistBtn) {
      artistBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (window.mutraOpenArtist) window.mutraOpenArtist(spot.id);
        else location.href = 'artist.html?a=' + encodeURIComponent(spot.id);
      });
    }
    return card;
  }

  function quoteMailto(spot) {
    const subject = 'Mutra — Custom license quote (' + spot.artist + ' — ' + spot.album + ')';
    const body = `Hi Snowstar,\n\nI'd like a quote to custom-license ${spot.artist} — ${spot.album}.\n\nUsage / media:\nTimeline:\n\nThanks!`;
    return 'mailto:hello@snowstar.company?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function buildRow(spot) {
    const row = document.createElement('div');
    row.className = 'spotlight-row';
    row.setAttribute('aria-label', spot.kicker + ': ' + spot.artist + ' — ' + spot.album);
    row.innerHTML = `
      <div class="spot-head">
        <span class="spot-kicker">${spot.kicker}</span>
        <a class="mbtn mbtn-solid spot-quote" href="${quoteMailto(spot)}" target="_blank" rel="noopener">Get a quote</a>
      </div>
      <div class="spot-strip-wrap">
        <button class="spot-nav spot-nav-prev" type="button" aria-label="Scroll left">${ICON_PREV}</button>
        <div class="spot-strip"></div>
        <button class="spot-nav spot-nav-next" type="button" aria-label="Scroll right">${ICON_NEXT}</button>
      </div>`;
    const strip = row.querySelector('.spot-strip');
    spot.tracks.forEach(t => strip.appendChild(buildCard(t, spot)));
    allCards = [...strip.querySelectorAll('.spot-card')];

    const scrollByCard = (dir) => {
      const card = strip.querySelector('.spot-card');
      const step = card ? card.getBoundingClientRect().width + 20 : 190; // card width + gap
      strip.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
    };
    row.querySelector('.spot-nav-prev').addEventListener('click', () => scrollByCard(-1));
    row.querySelector('.spot-nav-next').addEventListener('click', () => scrollByCard(1));

    // stop preview + spin whenever the row leaves view (scrolled past, tab
    // switch, etc.) — force:true so a pinned card stops too, not just a hover
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting && activeCard) deactivate(activeCard, true);
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

  addEventListener('pagehide', () => activeCard && deactivate(activeCard, true));
})();
