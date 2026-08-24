/* ═══════════ Mutra — Artist Spotlight row ═══════════
   A horizontal row inserted after the Nth catalog row (see mutra-page.js's
   maybeInsertSpotlight). Data-driven off MUTRA_SPOTLIGHTS
   (mutra-spotlight-data.js) so the same code serves any future
   artist/album/playlist — nothing here is Kayma-specific.

   Two states, deliberately separate, because conflating them is what made
   this row misbehave:

     HOVER  — look, don't touch. The sleeve and the vinyl slide apart so you
              can see the disc. Nothing spins, nothing plays, and nothing
              that is already playing is disturbed. Pure CSS: :hover and
              :focus-within do the whole job, so there is no JS listener that
              could reach for the audio by accident.

     PLAYING — the play button, and only the play button. The track loads
              into the sticky player at the bottom of the page (the same one
              the catalog rows use), the vinyl spins, and both survive the
              cursor leaving. Clicking again pauses.

   The row previously ran its own second <audio> element for hover previews,
   which is why hovering had to pause the main player first — two transports
   fighting over one pair of speakers. It now has none: everything goes
   through window.mutraPlayer, so there is exactly one thing playing and the
   bottom bar always shows what the visitor actually started. */
(function () {
  if (typeof MUTRA_SPOTLIGHTS === 'undefined' || !MUTRA_SPOTLIGHTS.length) return;

  const INSERT_AFTER = 10; // Nth catalog row this appears after
  const ICON_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

  /** Open a mailto in a new tab, without stranding a blank one.
   *  window.open('mailto:…') can leave an empty tab behind once the mail
   *  client takes the handoff; a detached anchor does not. */
  function openMail(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  let builtRow = null;
  let allCards = [];

  /**
   * The track object handed to the shared player, cached per card.
   *
   * Cached for a reason that is not just tidiness: loadTrack() decides
   * "same track, so toggle" by object IDENTITY. Build a fresh object on
   * every click and the second click reloads from zero instead of pausing.
   *
   * Where a spotlight slug is also a real catalog entry we play THAT — real
   * audio, real duration, real licence lane — rather than the row's short
   * preview. Only the ones not yet in the catalog fall back to the snippet.
   */
  const trackCache = new Map();
  function playable(t, spot) {
    if (trackCache.has(t.slug)) return trackCache.get(t.slug);
    const real = window.mutraPlayer && mutraPlayer.find(t.slug);
    const obj = real || {
      slug: 'spotlight:' + t.slug,
      title: t.title,
      artist: spot.artist || '',
      audio: t.snippetUrl,
      cover: t.cover,
      duration: 0,        // the player overwrites this from real metadata
      lane: 'quote',      // an unreleased spotlight cut is never self-serve
    };
    trackCache.set(t.slug, obj);
    return obj;
  }

  /** Follow the player rather than keeping our own idea of what is playing —
   *  so starting a catalog track correctly stops the vinyl spinning here. */
  function syncFromPlayer() {
    allCards.forEach((card) => {
      const btn = card.querySelector('.spot-play');
      if (!btn) return;
      const slug = card.dataset.playSlug;
      const on = !!(window.mutraPlayer && mutraPlayer.isPlaying(slug));
      card.classList.toggle('spot-playing', on);
      btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + card.dataset.title);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /** The one place playback starts or stops in this row. */
  function togglePlay(card, track, spot) {
    if (!window.mutraPlayer) return;
    const obj = playable(track, spot);
    card.dataset.playSlug = obj.slug;
    if (mutraPlayer.isCurrent(obj.slug)) mutraPlayer.toggle();
    else {
      mutraPlayer.play(obj);
      if (window.mutraTrack) mutraTrack('play', 'spotlight:' + track.slug, { once: true });
    }
    syncFromPlayer();
  }

  function buildCard(track, spot) {
    const card = document.createElement('div');
    card.className = 'spot-card' + (track.isAlbum ? ' spot-is-album' : '');
    card.dataset.title = track.title;
    card.dataset.playSlug = playable(track, spot).slug;
    card.innerHTML = `
      <div class="spot-art">
        <div class="spot-sleeve">
          <img src="${track.cover}" alt="${track.title} cover art" loading="lazy">
          <button type="button" class="spot-play" aria-pressed="false" aria-label="Play ${track.title}">${ICON_PLAY}</button>
        </div>
        <div class="spot-vinyl"><img src="${track.vinyl}" alt="" loading="lazy"></div>
      </div>
      <div class="spot-meta">
        <div class="spot-title-row"><b>${track.title}</b>${track.placeholder ? '<span class="spot-ph" title="Placeholder preview — real snippet coming soon">●</span>' : ''}</div>
        ${spot.artist ? `<button type="button" class="spot-artist" aria-label="${spot.artist} — artist page">${spot.artist}</button>` : ''}
      </div>`;

    // NOTE: no mouseenter/mouseleave/focus/blur handlers, on purpose. The
    // reveal is CSS-only (:hover, :focus-within), which is what guarantees
    // that pointing at a card can never touch the audio.
    card.querySelector('.spot-play').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePlay(card, track, spot);
    });

    // the artist name is its own click target — opens the full artist page
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

  function buildRow(spot) {
    const row = document.createElement('div');
    row.className = 'spotlight-row';
    row.setAttribute('aria-label', spot.kicker + ': ' + spot.artist + ' — ' + spot.album);
    row.innerHTML = `
      <div class="spot-head">
        <span class="spot-kicker">${spot.kicker}</span>
        <button class="mbtn mbtn-solid spot-quote" type="button">Get a quote</button>
      </div>
      <div class="spot-strip-wrap">
        <button class="spot-nav spot-nav-prev" type="button" aria-label="Scroll left">${ICON_PREV}</button>
        <div class="spot-strip"></div>
        <button class="spot-nav spot-nav-next" type="button" aria-label="Scroll right">${ICON_NEXT}</button>
      </div>`;
    const strip = row.querySelector('.spot-strip');
    spot.tracks.forEach((t) => strip.appendChild(buildCard(t, spot)));
    allCards = [...strip.querySelectorAll('.spot-card')];

    // the row's own CTA goes through the licence chooser, same as everywhere
    // else — the album card if we have it, so the dialog names something real
    row.querySelector('.spot-quote').addEventListener('click', () => {
      const album = spot.tracks.find((t) => t.isAlbum) || spot.tracks[0];
      if (window.mutraLicense && album) return mutraLicense.open(playable(album, spot));
      openMail('mailto:hello@snowstar.company?subject='
        + encodeURIComponent('Mutra — Custom license quote (' + spot.artist + ' — ' + spot.album + ')'));
    });

    const scrollByCard = (dir) => {
      const card = strip.querySelector('.spot-card');
      const step = card ? card.getBoundingClientRect().width + 20 : 190; // card width + gap
      strip.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
    };
    row.querySelector('.spot-nav-prev').addEventListener('click', () => scrollByCard(-1));
    row.querySelector('.spot-nav-next').addEventListener('click', () => scrollByCard(1));

    // NOTE: scrolling the row out of view no longer stops anything. It used to,
    // back when this was a hover preview — but the track is in the sticky
    // player now, and music stopping because you scrolled would be a bug.

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
  /* The catalog page needs to know whose row this is, so that searching for
     the artist by name can put it first instead of burying it mid-list. The
     data file declares MUTRA_SPOTLIGHTS with `const`, which is a global
     BINDING but not a property of window — so a `window.MUTRA_SPOTLIGHTS`
     lookup from another file reads undefined and fails silently. Publish what
     the other side actually needs, from the module that already has it. */
  window.mutraSpotlightMeta = {
    id: MUTRA_SPOTLIGHTS[0].id,
    artist: MUTRA_SPOTLIGHTS[0].artist || '',
    album: MUTRA_SPOTLIGHTS[0].album || '',
  };

  // subscribe once the player exists — script order isn't guaranteed
  (function subscribe(tries) {
    if (window.mutraPlayer) { mutraPlayer.onChange(syncFromPlayer); return; }
    if (tries > 0) setTimeout(() => subscribe(tries - 1), 120);
  })(25);
})();
