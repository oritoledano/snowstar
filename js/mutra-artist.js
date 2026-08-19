/* ═══════════ Mutra — Artist profile (shared render) ═══════════
   One render function, two homes:
   - artist.html calls it directly into the page body — a real,
     shareable, load-from-cold URL (?a=<spotlight id>).
   - mutra.html (via mutra-artist-lightbox.js) calls the exact same
     function into an overlay panel, so the lightbox and the standalone
     page can never drift out of sync with each other.

   Nothing in here knows or cares whether it's in a lightbox or a full
   page — that distinction lives entirely in the two call sites. */
(function () {
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  const SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.3.06 2.2.27 2.98.58.8.3 1.5.72 2.13 1.36.64.64 1.05 1.32 1.36 2.13.3.8.52 1.7.58 2.98.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.3-.27 2.2-.58 2.98a5.8 5.8 0 0 1-1.36 2.13 5.8 5.8 0 0 1-2.13 1.36c-.8.3-1.7.52-2.98.58-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.3-.06-2.2-.27-2.98-.58a5.8 5.8 0 0 1-2.13-1.36 5.8 5.8 0 0 1-1.36-2.13c-.3-.8-.52-1.7-.58-2.98C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.3.27-2.2.58-2.98.3-.8.72-1.5 1.36-2.13A5.8 5.8 0 0 1 6.34.63c.8-.3 1.7-.52 2.98-.58C10.6 0 11 0 12 0zm0 5.4a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8zm0 7.26a2.86 2.86 0 1 1 0-5.72 2.86 2.86 0 0 1 0 5.72zm4.58-7.44a1.03 1.03 0 1 0 0-2.06 1.03 1.03 0 0 0 0 2.06z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.6 2c.4 2.3 1.9 4 4.4 4.2v3.1c-1.5.1-2.9-.4-4.4-1.3v6.6c0 4.5-3.6 7.4-7.6 6.2C6.1 20 4.4 17 5.4 14c.9-2.7 3.7-4.2 6.4-3.5v3.3c-1.2-.4-2.6.3-3 1.5-.4 1.2.3 2.6 1.5 3 1.2.4 2.5-.3 2.9-1.5.1-.3.1-.6.1-1V2h3.3z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.2h-3V7.7c0-.9.3-1.6 1.6-1.6h1.6V3.2C16.5 3.1 15.5 3 14.4 3c-2.3 0-3.9 1.4-3.9 4v2.8H8v3.2h2.5V21z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.9 2h3.1l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.5 22H3.4l7.3-8.3L2.7 2H9l4.4 5.9zm-1.1 18h1.7L7.3 3.9H5.5z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22.5 6.5s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.3-1C16.3 3 12 3 12 3h0s-4.3 0-7.3.2c-.4 0-1.4.1-2.3 1-.7.7-.9 2.3-.9 2.3S1.3 8.4 1.3 10.3v1.4c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.1.2 7.1.2s4.3 0 7.3-.2c.4 0 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.4c0-1.9-.2-3.8-.2-3.8zM9.7 14.9V8.6l6 3.1z"/></svg>',
    spotify: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.8.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 1 1-.3-1.2c3.7-.9 6.9-.5 9.5 1.1a.6.6 0 0 1 .2.8zm1.2-2.8a.75.75 0 0 1-1 .3c-2.6-1.6-6.6-2.1-9.7-1.1a.75.75 0 1 1-.5-1.4c3.5-1.1 7.9-.6 10.9 1.2.4.2.5.7.3 1zm.1-2.9C14.6 8.9 9.4 8.7 6.3 9.7a.9.9 0 1 1-.5-1.7c3.6-1.1 9.3-.9 13 1.3a.9.9 0 0 1-.9 1.5z"/></svg>',
    appleMusic: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.7 2H5.3A3.3 3.3 0 0 0 2 5.3v13.4A3.3 3.3 0 0 0 5.3 22h13.4a3.3 3.3 0 0 0 3.3-3.3V5.3A3.3 3.3 0 0 0 18.7 2zM16 7.2v6.9a2.3 2.3 0 1 1-1.4-2.1V8.9L10 9.8v5.3a2.3 2.3 0 1 1-1.4-2.1V8.3z"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1.5 12.8c-.1 0-.2.1-.2.2l-.3 2.2.3 2.1c0 .1.1.2.2.2s.2-.1.2-.2l.3-2.1-.3-2.2c0-.1-.1-.2-.2-.2zm2 -.9c-.1 0-.3.1-.3.3l-.3 3 .3 2.9c0 .2.2.3.3.3.1 0 .3-.1.3-.3l.3-2.9-.3-3c0-.2-.2-.3-.3-.3zm2.1-.5c-.2 0-.3.1-.3.3l-.3 3.4.3 3.3c0 .2.1.3.3.3.2 0 .3-.1.3-.3l.3-3.3-.3-3.4c0-.2-.1-.3-.3-.3zm2.3-.6c-.2 0-.3.2-.3.4l-.2 4 .2 3.9c0 .2.1.4.3.4.2 0 .4-.2.4-.4l.3-3.9-.3-4c0-.2-.2-.4-.4-.4zM19 9.6a4 4 0 0 0-1.5.3 6 6 0 0 0-11.3 2.6v6.9h12.8a3.4 3.4 0 0 0 0-6.8h-.1z"/></svg>',
    website: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.5 2.7 3.9 6 3.9 9.5s-1.4 6.8-3.9 9.5c-2.5-2.7-3.9-6-3.9-9.5S9.5 5.2 12 2.5z"/></svg>',
    other: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  };

  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function quoteMailto(spot) {
    const subject = 'Mutra — Custom license quote (' + spot.artist + ' — ' + spot.album + ')';
    const body = `Hi Snowstar,\n\nI'd like a quote to custom-license ${spot.artist} — ${spot.album}.\n\nUsage / media:\nTimeline:\n\nThanks!`;
    return 'mailto:hello@snowstar.company?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function tagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return `<div class="ap-tags">${tags.map(t => `<span class="ap-tag">${esc(t)}</span>`).join('')}</div>`;
  }

  function socialHtml(links) {
    if (!links || !links.length) return '';
    const items = links.map(l => {
      const meta = (typeof MUTRA_SOCIAL_PLATFORMS !== 'undefined' ? MUTRA_SOCIAL_PLATFORMS : []).find(p => p.key === l.platform);
      const label = meta ? meta.label : l.platform;
      const icon = SOCIAL_ICONS[l.platform] || SOCIAL_ICONS.other;
      return `<a class="ap-social-item" href="${esc(l.url)}" target="_blank" rel="noopener">${icon}<span>${esc(label)}</span></a>`;
    }).join('');
    return `
      <div class="ap-social">
        <button class="ap-social-btn" type="button" aria-haspopup="true" aria-expanded="false">Follow ${ICON_CHEVRON}</button>
        <div class="ap-social-menu" role="menu" hidden>${items}</div>
      </div>`;
  }

  function trackRow(track, i) {
    return `
      <div class="ap-track" data-slug="${esc(track.slug)}" data-i="${i}">
        <button class="ap-track-play" type="button" aria-label="Play ${esc(track.title)}">${ICON_PLAY}</button>
        <img class="ap-track-cover" src="${esc(track.cover)}" alt="" loading="lazy">
        <div class="ap-track-id">
          <div class="ap-track-title">${esc(track.title)}</div>
          <div class="ap-track-artist">${esc(track.artistName || '')}</div>
        </div>
        <button class="ap-track-lyr" type="button" aria-expanded="false">Lyrics ${ICON_CHEVRON}</button>
        <div class="ap-lyrics" hidden></div>
      </div>`;
  }

  /** Renders spot (a MUTRA_SPOTLIGHTS entry) + its profile into `mount`.
   * opts.onClose, if given, adds a close control (lightbox mode). */
  function render(mount, spot, opts) {
    opts = opts || {};
    const profile = (typeof MUTRA_ARTIST_PROFILES !== 'undefined' ? MUTRA_ARTIST_PROFILES : {})[spot.id] || {};
    const hero = profile.heroImage || spot.tracks[0].cover;

    mount.innerHTML = `
      <div class="ap">
        ${opts.onClose ? '<button class="ap-close" type="button" aria-label="Close">&times;</button>' : ''}
        <div class="ap-hero" style="--ap-hero-img:url('${esc(hero)}')">
          <div class="ap-hero-in">
            <img class="ap-hero-cover" src="${esc(hero)}" alt="">
            <div class="ap-hero-id">
              <div class="ap-hero-kicker">Artist</div>
              <h1 class="ap-hero-name">${esc(spot.artist)}</h1>
              <div class="ap-hero-album">${esc(spot.album)}</div>
              ${tagsHtml(profile.tags)}
              <div class="ap-hero-actions">
                <a class="mbtn mbtn-solid" href="${quoteMailto(spot)}" target="_blank" rel="noopener">Get a quote</a>
                ${socialHtml(profile.socialLinks)}
              </div>
            </div>
          </div>
        </div>
        ${profile.bio ? `<p class="ap-bio">${esc(profile.bio)}</p>` : ''}
        <div class="ap-tracks">
          ${spot.tracks.map((t, i) => trackRow({ ...t, artistName: spot.artist }, i)).join('')}
        </div>
      </div>`;

    wire(mount, spot, profile, opts);
  }

  function wire(mount, spot, profile, opts) {
    const closeBtn = mount.querySelector('.ap-close');
    if (closeBtn && opts.onClose) closeBtn.addEventListener('click', opts.onClose);

    const socialBtn = mount.querySelector('.ap-social-btn');
    if (socialBtn) {
      const menu = mount.querySelector('.ap-social-menu');
      socialBtn.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        socialBtn.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', (e) => {
        if (!mount.contains(e.target) || (!socialBtn.contains(e.target) && !menu.contains(e.target))) {
          menu.hidden = true;
          socialBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // one shared <audio> for the whole page/lightbox — only one track plays at a time
    const audio = new Audio();
    let playingRow = null;
    function setRowPlaying(row, playing) {
      const btn = row.querySelector('.ap-track-play');
      btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      row.classList.toggle('is-playing', playing);
    }
    mount.querySelectorAll('.ap-track-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.ap-track');
        const i = Number(row.dataset.i);
        const track = spot.tracks[i];
        if (playingRow === row && !audio.paused) {
          audio.pause();
          setRowPlaying(row, false);
          playingRow = null;
          return;
        }
        if (playingRow) setRowPlaying(playingRow, false);
        if (window.mutraPauseMainPlayer) window.mutraPauseMainPlayer();
        if (audio.dataset.slug !== track.slug) {
          audio.src = track.snippetUrl;
          audio.dataset.slug = track.slug;
        }
        audio.play().catch(() => {});
        setRowPlaying(row, true);
        playingRow = row;
      });
    });
    audio.addEventListener('ended', () => { if (playingRow) setRowPlaying(playingRow, false); playingRow = null; });

    // lyrics — fetched once, lazily, on first expand of any row
    let lyricsPromise = null;
    function getLyrics() {
      if (!lyricsPromise) {
        lyricsPromise = profile.lyricsUrl
          ? fetch(profile.lyricsUrl).then(r => r.ok ? r.json() : {}).catch(() => ({}))
          : Promise.resolve({});
      }
      return lyricsPromise;
    }
    mount.querySelectorAll('.ap-track-lyr').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.ap-track');
        const panel = row.querySelector('.ap-lyrics');
        const open = panel.hidden;
        if (open) {
          btn.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
          if (!panel.dataset.loaded) {
            panel.textContent = 'Loading…';
            getLyrics().then(map => {
              const text = map[row.dataset.slug];
              panel.textContent = text || 'Lyrics not available for this track yet.';
              panel.dataset.loaded = '1';
            });
          }
        } else {
          btn.setAttribute('aria-expanded', 'false');
          panel.hidden = true;
        }
      });
    });
  }

  window.MutraArtist = { render, quoteMailto };
})();
