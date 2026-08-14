/* ═══════════ Mutra page — catalog, filters, sticky player w/ working seek ═══════════ */
(function () {
  const $ = s => document.querySelector(s);
  const fmt = t => (isNaN(t) || t == null) ? '0:00' : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const HELP_MAILTO = 'mailto:hello@snowstar.company?subject=' +
    encodeURIComponent('Mutra — help me find a track') + '&body=' +
    encodeURIComponent("Hi Snowstar,\n\nI'm after something you might not have in the catalog yet:\n\nBrief / reference:\nUsage:\nTimeline:\n\nThanks!");
  const mailto = title =>
    'mailto:hello@snowstar.company?subject=' + encodeURIComponent('Mutra license: ' + title) +
    '&body=' + encodeURIComponent(`Hi Snowstar,\n\nI'd like to license "${title}".\n\nUsage / media:\nTimeline:\n\nThanks!`);

  // real per-track waveform: 240 hex-encoded peak columns (mutra-waves.js),
  // drawn as a mirrored Artlist-style canvas; pseudo fallback if missing
  const pseudoWave = (seed, n = 240) => {
    const bars = new Uint8Array(n);
    let x = seed * 9301 + 49297;
    for (let i = 0; i < n; i++) {
      x = (x * 9301 + 49297) % 233280;
      bars[i] = 10 + Math.round((x / 233280) * 70);
    }
    return bars;
  };
  const waveCache = {};
  function waveform(track, seed) {
    if (waveCache[track.slug]) return waveCache[track.slug];
    let w;
    const hex = typeof MUTRA_WAVES !== 'undefined' && MUTRA_WAVES[track.slug];
    if (hex) {
      w = new Uint8Array(hex.length / 2);
      for (let i = 0; i < w.length; i++) w[i] = parseInt(hex.substr(i * 2, 2), 16);
    } else {
      w = pseudoWave(seed);
    }
    waveCache[track.slug] = w;
    return w;
  }

  // Artlist-style render: thin mirrored columns around the vertical center.
  // base = warm faint; played = gradient coral→amber up to `frac`.
  // read once per skin change rather than per bar
  let WAVE = { base: 'rgba(255,180,140,0.22)', played: '#ff6a4d', head: '#ffc24b', hi: 'rgba(255,180,140,.45)' };
  let HL_BAND = 'rgba(255,180,140,.07)';
  const HL = typeof MUTRA_HL !== 'undefined' ? MUTRA_HL : {};
  /** The suggested best bit, or nothing when highlights are switched off. */
  const hlOf = slug => (state.highlights && HL[slug]) || null;
  function readWaveColours() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (n, d) => (cs.getPropertyValue(n).trim() || d);
    WAVE = {
      base: pick('--wave-base', WAVE.base),
      played: pick('--wave-played', WAVE.played),
      head: pick('--wave-head', WAVE.head),
      hi: pick('--wave-hi', WAVE.hi || 'rgba(255,180,140,.45)'),
    };
    HL_BAND = pick('--wave-hi-band', 'rgba(255,180,140,.07)');
  }
  readWaveColours();

  function drawWave(canvas, peaks, frac, hl) {
    const dpr = devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw) return;
    if (canvas.width !== cw * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const n = peaks.length;
    const colW = cw / n;
    const barW = Math.max(1, colW * 0.62);
    const mid = ch / 2;
    const head = frac == null ? -1 : Math.floor(frac * n);
    let hs = -1, he = -1;
    if (hl) {
      hs = Math.floor(hl[0] * n); he = Math.ceil(hl[1] * n);
      ctx.fillStyle = HL_BAND;
      ctx.fillRect(hs * colW, 0, (he - hs) * colW, ch);
    }
    for (let i = 0; i < n; i++) {
      const h = Math.max(1, (peaks[i] / 99) * (ch * 0.96) / 2);
      if (i <= head) {
        ctx.fillStyle = i === head ? WAVE.head : WAVE.played;
      } else {
        ctx.fillStyle = (i >= hs && i < he) ? WAVE.hi : WAVE.base;
      }
      ctx.fillRect(i * colW, mid - h, barW, h * 2);
    }
  }

  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';
  const ICON_HEART = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 20.4l-1.4-1.3C5.6 14.6 2.7 12 2.7 8.7 2.7 6.1 4.7 4 7.3 4c1.5 0 2.9.7 3.8 1.8l.9 1.1.9-1.1C13.8 4.7 15.2 4 16.7 4c2.6 0 4.6 2.1 4.6 4.7 0 3.3-2.9 5.9-7.9 10.4L12 20.4z" fill="currentColor"/></svg>';
  const ICON_LINK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2A5 5 0 0 0 12.5 4.5l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2A5 5 0 0 0 11.5 19.5l1-1"/></svg>';
  const ICON_DL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16"/></svg>';
  const ICON_SIM = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 17V9M9 17V5M14 17v-6M19 17v-9"/></svg>';

  // small transient message (copy confirmations etc.)
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mutra-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  window.mutraToast = toast;

  // ── shared audio ──
  const audio = new Audio();
  audio.preload = 'none';
  let current = null; // { track, row }

  const player = $('#player'), plPlay = $('#plPlay'), plTitle = $('#plTitle'),
    plArtist = $('#plArtist'), plCur = $('#plCur'), plTot = $('#plTot'),
    plFill = $('#plFill'), plThumb = $('#plThumb'), plSeek = $('#plSeek'), plLic = $('#plLic'), plClose = $('#plClose');

  function setProgressUI(frac) {
    frac = Math.max(0, Math.min(1, frac || 0));
    plFill.style.width = (frac * 100) + '%';
    plThumb.style.left = (frac * 100) + '%';
    plSeek.setAttribute('aria-valuenow', Math.round(frac * 100));
    if (current) paintWave(current.row, frac);
  }
  function paintWave(row, frac) {
    const canvas = row.querySelector('.trk-wave canvas');
    if (canvas && canvas._peaks) drawWave(canvas, canvas._peaks, frac, hlOf(canvas._slug));
  }
  /** Redraw every visible waveform — used when the skin changes under us. */
  function repaintWaves() {
    const playing = current && audio.duration ? audio.currentTime / audio.duration : null;
    document.querySelectorAll('.trk-wave canvas').forEach(c => {
      if (!c._peaks) return;
      const row = c.closest('.trk');
      drawWave(c, c._peaks, current && row === current.row ? playing : null, hlOf(c._slug));
    });
  }

  /** Licensing needs an account; the draft opens in its own tab so the catalog stays put. */
  function startLicense(track) {
    if (!(window.SnowstarAccount && SnowstarAccount.user)) {
      toast('Sign in to start a license');
      if (window.SnowstarOpenAuth) SnowstarOpenAuth('login', 'Sign in to start a license for this track.');
      return;
    }
    if (window.mutraTrack) mutraTrack('license', track.slug);
    window.open(mailto(track.title), '_blank', 'noopener');
  }

  function loadTrack(track, row) {
    if (window.mutraTrack) mutraTrack('play', track.slug, { once: true });
    if (current && current.track === track) { toggle(); return; }
    if (current) current.row.classList.remove('playing');
    current = { track, row };
    row.classList.add('playing');
    audio.src = track.audio;
    audio.currentTime = 0;
    // with highlights on, drop the needle on the best bit rather than the intro
    const hl = hlOf(track.slug);
    if (hl) {
      const seek = () => {
        if (audio.duration) audio.currentTime = hl[0] * audio.duration;
        audio.removeEventListener('loadedmetadata', seek);
      };
      audio.addEventListener('loadedmetadata', seek);
    }
    audio.play().catch(() => {});
    plTitle.textContent = track.title;
    plArtist.textContent = track.artist + (track.bpm ? ' · ' + track.bpm + ' BPM' : '');
    plTot.textContent = fmt(track.duration);
    plCur.textContent = '0:00';
    setProgressUI(0);
    player.classList.add('up');
    document.body.querySelectorAll('.trk .trk-play').forEach(b => b.innerHTML = ICON_PLAY);
    row.querySelector('.trk-play').innerHTML = ICON_PAUSE;
  }
  function toggle() {
    if (!current) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function closePlayer() {
    audio.pause(); audio.src = '';
    if (current) current.row.classList.remove('playing');
    current = null;
    player.classList.remove('up');
  }

  audio.addEventListener('timeupdate', () => {
    if (!current || !audio.duration) return;
    setProgressUI(audio.currentTime / audio.duration);
    plCur.textContent = fmt(audio.currentTime);
    plTot.textContent = fmt(audio.duration);
  });
  audio.addEventListener('play', () => {
    plPlay.innerHTML = ICON_PAUSE;
    if (current) current.row.querySelector('.trk-play').innerHTML = ICON_PAUSE;
  });
  audio.addEventListener('pause', () => {
    plPlay.innerHTML = ICON_PLAY;
    if (current) current.row.querySelector('.trk-play').innerHTML = ICON_PLAY;
  });
  audio.addEventListener('ended', () => { setProgressUI(0); plCur.textContent = '0:00'; });

  plPlay.innerHTML = ICON_PLAY;
  plPlay.addEventListener('click', toggle);
  plLic.addEventListener('click', e => { e.preventDefault(); if (current) startLicense(current.track); });
  plClose.addEventListener('click', closePlayer);

  // ── the fix: robust seek (click + drag) on a generous hit area ──
  function seekFromEvent(e) {
    if (!current || !audio.duration) return;
    const r = plSeek.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const frac = Math.max(0, Math.min(1, x / r.width));
    audio.currentTime = frac * audio.duration;
    setProgressUI(frac);
    plCur.textContent = fmt(audio.currentTime);
  }
  let dragging = false;
  const startDrag = e => { dragging = true; player.classList.add('seeking'); seekFromEvent(e); e.preventDefault(); };
  const moveDrag = e => { if (dragging) seekFromEvent(e); };
  const endDrag = () => { dragging = false; player.classList.remove('seeking'); };
  plSeek.addEventListener('mousedown', startDrag);
  plSeek.addEventListener('touchstart', startDrag, { passive: false });
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('touchmove', moveDrag, { passive: false });
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
  plSeek.addEventListener('keydown', e => {
    if (!current || !audio.duration) return;
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  // ── render catalog ──
  // Artlist-style faceted browse: "packages" (the licensing bundles the catalog is
  // organized into on the Wix side) and "genres" are each multi-select (OR within a
  // facet), facets combine with AND, same Set-based pattern as the homepage Work grid.
  const tracksEl = $('#tracks');
  const PAGE = 40;   // rows added per scroll-in
  const facet = () => ({ inc: new Set(), exc: new Set() });
  const state = {
    packages: facet(), genres: facet(), moods: facet(), instruments: facet(), scales: facet(),
    vocal: null, dur: null, bpm: null, q: '', favoritesOnly: false,
    sort: 'picks', highlights: true, lyrics: false, keys: false,
  };
  const SORTS = [
    { id: 'picks', label: 'Staff picks' },
    { id: 'bpm',   label: 'BPM' },
    { id: 'alpha', label: 'Alphabetic' },
    { id: 'custom', label: 'Custom license' },
  ];
  const PITCH = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const pitchIx = k => { const i = PITCH.indexOf(k); return i < 0 ? 99 : i; };
  const DURATIONS = [
    { id: 'd30',  label: '< 30 sec', test: d => d < 30 },
    { id: 'd60',  label: '< 1 min',  test: d => d < 60 },
    { id: 'd90',  label: '< 1.5 min', test: d => d < 90 },
    { id: 'd3',   label: '3+ min',   test: d => d >= 180 },
    { id: 'd4',   label: '4+ min',   test: d => d >= 240 },
  ];
  // bounds come from the catalog itself, so both handles reach real music
  const BPM_ALL = MUTRA.tracks.map(t => t.bpm).filter(Boolean);
  const BPM_MIN = Math.floor(Math.min(...BPM_ALL) / 5) * 5;
  const BPM_MAX = Math.ceil(Math.max(...BPM_ALL) / 5) * 5;

  function matches(t) {
    if (state.favoritesOnly && !(window.MutraMembers && MutraMembers.isFavorite(t.slug))) return false;
    const sc = state.scales;
    if (sc.inc.size && !sc.inc.has(scaleOf(t))) return false;
    if (sc.exc.size && sc.exc.has(scaleOf(t))) return false;
    for (const key of ['packages', 'genres', 'moods', 'instruments']) {
      const vals = t[key] || [], f = state[key];
      if (f.inc.size && !vals.some(v => f.inc.has(v))) return false;
      if (f.exc.size && vals.some(v => f.exc.has(v))) return false;
    }
    if (state.vocal && t.vocal !== state.vocal) return false;
    if (state.dur) {
      const d = DURATIONS.find(x => x.id === state.dur);
      if (d && !d.test(t.duration || 0)) return false;
    }
    if (state.bpm) {
      // a tempo filter can't match a track that has no tempo (the SFX stings)
      if (!t.bpm || t.bpm < state.bpm.min || t.bpm > state.bpm.max) return false;
    }
    if (state.q) {
      const hay = (t.title + ' ' + t.genres.join(' ') + ' ' + (t.moods || []).join(' ') + ' ' +
        (t.instruments || []).join(' ')).toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  }

  /** "Staff picks" has no curation data yet, so it ranks by how many packages a
      track was collected into — a track Ori reused across packs is one he rates. */
  const pickScore = t => (t.packages || []).length * 10 + ((t.genres || []).length ? 1 : 0);
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const SORTERS = {
    picks: (a, b) => pickScore(b) - pickScore(a) || byTitle(a, b),
    alpha: byTitle,
    bpm:   (a, b) => (a.bpm || 1e9) - (b.bpm || 1e9) || byTitle(a, b),
    // unpackaged one-offs first — those are the ones that tend to need a bespoke quote
    custom: (a, b) => ((a.packages || []).length ? 1 : 0) - ((b.packages || []).length ? 1 : 0) || byTitle(a, b),
    // chromatic, majors before minors within a pitch
    scale: (a, b) => pitchIx(a.key) - pitchIx(b.key) ||
      (a.scale === b.scale ? 0 : a.scale === 'major' ? -1 : 1) || byTitle(a, b),
  };

  /** "F# minor" reads as "F#m" in a dense row. */
  function keyLabel(t) {
    if (!t.key) return '';
    return t.key + (t.scale === 'minor' ? 'm' : '');
  }

  /** Mark the titles that don't fit and tell each one how far to slide. */
  function measureTitles() {
    tracksEl.querySelectorAll('.trk-title').forEach(el => {
      const inner = el.querySelector('.tt-in');
      if (!inner) return;
      const over = inner.scrollWidth - el.clientWidth;
      el.classList.toggle('clipped', over > 2);
      if (over > 2) {
        el.style.setProperty('--mq-shift', -(over + 8) + 'px');
        // a steady ~55px/sec, so long titles don't crawl and short ones don't snap
        el.style.setProperty('--mq-dur', Math.min(4, Math.max(0.5, (over + 8) / 55)).toFixed(2) + 's');
      } else {
        el.style.removeProperty('--mq-shift');
        el.style.removeProperty('--mq-dur');
      }
    });
  }

  let list = [], shown = 0;

  function render() {
    list = MUTRA.tracks.filter(matches).sort(SORTERS[state.sort] || SORTERS.picks);
    shown = 0;
    tracksEl.innerHTML = '';
    if (!list.length) {
      tracksEl.innerHTML = `<div class="cat-empty">
        <h3>Looking for something specific?</h3>
        <p>Let us help you find it.</p>
        <a class="mbtn mbtn-solid" href="${HELP_MAILTO}">Get in touch</a>
      </div>`;
    }
    appendPage();
  }

  /** Draw the next slice — called on render and again as the sentinel scrolls in. */
  function appendPage() {
    const slice = list.slice(shown, shown + PAGE);
    shown += slice.length;
    requestAnimationFrame(measureTitles);
    slice.forEach(track => {
      const i = MUTRA.tracks.indexOf(track);
      const row = document.createElement('div');
      row.className = 'trk' + (current && current.track === track ? ' playing' : '');
      const tags = [
        ...track.genres.slice(0, 2).map(g => `<button class="tag" data-facet="genres" data-val="${g}">${g}</button>`),
        ...(track.moods || []).slice(0, 2).map(x => `<button class="tag mood" data-facet="moods" data-val="${x}">${x}</button>`),
        ...(track.instruments || []).slice(0, 2).map(x => `<button class="tag inst" data-facet="instruments" data-val="${x}">${x}</button>`),
      ].join('');
      row.innerHTML = `
        <button class="trk-play" aria-label="Play ${track.title}">${current && current.track === track && !audio.paused ? ICON_PAUSE : ICON_PLAY}</button>
        <img class="trk-cover" src="${track.cover}" alt="" loading="lazy">
        <div class="trk-id">
          <div class="trk-title"><span class="tt-in">${track.title}</span></div>
          <div class="trk-artist">${track.artist}</div>
        </div>
        <div class="trk-wave" role="button" aria-label="Seek ${track.title}"><canvas></canvas></div>
        <div class="trk-tags">${tags}</div>
        <div class="trk-right">
          <button class="trk-fav" aria-label="Save ${track.title}" title="Save to favorites">${ICON_HEART}</button>
          <button class="trk-dl" aria-label="Download ${track.title}" title="Download">${ICON_DL}</button>
          <button class="trk-share" aria-label="Copy link to ${track.title}" title="Copy link">${ICON_LINK}</button>
          <button class="trk-sim" aria-label="Similar to ${track.title}" title="Find similar">${ICON_SIM}</button>
          <span class="trk-lyr${track.vocal === 'Vocals' ? '' : ' none'}" title="Has lyrics">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6h11M4 10h13M4 14h8"/><path d="M19 12v6.2"/><circle cx="17.2" cy="18.6" r="1.8" fill="currentColor" stroke="none"/></svg>
          </span>
          <span class="trk-key" title="${track.key ? track.key + ' ' + track.scale : ''}">${keyLabel(track)}</span>
          ${track.bpm ? `<button class="trk-bpm" title="${track.bpm} BPM — filter by this tempo">${track.bpm}<i>bpm</i></button>` : '<span class="trk-bpm empty" aria-hidden="true"></span>'}
          <span class="trk-dur">${fmt(track.duration)}</span>
          <button class="trk-lic" type="button">License</button>
        </div>`;
      row.querySelector('.trk-play').addEventListener('click', () => loadTrack(track, row));
      row.querySelector('.trk-lic').addEventListener('click', () => startLicense(track));

      const bpmBtn = row.querySelector('button.trk-bpm');
      if (bpmBtn) bpmBtn.addEventListener('click', e => { e.stopPropagation(); filterByBpm(track.bpm); });

      row.querySelectorAll('.tag[data-facet]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        mutraFilterBy(btn.dataset.facet, btn.dataset.val);
      }));

      // favorite
      const favBtn = row.querySelector('.trk-fav');
      const syncFav = () => favBtn.classList.toggle('on', !!(window.MutraMembers && MutraMembers.isFavorite(track.slug)));
      syncFav();
      favBtn._sync = syncFav;
      favBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (window.MutraMembers) MutraMembers.toggleFavorite(track.slug);
        if (window.mutraTrack && !favBtn.classList.contains('on')) mutraTrack('favorite', track.slug);
      });

      // download — members only; everything else on the page stays open
      row.querySelector('.trk-dl').addEventListener('click', async e => {
        e.stopPropagation();
        if (!(window.MutraMembers && MutraMembers.user)) {
          toast('Create a free account to download');
          if (window.MutraOpenAuth) MutraOpenAuth('signup', 'Sign up to download tracks — browsing and previews stay free.');
          return;
        }
        if (window.mutraTrack) mutraTrack('download', track.slug);
        toast('Preparing ' + track.title + '…');
        location.href = '/api/download?slug=' + encodeURIComponent(track.slug);
      });

      // copy a direct link to this track
      row.querySelector('.trk-share').addEventListener('click', async e => {
        e.stopPropagation();
        const url = location.origin + location.pathname + '?track=' + encodeURIComponent(track.slug);
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied');
        } catch {
          // clipboard blocked (insecure context / permissions) — show it to copy by hand
          prompt('Copy this link:', url);
        }
      });

      // similar tracks
      row.querySelector('.trk-sim').addEventListener('click', e => {
        e.stopPropagation();
        showSimilar(track, row);
      });
      // seeking by clicking a track's own waveform (only when it's the playing track)
      const wave = row.querySelector('.trk-wave');
      wave.addEventListener('click', e => {
        if (!current || current.track !== track) { loadTrack(track, row); return; }
        if (!audio.duration) return;
        const r = wave.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      });
      const cnv = row.querySelector('.trk-wave canvas');
      cnv._peaks = waveform(track, i + 1);
      cnv._slug = track.slug;
      tracksEl.appendChild(row);
      const isCur = current && current.track === track;
      requestAnimationFrame(() => drawWave(cnv, cnv._peaks,
        current && current.track === track && audio.duration ? audio.currentTime / audio.duration : null,
        hlOf(track.slug)))
    });
    sentinel.hidden = shown >= list.length;
    // keep the live "playing" row reference valid after a re-render
    if (current) {
      const live = [...tracksEl.querySelectorAll('.trk')].find((_, idx) => list[idx] === current.track);
      if (live) current.row = live;
    }
  }

  // load the next page as the end of the list comes into view
  const sentinel = document.createElement('div');
  sentinel.className = 'cat-sentinel';
  sentinel.hidden = true;
  tracksEl.insertAdjacentElement('afterend', sentinel);
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && shown < list.length) appendPage();
  }, { rootMargin: '600px 0px' }).observe(sentinel);

  // keep canvas waveforms crisp on window resize
  let rsz;
  addEventListener('resize', () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => {
      tracksEl.querySelectorAll('.trk-wave canvas').forEach(c => {
        if (!c._peaks) return;
        const row = c.closest('.trk');
        const isCur = current && current.row === row;
        drawWave(c, c._peaks, isCur && audio.duration ? audio.currentTime / audio.duration : null, hlOf(c._slug));
      });
    }, 150);
  });

  // ── filter bar: a category opens a drawer of chips that pushes the list down ──
  const fbar = $('#fbar'), fdrop = $('#fdrop'), fpills = $('#fpills');
  const FACETS = {
    packages:    { label: 'Package',    values: () => MUTRA.packages },
    genres:      { label: 'Genre',      values: () => MUTRA.genres },
    moods:       { label: 'Mood',       values: () => MUTRA.moods },
    instruments: { label: 'Instrument', values: () => INSTRUMENTS },
    scales:      { label: 'Scale',      values: () => SCALES },
  };
  // built from the catalog so it stays honest as the tagging is refined
  const INSTRUMENTS = [...new Set(MUTRA.tracks.flatMap(t => t.instruments || []))].sort();
  const scaleOf = t => (t.key ? t.key + ' ' + t.scale : '');
  // chromatic rather than alphabetical, so the list reads like a keyboard
  const SCALES = [...new Set(MUTRA.tracks.map(scaleOf).filter(Boolean))]
    .sort((a, b) => {
      const [ka, sa] = a.split(' '), [kb, sb] = b.split(' ');
      return pitchIx(ka) - pitchIx(kb) || (sa === sb ? 0 : sa === 'major' ? -1 : 1);
    });
  let openCat = null;

  const chip = (label, on, cls) =>
    `<button class="chip${on ? ' active' : ''}${cls ? ' ' + cls : ''}">${label}</button>`;
  /** Facet chips carry three states, so you can say "not this" as well as "this". */
  const triChip = (label, mode) =>
    `<button class="chip tri${mode ? ' ' + mode : ''}" title="${
      mode === 'inc' ? 'Included — click to exclude' :
      mode === 'exc' ? 'Excluded — click to clear' : 'Click to include, again to exclude'}">${
      mode === 'exc' ? '<b>−</b>' : ''}${label}</button>`;
  const modeOf = (f, v) => f.inc.has(v) ? 'inc' : f.exc.has(v) ? 'exc' : '';
  function cycle(f, v) {
    if (f.inc.has(v)) { f.inc.delete(v); f.exc.add(v); return 'exc'; }
    if (f.exc.has(v)) { f.exc.delete(v); return ''; }
    f.inc.add(v); return 'inc';
  }

  function drawDrop() {
    if (!openCat) { fdrop.hidden = true; fdrop.innerHTML = ''; return; }
    fdrop.hidden = false;
    if (openCat === 'adv') {
      fdrop.innerHTML = `
        <div class="fgrid">
          <div class="fgroup">
            <h4>Vocals / Instrumental</h4>
            <div class="fchips" data-group="vocal">
              ${['Vocals', 'Instrumental'].map(v => chip(v, state.vocal === v)).join('')}
            </div>
          </div>
          <div class="fgroup">
            <h4>Duration</h4>
            <div class="fchips" data-group="dur">
              ${DURATIONS.map(d => chip(d.label, state.dur === d.id)).join('')}
            </div>
          </div>
          <div class="fgroup">
            <h4>BPM</h4>
            <div class="brange">
              <div class="brange-rail"><span class="brange-fill"></span></div>
              <input type="range" class="brange-in brange-lo" min="${BPM_MIN}" max="${BPM_MAX}" step="1"
                     value="${state.bpm ? state.bpm.min : BPM_MIN}" aria-label="Minimum BPM">
              <input type="range" class="brange-in brange-hi" min="${BPM_MIN}" max="${BPM_MAX}" step="1"
                     value="${state.bpm ? state.bpm.max : BPM_MAX}" aria-label="Maximum BPM">
            </div>
            <div class="brange-nums">
              <input type="number" class="bnum bnum-lo" min="${BPM_MIN}" max="${BPM_MAX}"
                     value="${state.bpm ? state.bpm.min : BPM_MIN}" aria-label="Minimum BPM">
              <span>to</span>
              <input type="number" class="bnum bnum-hi" min="${BPM_MIN}" max="${BPM_MAX}"
                     value="${state.bpm ? state.bpm.max : BPM_MAX}" aria-label="Maximum BPM">
              <span class="bnum-unit">BPM</span>
              <button type="button" class="brange-reset"${state.bpm ? '' : ' hidden'}>Reset</button>
            </div>
          </div>
        </div>
        <button class="fdrop-close" type="button">Close</button>`;
      fdrop.querySelectorAll('.fchips').forEach(box => {
        const group = box.dataset.group;
        [...box.children].forEach((btn, i) => btn.addEventListener('click', () => {
          const val = group === 'vocal' ? ['Vocals', 'Instrumental'][i] : DURATIONS[i].id;
          state[group] = state[group] === val ? null : val;   // click again to clear
          drawDrop(); drawPills(); render();
        }));
      });
      wireBpmRange();
    } else {
      const def = FACETS[openCat], vals = def.values(), f = state[openCat];
      fdrop.innerHTML =
        `<p class="fhint">Click to include · click again to exclude</p>` +
        `<div class="fchips wide">${vals.map(v => triChip(v, modeOf(f, v))).join('')}</div>` +
        `<button class="fdrop-close" type="button">Close</button>`;
      [...fdrop.querySelector('.fchips').children].forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const mode = cycle(f, vals[i]);
          btn.className = 'chip tri' + (mode ? ' ' + mode : '');
          btn.innerHTML = (mode === 'exc' ? '<b>−</b>' : '') + vals[i];
          drawPills(); render();
        });
      });
    }
    fdrop.querySelector('.fdrop-close').addEventListener('click', closeDrawer);
  }

  /** Dual-handle slider + typed boxes, kept in step with each other. */
  function wireBpmRange() {
    const lo = fdrop.querySelector('.brange-lo'), hi = fdrop.querySelector('.brange-hi');
    const nlo = fdrop.querySelector('.bnum-lo'), nhi = fdrop.querySelector('.bnum-hi');
    const fill = fdrop.querySelector('.brange-fill'), reset = fdrop.querySelector('.brange-reset');
    if (!lo) return;
    let raf = 0;

    const paint = () => {
      const a = +lo.value, b = +hi.value, span = BPM_MAX - BPM_MIN;
      fill.style.left = ((a - BPM_MIN) / span * 100) + '%';
      fill.style.right = ((BPM_MAX - b) / span * 100) + '%';
      nlo.value = a; nhi.value = b;
      reset.hidden = (a === BPM_MIN && b === BPM_MAX);
    };

    const commit = () => {
      const a = +lo.value, b = +hi.value;
      state.bpm = (a === BPM_MIN && b === BPM_MAX) ? null : { min: a, max: b };
            drawPills();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);   // one render per frame, not per pixel
    };

    // handles can't cross
    lo.addEventListener('input', () => { if (+lo.value > +hi.value) lo.value = hi.value; paint(); commit(); });
    hi.addEventListener('input', () => { if (+hi.value < +lo.value) hi.value = lo.value; paint(); commit(); });

    const fromBox = (box, slider, isLo) => box.addEventListener('change', () => {
      let v = parseInt(box.value, 10);
      if (isNaN(v)) v = isLo ? BPM_MIN : BPM_MAX;
      v = Math.max(BPM_MIN, Math.min(BPM_MAX, v));
      slider.value = v;
      if (+lo.value > +hi.value) (isLo ? hi : lo).value = v;
      paint(); commit();
    });
    fromBox(nlo, lo, true);
    fromBox(nhi, hi, false);

    reset.addEventListener('click', () => {
      lo.value = BPM_MIN; hi.value = BPM_MAX;
      paint(); commit();
    });
    paint();
  }

  function closeDrawer() {
    openCat = null;
    fbar.querySelectorAll('.fcat[data-cat]').forEach(b => {
      b.classList.remove('open'); b.setAttribute('aria-expanded', 'false');
    });
    drawDrop();
  }

  function setCat(cat) {
    if (!cat) return;                      // never let a non-category open the drawer
    openCat = openCat === cat ? null : cat;
    fbar.querySelectorAll('.fcat[data-cat]').forEach(b => {
      const isOpen = b.dataset.cat === openCat;
      b.classList.toggle('open', isOpen);
      b.setAttribute('aria-expanded', String(isOpen));
    });
    drawDrop();
  }
  fbar.querySelectorAll('.fcat[data-cat]').forEach(b =>
    b.addEventListener('click', () => setCat(b.dataset.cat)));

  /** The chosen filters, as removable pills — so nothing is ever hidden from you. */
  function drawPills() {
    const bits = [];
    Object.keys(FACETS).forEach(k => {
      state[k].inc.forEach(v => bits.push({ k, v, label: v, mode: 'inc' }));
      state[k].exc.forEach(v => bits.push({ k, v, label: '− ' + v, mode: 'exc' }));
    });
    if (state.vocal) bits.push({ k: 'vocal', v: state.vocal, label: state.vocal });
    if (state.dur) bits.push({ k: 'dur', v: state.dur, label: (DURATIONS.find(d => d.id === state.dur) || {}).label });
    if (state.bpm) bits.push({ k: 'bpm', v: state.bpm, label: state.bpm.min + '–' + state.bpm.max + ' BPM' });
    fpills.innerHTML = bits.map((b, i) =>
      `<button class="fpill${b.mode === 'exc' ? ' fpill-exc' : ''}" data-i="${i}">${b.label}<span aria-hidden="true">&times;</span></button>`).join('') +
      (bits.length > 1 ? '<button class="fpill fpill-clear">Clear all</button>' : '');
    fpills.querySelectorAll('.fpill[data-i]').forEach(el => el.addEventListener('click', () => {
      const b = bits[+el.dataset.i];
      if (b.k in FACETS) { state[b.k].inc.delete(b.v); state[b.k].exc.delete(b.v); }
      else state[b.k] = null;
      drawDrop(); drawPills(); render();
    }));
    const clear = fpills.querySelector('.fpill-clear');
    if (clear) clear.addEventListener('click', clearFilters);
  }

  function clearFilters() {
    Object.keys(FACETS).forEach(k => { state[k].inc.clear(); state[k].exc.clear(); });
    state.vocal = state.dur = state.bpm = null;
    state.favoritesOnly = false;
    const fav = $('#favToggle'); if (fav) fav.classList.remove('active');
    drawDrop(); drawPills(); render();
  }

  /** Clicking a track's BPM filters to the band it falls in. */
  function filterByBpm(bpm) {
    const min = Math.max(BPM_MIN, bpm - 5), max = Math.min(BPM_MAX, bpm + 5);
    const same = state.bpm && state.bpm.min === min && state.bpm.max === max;
    state.bpm = same ? null : { min, max };
    drawDrop(); drawPills(); render();
    toast(same ? 'Tempo filter cleared' : 'Tempo ' + min + '–' + max + ' BPM');
  }

  /** A tag on a row is a shortcut into the filter it belongs to. */
  window.mutraFilterBy = function (facet, value) {
    if (!state[facet] || !state[facet].inc) return;
    state[facet].exc.delete(value);
    state[facet].inc.add(value);
    drawPills(); render();
    $('#catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(value + ' added to your filters');
  };

  let searchLog;
  $('#search').addEventListener('input', e => {
    state.q = e.target.value.trim().toLowerCase();
    render();
    clearTimeout(searchLog);
    const term = state.q;
    if (term.length >= 3) searchLog = setTimeout(() => {
      if (window.mutraTrack) mutraTrack('search', term, { once: true });
    }, 1200);
  });

  /** Drop every filter (used when a deep link needs to reveal a hidden track). */
  function syncChips() { clearFilters(); }

  // "My favorites" toggle, sitting with the filters
  const favToggle = document.createElement('button');
  favToggle.id = 'favToggle';
  favToggle.className = 'chip fav-chip fcat-fav';
  favToggle.setAttribute('aria-label', 'My favorites');
  favToggle.title = 'My favorites';
  favToggle.innerHTML = ICON_HEART + '<span>My favorites</span>';
  favToggle.addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    favToggle.classList.toggle('active', state.favoritesOnly);
    render();
  });
  fbar.appendChild(favToggle);   // far right, after Filters

  // ── sort ──
  const sortBtn = $('#sortBtn'), sortMenu = $('#sortMenu'), sortLabel = $('#sortLabel');
  function drawSortMenu() {
    // sorting by key only makes sense while keys are on screen
    const opts = state.keys ? SORTS.concat([{ id: 'scale', label: 'Scale' }]) : SORTS;
    sortMenu.innerHTML = opts.map(o =>
      `<button type="button" data-sort="${o.id}"${o.id === state.sort ? ' class="on"' : ''}>${o.label}</button>`).join('');
    sortMenu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      state.sort = b.dataset.sort;
      sortLabel.textContent = b.textContent;
      sortMenu.hidden = true; sortBtn.setAttribute('aria-expanded', 'false');
      drawSortMenu(); render();
    }));
  }
  drawSortMenu();
  sortBtn.addEventListener('click', e => {
    e.stopPropagation();
    sortMenu.hidden = !sortMenu.hidden;
    sortBtn.setAttribute('aria-expanded', String(!sortMenu.hidden));
  });
  addEventListener('click', () => { if (!sortMenu.hidden) { sortMenu.hidden = true; sortBtn.setAttribute('aria-expanded','false'); } });

  // ── highlights ──
  const hlBtn = $('#hlToggle');
  function paintHlBtn() {
    hlBtn.classList.toggle('on', state.highlights);
    hlBtn.setAttribute('aria-pressed', String(state.highlights));
  }
  const lyrBtn = $('#lyrToggle'), keyBtn = $('#keyToggle');
  const scaleCat = () => fbar.querySelector('[data-cat=scales]');
  function syncScaleCat() {
    const b = scaleCat();
    if (!b) return;
    b.hidden = !state.keys;
    if (!state.keys && (state.scales.inc.size || state.scales.exc.size)) {
      state.scales.inc.clear(); state.scales.exc.clear();
      if (openCat === 'scales') closeDrawer();
      drawPills(); render();
    }
  }

  function paintToggle(btn, on, cls) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle(cls, !on);
  }
  /** A full turn, so the icon always lands the right way up. */
  function spin(btn) {
    const ico = btn.querySelector('svg');
    ico.classList.remove('spin');
    void ico.offsetWidth;              // restart the animation
    ico.classList.add('spin');
  }
  lyrBtn.addEventListener('click', () => {
    state.lyrics = !state.lyrics;
    spin(lyrBtn);
    paintToggle(lyrBtn, state.lyrics, 'no-lyr');
    toast(state.lyrics ? 'Showing which tracks have lyrics' : 'Lyrics flag hidden');
  });
  keyBtn.addEventListener('click', () => {
    state.keys = !state.keys;
    spin(keyBtn);
    paintToggle(keyBtn, state.keys, 'no-key');
    syncScaleCat();
    if (!state.keys && state.sort === 'scale') {   // that sort just lost its meaning
      state.sort = 'picks';
      sortLabel.textContent = 'Staff picks';
      render();
    }
    drawSortMenu();
    toast(state.keys ? 'Keys on — you can now sort by scale' : 'Keys hidden');
  });
  paintToggle(lyrBtn, state.lyrics, 'no-lyr');
  paintToggle(keyBtn, state.keys, 'no-key');
  syncScaleCat();

  hlBtn.addEventListener('click', () => {
    state.highlights = !state.highlights;
    spin(hlBtn);
    paintHlBtn(); repaintWaves();
    toast(state.highlights ? 'Highlights on — play starts at the best bit' : 'Highlights off — play starts at 0:00');
  });
  paintHlBtn();

  render();

  // repaint hearts (and the favorites view) whenever membership state changes
  if (window.MutraMembers) {
    MutraMembers.onChange(() => {
      tracksEl.querySelectorAll('.trk-fav').forEach(b => b._sync && b._sync());
      if (state.favoritesOnly) render();
      const c = $('#favCount');
      if (c) c.textContent = MutraMembers.favorites.size || '';
    });
  }

  // ── deep link: ?track=slug opens (and plays) that track ──
  (function deepLink() {
    const slug = new URLSearchParams(location.search).get('track');
    if (!slug) return;
    // wait a tick so the first render + waveforms exist
    setTimeout(() => focusTrack(slug, true), 300);
  })();

  // ── "sounds like this" — neighbours precomputed from the audio itself ──
  function showSimilar(track, row) {
    // clicking the same track's button again closes the panel
    const open = row.nextElementSibling;
    const wasMine = open && open.classList.contains('sim-panel') && open.dataset.slug === track.slug;
    document.querySelectorAll('.sim-panel').forEach(p => p.remove());
    if (wasMine) return;
    const slugs = (typeof MUTRA_SIMILAR !== 'undefined' && MUTRA_SIMILAR[track.slug]) || [];
    const panel = document.createElement('div');
    panel.className = 'sim-panel';
    panel.dataset.slug = track.slug;
    if (!slugs.length) {
      panel.innerHTML = `<div class="sim-head">No close matches for <b>${track.title}</b></div>`;
    } else {
      const bySlug = Object.fromEntries(MUTRA.tracks.map(t => [t.slug, t]));
      const items = slugs.map(s => bySlug[s]).filter(Boolean).map(t => `
        <button class="sim-item" data-slug="${t.slug}">
          <img src="${t.cover}" alt="" loading="lazy">
          <span class="sim-t">${t.title}</span>
          <span class="sim-m">${[...t.genres.slice(0,1), ...(t.moods||[]).slice(0,1)].join(' · ')}</span>
        </button>`).join('');
      panel.innerHTML = `<div class="sim-head">Sounds like <b>${track.title}</b>
        <button class="sim-close" aria-label="Close">&times;</button></div>
        <div class="sim-list">${items}</div>`;
    }
    row.insertAdjacentElement('afterend', panel);
    const close = panel.querySelector('.sim-close');
    if (close) close.addEventListener('click', () => panel.remove());
    panel.querySelectorAll('.sim-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = MUTRA.tracks.find(x => x.slug === btn.dataset.slug);
        if (!t) return;
        // play it in the sticky player and stay put — losing your place in the
        // list is a worse trade than not seeing the row highlighted
        const liveRow = [...tracksEl.querySelectorAll('.trk')]
          .find(r => r.querySelector('.trk-wave canvas')?._slug === t.slug);
        loadTrack(t, liveRow || row);
        panel.querySelectorAll('.sim-item').forEach(b => b.classList.toggle('playing', b === btn));
      });
    });
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Scroll to a track (expanding the list if needed), optionally play it. */
  function focusTrack(slug, play) {
    const t = MUTRA.tracks.find(x => x.slug === slug);
    if (!t) return false;
    if (!matches(t)) { // clear filters that would hide it
      clearFilters(); state.q = '';
      const s = $('#search'); if (s) s.value = '';
      syncChips();
    }
    render();
    // the track may sit past the first page, so keep loading until it exists
    let guard = 0;
    while (shown < list.length && list.indexOf(t) >= shown && guard++ < 40) appendPage();
    const row = [...tracksEl.querySelectorAll('.trk')][list.indexOf(t)];
    if (!row) return false;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1600);
    if (play) loadTrack(t, row);
    return true;
  }
  window.MutraFocusTrack = focusTrack;

  // ── hero: a glow that follows the pointer and shifts colour with it ──
  (function heroGlow() {
    const hero = $('#mhero');
    if (!hero) return;
    // the ramp is defined per skin in css/skins.css, left → right
    let PALETTE = [];
    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      PALETTE = [1, 2, 3, 4].map(i =>
        [cs.getPropertyValue('--glow' + i + 'a').trim() || '#ff6a4d',
         cs.getPropertyValue('--glow' + i + 'b').trim() || '#ff3d8b']);
    }
    readPalette();
    addEventListener('mutraskin', () => { readPalette(); readWaveColours(); repaintWaves(); queue(); });
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tx = 50, ty = 42, x = 50, y = 42, raf = 0;

    function paint() {
      raf = 0;
      x += (tx - x) * (still ? 1 : 0.12);
      y += (ty - y) * (still ? 1 : 0.12);
      const band = PALETTE[Math.min(PALETTE.length - 1, Math.floor((x / 100) * PALETTE.length))];
      hero.style.setProperty('--gx', x.toFixed(2) + '%');
      hero.style.setProperty('--gy', y.toFixed(2) + '%');
      hero.style.setProperty('--g1', band[0]);
      hero.style.setProperty('--g2', band[1]);
      if (!still && (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1)) raf = requestAnimationFrame(paint);
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };

    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
      queue();
    });

    // touch screens never hover, so let it drift on its own
    if (!still && !matchMedia('(hover: hover)').matches) {
      let t = 0;
      setInterval(() => {
        t += 0.02;
        tx = 50 + Math.sin(t) * 34;
        ty = 42 + Math.cos(t * 0.7) * 16;
        queue();
      }, 60);
    }
    paint();
  })();

  // ── trusted-by marquee: best-known brands first, then the rest ──
  (function clientMarquee() {
    const track = $('#clientTrack');
    if (!track) return;
    const LOGOS = [
      10, 2, 7, 4, 23, 19, 20, 21, 12, 1, 17, 3, 14,   // Pepsi, Doritos, Intel, Subaru, Unilever…
      6, 8, 11, 18, 16, 5, 0, 9, 24, 29, 22, 30, 27,   // agencies, then the Israeli names
      13, 26, 25, 28, 15,
    ];
    const MIXED = new Set([2, 19]); // carry their own dark ink, so they don't get inverted
    const html = LOGOS.map(n => {
      const id = String(n).padStart(2, '0');
      return `<img src="assets/clients/logo${id}.png" alt="" loading="lazy"` +
             (MIXED.has(n) ? ' data-tone="mixed"' : '') + '>';
    }).join('');
    track.innerHTML = html + html;   // doubled so the loop is seamless
  })();

  const heroSignup = $('#heroSignup');
  if (heroSignup) heroSignup.addEventListener('click', () => {
    if (window.SnowstarOpenAuth) SnowstarOpenAuth('signup');
  });

  addEventListener('resize', () => requestAnimationFrame(measureTitles), { passive: true });

  /* An open facet drawer eats a lot of the screen. Once you've scrolled past
     about two tracks you're clearly reading the list, not picking filters —
     so it gets out of the way by itself. */
  (function autoCloseDrawer() {
    let openedAt = null;
    const rowHeight = () => {
      const r = tracksEl.querySelector('.trk');
      return r ? r.getBoundingClientRect().height + 6 : 80;
    };
    addEventListener('scroll', () => {
      if (!openCat) { openedAt = null; return; }
      if (openedAt === null) { openedAt = window.pageYOffset; return; }
      if (Math.abs(window.pageYOffset - openedAt) > rowHeight() * 2) {
        openedAt = null;
        closeDrawer();
      }
    }, { passive: true });
  })();

  // shadow only once the bar is actually pinned
  const cbar = $('#cbar');
  if (cbar) {
    const syncStuck = () => cbar.classList.toggle('stuck', cbar.getBoundingClientRect().top <= 71);
    addEventListener('scroll', syncStuck, { passive: true });
    syncStuck();
  }

  // ── nav + reveal ──
  const mnav = $('#mnav');
  addEventListener('scroll', () => mnav.classList.toggle('scrolled', scrollY > 24), { passive: true });
  // full-screen menu — same behaviour as the main site
  const burger = $('#mnavBurger'), menu = $('#mmenu');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
    if (open) { const first = menu.querySelector('a'); if (first) setTimeout(() => first.focus(), 400); }
    else burger.focus();
  }
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  menu.addEventListener('click', e => {
    if (e.target.closest('a')) return setMenu(false);
    if (!e.target.closest('.mmenu-nav, .mmenu-foot')) setMenu(false);  // click on empty space
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false);
  });

  const obs = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); obs.unobserve(x.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.rv').forEach(el => obs.observe(el));
  document.getElementById('year').textContent = new Date().getFullYear();
})();
