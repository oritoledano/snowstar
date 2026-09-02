/* ═══════════ Mutra page — catalog, filters, sticky player w/ working seek ═══════════ */
(function () {
  const $ = s => document.querySelector(s);
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
  /** Credits and lyrics are typed by the owner and can contain anything, so
      they are escaped before going anywhere near innerHTML. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

  /** A full turn, so a toggle's icon always lands the right way up. */
  function spinToggle(btn) {
    const ico = btn && btn.querySelector('svg');
    if (!ico) return;
    ico.classList.remove('spin');
    void ico.offsetWidth;              // restart the animation
    ico.classList.add('spin');
  }

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
  // lets other on-page audio (e.g. the Spotlight row's hover previews) stop
  // us before it starts, so two things never play over each other
  window.mutraPauseMainPlayer = () => { if (!audio.paused) audio.pause(); };

  /* The Spotlight row used to run a SECOND <audio> of its own, which is why
     hovering a card had to pause this one — two elements, two transports,
     and whichever spoke last won. It now hands its cards to this player
     instead: one thing plays at a time by construction, and the sticky bar
     always shows what the visitor actually started.

     Subscribers are told about every state change, including a takeover from
     the catalog list, so an outside play/pause button can FOLLOW the player
     rather than track its own idea of what is playing. */
  const playerSubs = new Set();
  function notifySubs() {
    const slug = current ? current.track.slug : null;
    const playing = !!(current && !audio.paused);
    playerSubs.forEach((fn) => { try { fn(slug, playing); } catch { /* a bad subscriber must not break playback */ } });
  }
  window.mutraPlayer = {
    play: (track) => loadTrack(track, null),
    toggle: () => toggle(),
    isPlaying: (slug) => !!(current && current.track.slug === slug && !audio.paused),
    isCurrent: (slug) => !!(current && current.track.slug === slug),
    /** The catalog entry for a slug, overrides already merged — so an outside
     *  caller plays the real track rather than a stale copy of it. */
    find: (slug) => MUTRA.tracks.find((t) => t.slug === slug) || null,
    onChange: (fn) => { playerSubs.add(fn); return () => playerSubs.delete(fn); },
  };

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
    if (!row) return;
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
    openMail(mailto(track.title));
  }

  /** How long did they actually listen to the outgoing track? audio.played
   * sums real playing time across any pause/resume within this one load — it
   * resets itself the moment .src changes, so any read here happens BEFORE
   * that. Playback can resume on the same `current` object after this fires
   * (tab regains focus while backgrounded audio kept going, a same-track
   * replay via toggle(), a wave-seek) so this reports only the seconds
   * accumulated since the LAST report, rather than latching once per load
   * and going silent for the rest of it. */
  function finalizeListen() {
    if (!current) return;
    let played = 0;
    try {
      const ranges = audio.played;
      for (let i = 0; i < ranges.length; i++) played += ranges.end(i) - ranges.start(i);
    } catch {}
    const total = Math.round(played);
    const delta = total - (current.reported || 0);
    if (delta > 0 && window.mutraTrack) mutraTrack('play_end', current.track.slug, { duration: delta });
    current.reported = total;
  }

  /** Where the player gets its audio.
   *
   *  Not track.audio — that is the watermarked preview on the public CDN, and
   *  a watermark on the player is a tax on the person deciding whether to buy.
   *  /api/stream serves the clean master from the private bucket, same-origin
   *  only, with no URL anyone can copy out. Spotlight snippets and anything
   *  that already carries an absolute URL are left alone.
   *
   *  Falls back to track.audio if the stream 403s or the track has no master,
   *  because silence is worse than a watermark. */
  function streamUrl(track) {
    if (!track.slug || /^(https?:)?\/\//.test(track.slug)) return track.audio;
    if (track.slug.startsWith('spotlight:')) return track.audio;
    return '/api/stream?slug=' + encodeURIComponent(track.slug);
  }

  let pendingSeek = null; // in-flight highlight-seek listener, so a fast track switch can't leave it to fire against the wrong (next) track
  function loadTrack(track, row) {
    if (current && current.track === track) { toggle(); return; }
    finalizeListen();
    if (pendingSeek) { audio.removeEventListener('loadedmetadata', pendingSeek); pendingSeek = null; }
    if (window.mutraTrack) mutraTrack('play', track.slug, { once: true });
    if (current && current.row) current.row.classList.remove('playing');
    current = { track, row: row || null, reported: 0 };
    if (row) row.classList.add('playing');
    audio.src = streamUrl(track);
    audio.currentTime = 0;
    // with highlights on, drop the needle on the best bit rather than the intro
    const hl = hlOf(track.slug);
    if (hl) {
      pendingSeek = () => {
        if (audio.duration) audio.currentTime = hl[0] * audio.duration;
        audio.removeEventListener('loadedmetadata', pendingSeek);
        pendingSeek = null;
      };
      audio.addEventListener('loadedmetadata', pendingSeek);
    }
    audio.onerror = () => {
      // the stream is gated; the CDN preview never is. One retry, once.
      if (audio.src.indexOf('/api/stream') === -1 || !track.audio) return;
      audio.onerror = null;
      audio.src = track.audio;
      audio.play().catch(() => {});
    };
    audio.play().catch(() => {});
    plTitle.textContent = track.title;
    plArtist.innerHTML = artistLinks(track.artist)
      + (track.bpm ? '<span class="pl-bpm"> · ' + track.bpm + ' BPM</span>' : '');
    plTot.textContent = fmt(track.duration);
    plCur.textContent = '0:00';
    setProgressUI(0);
    player.classList.add('up');
    document.body.querySelectorAll('.trk .trk-play').forEach(b => b.innerHTML = ICON_PLAY);
    if (row) row.querySelector('.trk-play').innerHTML = ICON_PAUSE;
    notifySubs();   // announce the switch now: 'play' may never fire if autoplay is refused
  }
  function toggle() {
    if (!current) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function closePlayer() {
    finalizeListen(); // before audio.src changes — that's what resets .played
    if (pendingSeek) { audio.removeEventListener('loadedmetadata', pendingSeek); pendingSeek = null; }
    audio.pause(); audio.src = '';
    if (current && current.row) current.row.classList.remove('playing');
    current = null;
    player.classList.remove('up');
    notifySubs();
  }

  audio.addEventListener('timeupdate', () => {
    if (!current || !audio.duration) return;
    setProgressUI(audio.currentTime / audio.duration);
    plCur.textContent = fmt(audio.currentTime);
    plTot.textContent = fmt(audio.duration);
  });
  audio.addEventListener('play', () => {
    plPlay.innerHTML = ICON_PAUSE;
    if (current && current.row) current.row.querySelector('.trk-play').innerHTML = ICON_PAUSE;
    notifySubs();
  });
  audio.addEventListener('pause', () => {
    plPlay.innerHTML = ICON_PLAY;
    if (current && current.row) current.row.querySelector('.trk-play').innerHTML = ICON_PLAY;
    notifySubs();
  });
  audio.addEventListener('ended', () => {
    setProgressUI(0); plCur.textContent = '0:00'; finalizeListen(); notifySubs();
  });

  // a closed tab, backgrounded app, or plain navigation must still report
  // whatever was actually heard — both events are covered since mobile
  // browsers often fire only one of the two
  addEventListener('pagehide', finalizeListen);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finalizeListen(); });

  /* Skip through the list AS FILTERED — prev/next follow what is on screen,
     not catalogue order, because "next" means the next row the visitor can
     see. A track that fell out of the current view (or a spotlight snippet,
     which lives outside the list) starts from the top instead of guessing. */
  function step(dir) {
    if (!list.length) return;
    const i = current ? list.indexOf(current.track) : -1;
    const t = i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
    loadTrack(t, tracksEl.querySelector(`.trk[data-slug="${t.slug}"]`));
  }
  // Skip-to-edge marks — a bar and a triangle leaning on it, rounded like the
  // reference: no ring around them, so the circled play button stays the one
  // circle in the cluster.
  const ICON_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="5" y="5" width="2.6" height="14" rx="1.3"/><path d="M18.2 5.9a1.2 1.2 0 0 1 1.8 1v10.2a1.2 1.2 0 0 1-1.8 1l-8.1-5.1a1.2 1.2 0 0 1 0-2z"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="16.4" y="5" width="2.6" height="14" rx="1.3"/><path d="M5.8 5.9a1.2 1.2 0 0 0-1.8 1v10.2a1.2 1.2 0 0 0 1.8 1l8.1-5.1a1.2 1.2 0 0 0 0-2z"/></svg>';
  const plPrev = document.createElement('button');
  plPrev.className = 'pl-skip'; plPrev.id = 'plPrev';
  plPrev.setAttribute('aria-label', 'Previous track');
  plPrev.innerHTML = ICON_PREV;
  const plNext = document.createElement('button');
  plNext.className = 'pl-skip'; plNext.id = 'plNext';
  plNext.setAttribute('aria-label', 'Next track');
  plNext.innerHTML = ICON_NEXT;
  plPlay.before(plPrev);
  plPlay.after(plNext);
  plPrev.addEventListener('click', () => step(-1));
  plNext.addEventListener('click', () => step(1));

  plPlay.innerHTML = ICON_PLAY;
  plPlay.addEventListener('click', toggle);
  plLic.addEventListener('click', e => {
    e.preventDefault();
    if (!current) return;
    // was still firing the old mailto while the row button opened the chooser
    if (window.mutraLicense && current.track.slug) return mutraLicense.open(current.track);
    startLicense(current.track);
  });
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
  /* ── the scrub gate ──────────────────────────────────────────────────────
     Scrubbing is the tell that someone has stopped browsing and started
     WORKING — they are hunting for the drop, checking whether the middle
     eight fits their edit. That is the moment an account is worth asking for,
     and it is a far better trigger than a timer, because it is the visitor's
     own behaviour that chose it.

     Two scrubs, then ask. Dismissing buys two more. It never hard-stops
     playback and it never blocks the scrub itself — the seek always happens,
     the prompt arrives after. A gate that took the seek away would punish the
     exact behaviour we are trying to reward.

     Counted per session, not per track: the same person hunting across four
     tracks is one person doing one job. */
  const SCRUBS_PER_PROMPT = 2;
  let scrubCount = 0;
  let scrubPromptAt = SCRUBS_PER_PROMPT;

  function noteScrub() {
    if (window.SnowstarAccount && SnowstarAccount.user) return;   // members scrub freely
    scrubCount++;
    if (scrubCount < scrubPromptAt) return;
    scrubPromptAt = scrubCount + SCRUBS_PER_PROMPT;   // dismissing buys two more
    if (window.SnowstarOpenAuth) {
      SnowstarOpenAuth('signup',
        'Looking for the right moment in the track? Free account \u2014 save the ones you like, '
        + '10% off your first licence, and first listen to unreleased music.');
    }
    if (window.mutraTrack) mutraTrack('scrub_gate', current ? current.track.slug : 'none');
  }

  let dragging = false;
  const startDrag = e => { dragging = true; player.classList.add('seeking'); seekFromEvent(e); noteScrub(); e.preventDefault(); };
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

  /* ── volume ──────────────────────────────────────────────────────────────
     Remembered across visits, because someone who turned it down had a reason
     and being shouted at on the next page load undoes the setting they made.
     Mute keeps the old level so unmuting returns to it rather than to full. */
  const plVolSlide = $('#plVolSlide'), plVolFill = $('#plVolFill'), plMute = $('#plMute');
  const VOL_KEY = 'mutraVolume';
  let lastVol = 1;

  const ICON_VOL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>';
  const ICON_VOL_LOW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';

  function paintVol() {
    const v = audio.muted ? 0 : audio.volume;
    plVolFill.style.width = (v * 100) + '%';
    plVolSlide.setAttribute('aria-valuenow', Math.round(v * 100));
    plMute.innerHTML = v === 0 ? ICON_MUTE : v < 0.5 ? ICON_VOL_LOW : ICON_VOL;
    plMute.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
    plVol.classList.toggle('is-muted', v === 0);
  }
  function setVol(v, remember) {
    v = Math.max(0, Math.min(1, v));
    audio.volume = v;
    audio.muted = v === 0;
    if (v > 0) lastVol = v;
    if (remember !== false) { try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* private mode */ } }
    paintVol();
  }
  const plVol = $('#plVol');
  try {
    // getItem returns null when nothing was ever stored, and Number(null) is 0
    // — which passes a 0..1 range check and silently mutes every first-time
    // visitor. Test the raw string, not the number.
    const raw = localStorage.getItem(VOL_KEY);
    const saved = raw === null || raw === '' ? NaN : Number(raw);
    setVol(Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1, false);
  } catch { setVol(1, false); }

  function volFromEvent(e) {
    const r = plVolSlide.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setVol(x / r.width);
  }
  let volDragging = false;
  const startVol = (e) => { volDragging = true; volFromEvent(e); e.preventDefault(); };
  plVolSlide.addEventListener('mousedown', startVol);
  plVolSlide.addEventListener('touchstart', startVol, { passive: false });
  addEventListener('mousemove', (e) => { if (volDragging) volFromEvent(e); });
  addEventListener('touchmove', (e) => { if (volDragging) volFromEvent(e); }, { passive: false });
  addEventListener('mouseup', () => { volDragging = false; });
  addEventListener('touchend', () => { volDragging = false; });
  plMute.addEventListener('click', () => setVol(audio.muted || audio.volume === 0 ? lastVol : 0));
  plVolSlide.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setVol(audio.volume + 0.05);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setVol(audio.volume - 0.05);
  });

  // ── render catalog ──
  // Artlist-style faceted browse: each facet is multi-select (OR within a facet),
  // facets combine with AND, same Set-based pattern as the homepage Work grid.
  // NOTE: "packages" (the licensing bundles inherited from the Wix site) is no
  // longer a facet — it was removed from browse and from the editor. The FIELD
  // survives on each track because pickScore and the "custom" sort still read
  // it to order staff picks; deleting the data would flatten that ordering.
  const tracksEl = $('#tracks');
  const PAGE = 40;   // rows added per scroll-in
  const facet = () => ({ inc: new Set(), exc: new Set() });
  const state = {
    genres: facet(), moods: facet(), characteristics: facet(), instruments: facet(), scales: facet(),
    packs: facet(), characters: facet(),
    vocal: null, dur: null, bpm: null, q: '', favoritesOnly: false,
    sort: 'picks', highlights: true, lyrics: false, keys: false, hiddenOnly: false,
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
    { id: 'd3',   label: '3+ min',   test: d => d >= 180 },
    { id: 'd4',   label: '4+ min',   test: d => d >= 240 },
  ];
  // bounds come from the catalog itself, so both handles reach real music
  const BPM_ALL = MUTRA.tracks.map(t => t.bpm).filter(Boolean);
  const BPM_MIN = Math.floor(Math.min(...BPM_ALL) / 5) * 5;
  const BPM_MAX = Math.ceil(Math.max(...BPM_ALL) / 5) * 5;

  function matches(t) {
    // a hidden track stays in the file and in the owner's editor, but is gone
    // for every visitor — hiding is the soft alternative to deleting a row
    if (t.hidden && !curateMode) return false;
    // ...and the Hidden view is the inverse, so a tucked-away track has
    // somewhere to actually live. Without it the only way to find one was to
    // scroll the whole catalog in edit mode looking for a filled circle.
    if (state.hiddenOnly && !t.hidden) return false;
    // The custom-licence view is a filter, not a ranking — see SORTERS.custom.
    if (state.sort === 'custom' && t.lane !== 'quote') return false;
    if (state.favoritesOnly && !(window.MutraMembers && MutraMembers.isFavorite(t.slug))) return false;
    const sc = state.scales;
    if (sc.inc.size && !sc.inc.has(scaleOf(t))) return false;
    if (sc.exc.size && sc.exc.has(scaleOf(t))) return false;
    // Packs come from the join table, not from a field on the track.
    for (const key of ['packs', 'characters']) {
      const f = state[key];
      if (!f.inc.size && !f.exc.size) continue;
      const mine = SHELF[key].of[t.slug] || [];
      if (f.inc.size && !mine.some((v) => f.inc.has(v))) return false;
      if (f.exc.size && mine.some((v) => f.exc.has(v))) return false;
    }
    for (const key of ['genres', 'moods', 'characteristics', 'instruments']) {
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
      // `vocal` is in the haystack because "instrumental" and "vocals" stopped
      // being instrument tags — they were never instruments, and having them
      // there put a Vocals chip on half the catalogue. The Lyrics filter reads
      // t.vocal, and so does search, so typing the word still finds the tracks.
      const hay = (t.title + ' ' + (t.artist || '') + ' ' + t.genres.join(' ') + ' ' +
        (t.moods || []).join(' ') + ' ' + (t.characteristics || []).join(' ') + ' ' +
        (t.instruments || []).join(' ') + ' ' +
        (t.vocal || '') + ' ' + (t.lyrics || '')).toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  }

  /** "Staff picks" = an explicitly curated list first, in the exact order the
      owner arranged it (see curatePicks below), then everything else on the
      old heuristic: how many packages a track was collected into, since a
      track reused across packs is one he rates. Curation is stored server-side
      so it's the same order for every visitor, not a local preference. */
  let curated = [];                                   // slugs, best first
  const pickRank = t => {
    const i = curated.indexOf(t.slug);
    return i < 0 ? Infinity : i;
  };
  const pickScore = t => (t.packages || []).length * 10 + ((t.genres || []).length ? 1 : 0);
  const byTitle = (a, b) => a.title.localeCompare(b.title);

  /* Price class as a tiebreaker: A first, D last.
     All else equal, show the expensive work first — it is the work most worth
     selling, and burying it under a cheap cut that happens to sort earlier
     alphabetically costs real money. A tiebreaker and not an override: the
     curated order, the tempo you asked to sort by, and how well a track
     matches what you typed all still win, because a class is a price and not
     a claim that the track is what you were looking for. */
  const CLASS_RANK = { A: 0, B: 1, C: 2, D: 3 };
  const byClass = (a, b) =>
    (CLASS_RANK[String(a.cls || 'C').toUpperCase()] ?? 2) -
    (CLASS_RANK[String(b.cls || 'C').toUpperCase()] ?? 2);

  /* How squarely a track answers what was typed. A name search must not be
     reordered by price — somebody typing "cash flow" wants CASH FLOW, whatever
     class it is — so an exact or leading title match outranks everything, and
     the class only separates tracks that match equally well. */
  function queryRank(t) {
    const q = state.q;
    if (!q) return 0;
    const lc = (v) => String(v || '').toLowerCase();
    const title = lc(t.title), artist = lc(t.artist);
    if (title === q) return 0;
    if (artist === q) return 1;
    if (title.startsWith(q)) return 2;
    if (artist.startsWith(q)) return 3;
    if (title.includes(q)) return 4;
    if (artist.includes(q)) return 5;
    /* A lyric hit is real but weaker than a tag: somebody searching "midnight"
       wants tracks that ARE midnight before one that says the word once in the
       second verse. So lyric-only matches sort last rather than level with
       tags, which is where they would land if this just returned 6. */
    const tagged = [...(t.genres || []), ...(t.moods || []),
                    ...(t.characteristics || []), ...(t.instruments || [])]
      .join(' ').toLowerCase();
    if (tagged.includes(q)) return 6;           // matched on a tag or a mood
    return 7;                                   // matched only inside the lyrics
  }
  const SORTERS = {
    picks: (a, b) => queryRank(a) - queryRank(b) || pickRank(a) - pickRank(b) ||
      byClass(a, b) || pickScore(b) - pickScore(a) || byTitle(a, b),
    alpha: byTitle,
    bpm:   (a, b) => (a.bpm || 1e9) - (b.bpm || 1e9) || byTitle(a, b),
    // unpackaged one-offs first — those are the ones that tend to need a bespoke quote
    /* Not a sort — a view. Picking "Custom license" to be shown every track
       with the quote ones merely nudged upwards is useless: the question being
       asked is "which of these need a conversation", and the answer is a list
       of exactly those. Filtering happens in matches(); this only orders what
       survives it. */
    custom: byTitle,
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

  /* ── version stacks ───────────────────────────────────────────────────────
     Alternate cuts filed under the track they belong to. STACKS maps a parent
     slug to its children; PARENT_OF is the reverse, built once so the render
     loop is not scanning the map per track. `openStacks` is view state only —
     a stack a visitor opened stays open until they close it, and is never
     persisted, because it is a way of looking rather than a fact. */
  const DELETED = new Set();
  /* Packs: named groups of tracks, loaded from the server rather than derived
     from the catalogue file, because a pack can exist while it is still empty
     and a derived list could never show one. `of` is the reverse index so
     the filter is a set lookup per track rather than a scan per pack. */
  /* Two shelves, one shape. Packs and Characters differ only in what they
     mean, so they share the loader, the index and the filter — the alternative
     is the same four functions twice and a bug fixed in one of them. */
  const SHELF = {
    packs:      { kind: 'pack',      list: [], of: {}, hidden: false },
    characters: { kind: 'character', list: [], of: {}, hidden: false },
  };
  function indexShelf(key) {
    const sh = SHELF[key];
    sh.of = {};
    for (const c of sh.list) for (const sl of (c.tracks || [])) (sh.of[sl] ||= []).push(c.name);
  }
  /* One switch hides the whole shelf while it is being built, and an empty
     shelf hides itself — a dropdown that opens onto nothing reads as broken. */
  function syncShelfButtons() {
    /* A visitor never sees an empty or switched-off shelf. The owner always
       does — otherwise hiding a shelf hides the only control that could bring
       it back, which is exactly how Characters became unreachable: created
       hidden, empty, and with no way in from this page. */
    for (const key of Object.keys(SHELF)) {
      const b = document.querySelector(`.fcat[data-cat="${key}"]`);
      if (!b) continue;
      b.hidden = !curateMode && (SHELF[key].hidden || !SHELF[key].list.length);
      b.classList.toggle('shelf-off', curateMode && !!SHELF[key].hidden);
    }
  }

  async function loadShelf(key) {
    const sh = SHELF[key];
    try {
      const d = await fetch(`/api/collections?kind=${sh.kind}`, { credentials: 'same-origin' })
        .then((r) => r.json());
      sh.list = (d && d.collections) || [];
      sh.hidden = !!(d && d.shelfHidden);
    } catch { sh.list = []; }
    indexShelf(key);
  }
  let STACKS = {}, PARENT_OF = {};
  const openStacks = new Set();

  function indexStacks() {
    PARENT_OF = {};
    for (const [parent, kids] of Object.entries(STACKS))
      for (const k of kids) PARENT_OF[k] = parent;
  }
  /* Versions of a track, narrowed by whatever is currently filtered.
     Opening a stack under an Instrumental filter must not hand back the vocal
     cut — the fold is a way of tidying results, not a way around them. With no
     filter on, `matches` is true for everything and the whole stack comes back,
     which is why the default view is unchanged. Curate mode keeps the raw list:
     you cannot restructure a stack whose members the filter has hidden. */
  const childrenOf = (slug) =>
    (STACKS[slug] || []).map(sl => MUTRA.tracks.find(t => t.slug === sl))
      .filter(t => t && !DELETED.has(t.slug) && (curateMode || matches(t)));

  async function loadStacks() {
    try {
      const r = await fetch('/api/stacks', { credentials: 'same-origin' });
      const d = await r.json();
      STACKS = (d && d.stacks) || {};
    } catch { STACKS = {}; }
    indexStacks();
  }

  async function setStack(child, parent) {
    const r = await fetch('/api/stacks', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ child, parent }),
    }).then(x => x.json()).catch(() => null);
    if (!r || !r.ok) {
      toast(r && r.error === 'child_has_own_versions'
        ? 'That track already has versions of its own — unstack those first'
        : 'Could not stack that');
      return false;
    }
    await loadStacks();
    render();
    return true;
  }

  /* Whatever actually scrolls. The page has an inner scroller on some layouts
     and scrolls the document on others, and guessing wrong means every fix
     below silently does nothing. */
  function scroller() {
    let n = tracksEl;
    while (n && n !== document.body) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  let lastListKey = '';

  /**
   * Re-render, without throwing the reader across the page.
   *
   * Every in-row action — hiding, grading, picking, opening a stack — ends in
   * render(), and render() used to reset `shown` to one page and clear the
   * list. Scrolled to track 200, you clicked something and landed back near the
   * top, far from the row you had just touched.
   *
   * So: if the RESULT SET is unchanged, this was an edit rather than a new
   * search. Rebuild to the same depth and put the scroll back. When the set does
   * change — a filter, a search, a sort — going to the top is correct and still
   * happens.
   */
  function render(forceKeep) {
    /* Nothing appears that did not match. A version normally hides inside its
       parent, but if the filter picked the version and not the parent, the
       VERSION is what gets the row — filtering to Instrumental must not answer
       with the vocal parent of Kaviar Woman just because its instrumental cut
       is somewhere underneath. The old rule surfaced the parent instead, which
       put the exact thing you filtered away at the top of the results. */
    /* Deleted tracks are filtered before anything else, including before the
       owner's Hidden view — hidden and deleted are different states and the
       point of deleted is that it is gone from every view. */
    const hit = new Set(MUTRA.tracks.filter(t => !DELETED.has(t.slug)).filter(matches).map(t => t.slug));
    list = MUTRA.tracks.filter(t => {
      if (DELETED.has(t.slug)) return false;
      if (!hit.has(t.slug)) return false;
      const parent = PARENT_OF[t.slug];
      // Curating is the one place the catalogue is shown flat: you cannot drag a
      // version out of a stack you are not allowed to see.
      if (!parent || curateMode) return true;
      return !hit.has(parent);                          // promoted; nothing left to fold it under
    }).sort(SORTERS[state.sort] || SORTERS.picks);

    const key = list.map(t => t.slug).join('|');
    const sameSet = forceKeep || key === lastListKey;
    lastListKey = key;
    const sc = scroller();
    const keepTop = sameSet ? sc.scrollTop : 0;
    const keepDepth = sameSet ? shown : 0;

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
    // Back to the same depth and the same place, so an edit at track 200 leaves
    // you looking at track 200.
    while (keepDepth > shown && shown < list.length) appendPage();
    if (sameSet && keepTop) sc.scrollTop = keepTop;
    /* Two frames, not none: filtering 378 tracks down to 10 shortens the page
       enormously, and the browser clamps the scroll to the new maximum. Measured
       before that settles, the target is computed against a page that no longer
       exists and the scroll silently does nothing. */
    else if (!firstRender) requestAnimationFrame(() => requestAnimationFrame(revealListTop));
    firstRender = false;
  }

  /* A new result set is a new list, and leaving somebody halfway down one while
     the contents change under them is how you lose their place entirely: the
     rows they were reading are gone and nothing says where they now are.
     So a filter, a search, a tag or a character starts at the first track.

     Not the top of the PAGE, which would throw them back past the hero and make
     them scroll down again — the top of the LIST, just below whatever is stuck
     to the top of the window. Never on the first paint: an arriving visitor
     should meet the hero, not the catalogue. */
  let firstRender = true;
  function revealListTop() {
    const sc = scroller();
    if (sc !== (document.scrollingElement || document.documentElement)) { sc.scrollTop = 0; return; }
    /* Everything pinned to the top of the window, measured as one: the nav, and
       the control bar that carries the filters AND the open character row.
       .cbar is position:sticky, so its rect is where it is STUCK, not where it
       lives in the document — adding pageYOffset to it gives a number that is
       not any position at all, which is why the first attempt scrolled to the
       wrong place. Its HEIGHT is still honest, and height is all that is needed:
       the row stays on screen by itself precisely because it is sticky, so the
       job here is only to put the first track directly beneath it. */
    const nav = document.querySelector('.mnav');
    const cbar = document.querySelector('.cbar');
    const stuck = (nav ? nav.getBoundingClientRect().height : 0)
                + (cbar ? cbar.getBoundingClientRect().height : 0) + 12;
    const y = tracksEl.getBoundingClientRect().top + window.pageYOffset - stuck;
    // Only ever scroll UP to the list. If they are already above it — still in
    // the hero, say — dragging them down to the results is not what they asked
    // for by touching a filter.
    if (window.pageYOffset > y) window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /** Draw the next slice — called on render and again as the sentinel scrolls in. */
  /* Extracted from appendPage so the spotlight strip can drop a REAL catalogue
     row in under its covers. Building a second row type there would drift from
     this one the first time either changed; calling the same builder cannot. */
  function buildRow(track, i) {
      const row = document.createElement('div');
      row.className = 'trk' + (current && current.track === track ? ' playing' : '');
      row.dataset.slug = track.slug;   // lets prev/next find the row it lands on
      // Counted after the filter, so a "+2" can never open to reveal one.
      const kids = childrenOf(track.slug);
      // one of each kind up front, the rest still in the DOM and revealed by
      // the hover marquee — same trick the long titles use
      const tagSet = (arr, cls, facet) => (arr || []).map((v, i) =>
        `<button class="tag${cls ? ' ' + cls : ''}${i ? ' tag-more' : ''}" data-facet="${facet}" data-val="${v}">${v}</button>`);
      const tags = [
        ...tagSet(track.genres, '', 'genres'),
        ...tagSet(track.moods, 'mood', 'moods'),
        ...tagSet(track.characteristics, 'char', 'characteristics'),
        ...tagSet(track.instruments, 'inst', 'instruments'),
      ].join('');
      row.innerHTML = `
        <button class="trk-play" aria-label="Play ${track.title}">${current && current.track === track && !audio.paused ? ICON_PAUSE : ICON_PLAY}</button>
        <img class="trk-cover" src="${track.cover}" alt="" loading="lazy">
        <div class="trk-id">
          <div class="trk-idtext">
            <div class="trk-title" role="button" tabindex="0" title="Credits"><span class="tt-in">${track.title}</span></div>
            <div class="trk-artist">${artistLinks(track.artist)}${PARENT_OF[track.slug] && curateMode
              ? '<button class="trk-unstack" title="Take this out of its stack">unstack</button>' : ''}</div>
          </div>
          ${kids.length
            ? `<button class="trk-stack" aria-expanded="${openStacks.has(track.slug)}"
                 title="${kids.length} other version${
                 kids.length > 1 ? 's' : ''} of this track">${
                 openStacks.has(track.slug) ? '−' : '+'}${kids.length}</button>`
            : ''}
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
          <button class="trk-lic${track.lane === 'quote' ? ' trk-lic-q' : ''}" type="button">${
            track.lane === 'quote' ? 'Get a quote' : 'License'}</button>
        </div>`;
      row.querySelector('.trk-play').addEventListener('click', () => loadTrack(track, row));
      row.querySelector('.trk-lic').addEventListener('click', () => {
        // the chooser handles both cases: a quote-lane track shows "on request"
        // and asks for terms, a normal one shows the price for the chosen use
        if (window.mutraLicense) return mutraLicense.open(track);
        startLicense(track);
      });

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
        /* /t/<slug>, not ?track=<slug>. The query form is a static page as far
           as a scraper is concerned, so every shared track previewed as the same
           generic Mutra card; this URL is served with tags for the actual track
           and redirects a person straight on to the catalogue. */
        const url = location.origin + '/t/' + encodeURIComponent(track.slug);
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied');
        } catch {
          // clipboard blocked (insecure context / permissions) — show it to copy by hand
          prompt('Copy this link:', url);
        }
      });

      // credits open under the row, same pattern as "sounds like this"
      const titleEl = row.querySelector('.trk-title');
      const openCr = e => { e.stopPropagation(); showCredits(track, row); };
      titleEl.addEventListener('click', openCr);
      titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openCr(e); });

      // lyrics, when there are any
      const lyrEl = row.querySelector('.trk-lyr');
      if (lyrEl) {
        lyrEl.classList.toggle('has', !!track.lyrics);
        lyrEl.addEventListener('click', e => { e.stopPropagation(); showLyrics(track, row); });
      }

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
        // clicking a row's own waveform is the same act as dragging the player
        // bar, so it has to count the same or the gate has an obvious hole
        noteScrub();
      });
      const cnv = row.querySelector('.trk-wave canvas');
      cnv._peaks = waveform(track, i + 1);
      cnv._slug = track.slug;
      const stackBtn = row.querySelector('.trk-stack');
      if (stackBtn) stackBtn.addEventListener('click', e => {
        e.stopPropagation();
        /* Inside a promo strip this row is a guest copy: openStacks + render()
           would unfold the versions at the track's own seat in the MAIN list —
           somewhere far away — and nudge the scroll, which reads as the button
           doing nothing. Unfold right here instead, under the row that was
           clicked, and leave the main list alone. */
        const strip = row.closest('.promo-strip, .spot-expand');
        if (strip) {
          const open = stackBtn.getAttribute('aria-expanded') === 'true';
          // recomputed at click time — the closure's list was frozen when the
          // guest row was built, and versions can be hidden/unstacked since
          const fresh = childrenOf(track.slug);
          if (open) {
            while (row.nextElementSibling && row.nextElementSibling.classList.contains('trk-child'))
              row.nextElementSibling.remove();
          } else {
            let after = row;
            fresh.forEach((kid) => {
              const kr = buildRow(kid, MUTRA.tracks.indexOf(kid));
              kr.classList.add('trk-child');
              after.insertAdjacentElement('afterend', kr);
              paintRowWave(kr, kid);
              after = kr;
            });
          }
          stackBtn.setAttribute('aria-expanded', String(!open));
          stackBtn.textContent = (open ? '+' : '−') + fresh.length;
          return;
        }
        if (openStacks.has(track.slug)) openStacks.delete(track.slug);
        else openStacks.add(track.slug);
        render();
      });
      const unstackBtn = row.querySelector('.trk-unstack');
      if (unstackBtn) unstackBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (await setStack(track.slug, null)) toast('Taken out of the stack');
      });

      if (curateMode) { addCurateControls(row, track); makeDraggable(row, track); }
      return row;
  }

  /** Draw the row's waveform once it is in the document. Named for the row,
   *  not the wave: paintWave already exists on the player's own progress bar. */
  function paintRowWave(row, track) {
    const cnv = row.querySelector('.trk-wave canvas');
    if (!cnv) return;
    requestAnimationFrame(() => drawWave(cnv, cnv._peaks,
      current && current.track === track && audio.duration ? audio.currentTime / audio.duration : null,
      hlOf(track.slug)));
  }

  function appendPage() {
    const slice = list.slice(shown, shown + PAGE);
    shown += slice.length;
    requestAnimationFrame(measureTitles);
    slice.forEach(track => {
      const i = MUTRA.tracks.indexOf(track);
      const row = buildRow(track, i);
      tracksEl.appendChild(row);
      paintRowWave(row, track);
      /* Versions are real rows, not a summary — they play, they license, they
         carry their own tags. Building a lesser row type here would drift from
         the main one the first time either changed. */
      if (openStacks.has(track.slug) && !curateMode) {
        childrenOf(track.slug).forEach(kid => {
          const kr = buildRow(kid, MUTRA.tracks.indexOf(kid));
          kr.classList.add('trk-child');
          tracksEl.appendChild(kr);
          paintRowWave(kr, kid);
        });
      }
    });
    sentinel.hidden = shown >= list.length;
    if (curateMode && window.mutraBulkSync) window.mutraBulkSync();
    // keep the live "playing" row reference valid after a re-render
    if (current) {
      const live = [...tracksEl.querySelectorAll('.trk')].find((_, idx) => list[idx] === current.track);
      if (live) current.row = live;
    }
    maybeInsertSpotlight();
  }

  /**
   * Where the Artist Spotlight row lands.
   *
   * It used to be a constant: always after the 10th row. That reads fine while
   * you are browsing 374 tracks — a break partway down a long list — and badly
   * everywhere else. Filter to fifteen results and it lands with five rows
   * under it, which is not a break, it is a footer. Search for something
   * specific and get four hits, and a promo shoved into the middle of them is
   * simply in the way.
   *
   * So the depth follows the result count, and the rule is that the row must
   * never be the thing standing between someone and the answer they searched
   * for:
   *
   *   searched for the spotlight artist  -> FIRST. They asked for this.
   *   fewer than 8 results               -> after the last row. A short,
   *                                         specific answer stays intact.
   *   8 to 23                            -> about a third down, never above 3.
   *   24 or more                         -> after the 10th, as before.
   *
   * Measured against `list` (everything the filter matches) rather than the
   * rendered rows, or the answer would change as infinite scroll appends more.
   */
  function spotlightIndex(spotArtist) {
    const total = list.length;
    if (!total) return -1;

    // Did they ask for this artist by name? Then it is the result, not an
    // interruption. Checked against the search box only — picking a genre that
    // happens to contain them is not the same as naming them.
    const q = String(state.q || '').trim().toLowerCase();
    if (q.length >= 3 && spotArtist && spotArtist.toLowerCase().includes(q)) return 0;

    /* Once somebody has narrowed the list, they are looking for something, and
       an artist promo dropped into their results is an interruption rather than
       a suggestion. Shown only while browsing everything.

       The row is a full-width block in a column of thin rows, so it reads as an
       end-cap: in a ten-track character it looks like the list finished there and
       the rest is an advert. That is fine at the top of an endless catalogue,
       where nobody expects a bottom, and actively misleading in any result set
       small enough to have one. So EVERY way of narrowing counts — including
       packs and characters, which are short lists by definition, and the Custom
       licence view, which is itself a filter.

       Keeping it out of narrowed views also protects the row: seen once while
       browsing it is a recommendation, seen on top of every filtered result it
       is noise. */
    const narrowed = !!q
      || ['genres', 'moods', 'characteristics', 'instruments', 'scales', 'packs', 'characters']
           .some((k) => state[k] && (state[k].inc.size || state[k].exc.size))
      || state.vocal || state.dur || state.bpm || state.favoritesOnly || state.hiddenOnly
      || state.sort === 'custom';
    if (narrowed) return -1;

    /* Fixed placement is gone. The row appears when the behaviour engine says
       somebody is browsing and hesitating — a salesperson entering at the right
       moment, not a poster on the wall. mutra-promos.js arms it and chooses the
       insertion point (near where the visitor actually is). */
    if (!window.MUTRA_SPOTLIGHT_ARMED) return -1;
    if (total < 8) return Math.min(2, total);
    return Math.min(total, window.MUTRA_SPOTLIGHT_INSERT_AFTER || 10);
  }

  /** Re-checked on every appendPage() so the row reappears after a render()
   *  wipes the list, without ever being rebuilt from scratch. */
  /** A parent row and its expanded versions are one unit: versions render as
   *  consecutive `.trk-child` siblings right after their parent, and a strip
   *  dropped between them reads as the list cutting a song off from its own
   *  mixes. Given any row, the last element of its version group — the only
   *  safe thing to insert after. */
  function stackEnd(row) {
    let n = row;
    while (n.nextElementSibling && n.nextElementSibling.classList.contains('trk-child'))
      n = n.nextElementSibling;
    return n;
  }

  function maybeInsertSpotlight() {
    if (!window.mutraSpotlightRow) return;
    if (tracksEl.querySelector('.spotlight-row')) return;
    // direct children only — a bare `.trk` match also catches the rows living
    // INSIDE promo strips, and anchoring on one of those would drop the
    // spotlight into the middle of another advert
    const rows = tracksEl.querySelectorAll(':scope > .trk');
    if (!rows.length) return;

    const spot = window.mutraSpotlightMeta;
    const at = spotlightIndex(spot && spot.artist);
    if (at < 0) return;                    // narrowed list — stay out of the way
    const block = window.mutraSpotlightRow();
    if (!block) return;

    if (at === 0) { tracksEl.insertBefore(block, rows[0]); return; }
    // Wait for the row it belongs after to actually exist. With infinite
    // scroll an index of 10 is not drawn on the first paint of a long list,
    // and inserting it after whatever happens to be last would put it in a
    // different place every time the page grows.
    if (at > rows.length) {
      if (shown < list.length) return;                 // more coming; try again
      stackEnd(rows[rows.length - 1]).insertAdjacentElement('afterend', block);
      return;
    }
    stackEnd(rows[at - 1]).insertAdjacentElement('afterend', block);
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
    genres:      { label: 'Genre',      values: () => MUTRA.genres },
    moods:       { label: 'Mood',       values: () => MUTRA.moods },
    /* Mood is how it FEELS, characteristic is how it SOUNDS. Keeping both in
       one list is what forced 'Dark' to sit next to 'Happy' and made a single
       tag answer two unrelated questions. */
    characteristics: { label: 'Sound', values: () => CHARACTERISTICS },
    packs:      { label: 'Packs',      values: () => SHELF.packs.list.map((c) => c.name) },
    characters: { label: 'Characters', values: () => SHELF.characters.list.map((c) => c.name) },
    instruments: { label: 'Instrument', values: () => INSTRUMENTS },
    scales:      { label: 'Scale',      values: () => SCALES },
  };
  // built from the catalog so it stays honest as the tagging is refined
  const INSTRUMENTS = [...new Set(MUTRA.tracks.flatMap(t => t.instruments || []))].sort();
  const CHARACTERISTICS = [...new Set(MUTRA.tracks.flatMap(t => t.characteristics || []))].sort();
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
      const shelf = SHELF[openCat];                 // packs / characters only

      /* A character with a face is a card, not a word in a list. The whole card
         is the target — picture, name and blurb — because a portrait invites a
         click and hitting a 14px label instead is a small, avoidable annoyance. */
      if (shelf && shelf.list.some((c) => c.art)) {
        fdrop.innerHTML =
          `<div class="charrow">${shelf.list.map((c) => `
            <button type="button" class="charcard${modeOf(f, c.name) === 'inc' ? ' on' : ''}"
              data-name="${c.name}">
              <span class="cc-art">${c.art ? `<img src="${c.art}" alt="" loading="lazy">` : ''}</span>
              <b>${c.name}</b><i>${c.blurb || ''}</i>
            </button>`).join('')}</div>` +
          (curateMode ? shelfAdminHtml(openCat) : '');
        fdrop.querySelectorAll('.charcard').forEach((card) => card.addEventListener('click', () => {
          const name = card.dataset.name;
          // One character at a time: these are moods to browse, not filters to stack.
          const already = modeOf(f, name) === 'inc';
          f.inc.clear(); f.exc.clear();
          if (!already) f.inc.add(name);
          drawDrop(); drawPills(); render();
          /* The row STAYS open. It is the answer to two things at once: the
             chosen character's picture is what tells you whose tracks these
             are — a name in a pill does not — and the other seven are right
             there to switch to. Closing it threw both away. */
        }));
        if (curateMode) wireShelfAdmin(openCat);
        return;
      }

      fdrop.innerHTML =
        `<p class="fhint">Click to include · click again to exclude</p>` +
        `<div class="fchips wide">${vals.map(v => triChip(v, modeOf(f, v))).join('')}</div>` +
        (shelf && curateMode ? shelfAdminHtml(openCat) : '') +
        `<button class="fdrop-close" type="button">Close</button>`;
      [...fdrop.querySelector('.fchips').children].forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const mode = cycle(f, vals[i]);
          btn.className = 'chip tri' + (mode ? ' ' + mode : '');
          btn.innerHTML = (mode === 'exc' ? '<b>−</b>' : '') + vals[i];
          drawPills(); render();
        });
      });
      if (shelf && curateMode) wireShelfAdmin(openCat);
    }
    fdrop.querySelector('.fdrop-close').addEventListener('click', closeDrawer);
  }

  /* ── shelf admin, inside the Packs / Characters dropdown ──────────────────
     Two levels of switch, because they answer different questions. The shelf
     switch is "is this whole idea ready for anyone to see"; the per-item switch
     is "is this one finished". Building only the first would mean a half-made
     pack forces the whole shelf offline; only the second would mean revealing
     the shelf the moment the first item is ready. */
  function shelfAdminHtml(key) {
    const sh = SHELF[key];
    const label = key === 'packs' ? 'pack' : 'character';
    return `<div class="shelf-admin">
      <label class="shelf-sw"><input type="checkbox" class="sa-shelf"${sh.hidden ? ' checked' : ''}>
        <span>Hide the whole ${key === 'packs' ? 'Packs' : 'Characters'} menu from visitors</span></label>
      ${sh.list.length ? `<div class="sa-rows">${sh.list.map((c) => `
        <div class="sa-row" data-id="${c.id}">
          <button type="button" class="sa-eye${c.hidden ? ' off' : ''}"
            title="${c.hidden ? 'Hidden from visitors' : 'Visible to visitors'}">${c.hidden ? '🚫' : '👁'}</button>
          <b>${c.name}</b><span class="sa-n">${(c.tracks || []).length}</span>
          <button type="button" class="sa-del" title="Delete this ${label}">×</button>
        </div>`).join('')}</div>`
        : `<p class="fhint">No ${label}s yet.</p>`}
      <div class="sa-new">
        <input class="sa-name" placeholder="New ${label} name" maxlength="60">
        <button type="button" class="sa-add">Create</button>
      </div>
      <p class="fhint">Assign tracks from any row: turn on Edit, open a track, use
        ${key === 'packs' ? 'Packs' : 'Characters'}.</p>
    </div>`;
  }

  async function saveCollection(body) {
    const r = await fetch('/api/collections', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({}));
  }

  function wireShelfAdmin(key) {
    const sh = SHELF[key], box = fdrop.querySelector('.shelf-admin');
    if (!box) return;
    const reload = async () => {
      await loadShelf(key);
      syncShelfButtons();
      drawDrop();                      // redraw with the new state
      drawPills(); render();
    };

    box.querySelector('.sa-shelf').addEventListener('change', async (e) => {
      await saveCollection({ kind: sh.kind, shelf_hidden: e.target.checked });
      sh.hidden = e.target.checked;
      syncShelfButtons();
    });

    box.querySelectorAll('.sa-row').forEach((row) => {
      const id = Number(row.dataset.id);
      const c = sh.list.find((x) => x.id === id);
      row.querySelector('.sa-eye').addEventListener('click', async () => {
        await saveCollection({ kind: sh.kind, id, hidden: !c.hidden });
        reload();
      });
      row.querySelector('.sa-del').addEventListener('click', async () => {
        if (!confirm(`Delete “${c.name}”? The tracks themselves are not touched.`)) return;
        await saveCollection({ kind: sh.kind, remove: id });
        reload();
      });
    });

    const nameEl = box.querySelector('.sa-name');
    const create = async () => {
      const name = nameEl.value.trim();
      if (name.length < 2) return;
      // Created hidden by the API on purpose; the eye above turns it on once it
      // actually has something in it.
      await saveCollection({ kind: sh.kind, name });
      nameEl.value = '';
      reload();
    };
    box.querySelector('.sa-add').addEventListener('click', create);
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
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
    const fav = $('#favToggle'); if (fav) fav.classList.remove('on');
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
    // Typing while deep in the list would leave you staring at the TAIL of the
    // results, with no hint that more sit above. Snap back to the top of the
    // list so matches read first-to-last. Only when actually scrolled past it —
    // never yank the page while the list top is already on screen.
    if ($('#catalog').getBoundingClientRect().top < 0) {
      $('#catalog').scrollIntoView({ block: 'start' });
    }
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
  favToggle.className = 'fcat fcat-tgl fcat-fav';
  favToggle.setAttribute('aria-label', 'My favorites');
  favToggle.title = 'My favorites';
  favToggle.innerHTML = ICON_HEART + '<span>Favorites</span>';
  favToggle.addEventListener('click', () => {
    // Favourites are stored against an account, so switching this on while
    // signed out shows an empty list and looks broken. Ask for the account
    // instead, and say what they get for it.
    if (!(window.SnowstarAccount && SnowstarAccount.user)) {
      if (window.SnowstarOpenAuth) {
        SnowstarOpenAuth('signup',
          'Create a free account to keep your selections \u2014 plus 10% off your first licence '
          + 'and first listen to unreleased tracks.');
      }
      return;
    }
    state.favoritesOnly = !state.favoritesOnly;
    spinToggle(favToggle);
    favToggle.classList.toggle('on', state.favoritesOnly);
    render();
  });
  $('#lyrToggle').insertAdjacentElement('beforebegin', favToggle);  // bolt · heart · lyrics · note

  /* ═══════════ Staff picks curation (owner only) ═══════════
     The curated order lives in the shared site_texts store under
     "mutra.picks" — public to read (so every visitor gets the same order),
     admin-only to write, same gate the inline site editor already uses. */
  const PICKS_KEY = 'mutra.picks';
  /** For a value going into an HTML attribute. A credit name is owner-typed,
   *  but an unescaped quote would still break the input it lands in. */
  /** "KAYMA, Omri Smadar" is two people, and both should be clickable. Split
   *  on commas rather than linking the whole field, or one name's page opens
   *  for a click on the other. */
  function artistLinks(raw) {
    const names = String(raw || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!names.length) return '';
    return names.map((n) =>
      `<button type="button" class="artist-link" data-artist="${escAttr(n)}">${escAttr(n)}</button>`)
      .join('<span class="artist-sep">, </span>');
  }

  const escAttr = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* Mirrors worker/src/pricing.js. Refreshed from the API on load so a tuned
     multiplier shows without a deploy; these are only the fallbacks. */
  const CLASS_MULT = { A: 3.2, B: 1.8, C: 1.0, D: 0.5 };
  /** Slugs a signed declaration pins to the quote lane. */
  const LANE_LOCKED = new Set();
  /** slug -> the name it shipped with, where it differs from the name now. */
  const ORIG_TITLES = {};

  let curateMode = false;   // owner editing mode
  let curateSaveTimer = 0;
  let overrides = {};

  /** The catalog ships as a static file, so the owner's corrections live
      server-side as a per-slug patch and are merged over the shipped record
      here. Regenerating mutra-data.js therefore never wipes an edit. */
  function applyOverrides() {
    const bySlug = Object.fromEntries(MUTRA.tracks.map(t => [t.slug, t]));
    for (const [slug, patch] of Object.entries(overrides)) {
      const t = bySlug[slug];
      if (!t) continue;
      Object.assign(t, patch);
      if (patch.hl) HL[slug] = patch.hl;   // highlights live in their own map
    }
    refreshVocab();
  }

  /** Facet lists are derived from the catalog, so a newly typed tag has to be
      folded back in or it would be filterable-by nothing. Mutated in place —
      FACETS closes over these arrays. */
  function refreshVocab() {
    const uniq = (k) => [...new Set(MUTRA.tracks.flatMap(t => t[k] || []))].sort();
    MUTRA.genres.splice(0, MUTRA.genres.length, ...uniq('genres'));
    MUTRA.moods.splice(0, MUTRA.moods.length, ...uniq('moods'));
    MUTRA.packages.splice(0, MUTRA.packages.length, ...uniq('packages'));
    INSTRUMENTS.splice(0, INSTRUMENTS.length, ...uniq('instruments'));
    CHARACTERISTICS.splice(0, CHARACTERISTICS.length, ...uniq('characteristics'));
  }

  Promise.all([
    fetch('/api/tracks').then(r => r.ok ? r.json() : { overrides: {} }).catch(() => ({ overrides: {} })),
    fetch('/api/texts').then(r => r.ok ? r.json() : { texts: {} }).catch(() => ({ texts: {} })),
    // Stacks come in with the overrides rather than after them: arriving late
    // would mean the first paint shows every version as its own row and then
    // visibly collapses, which reads as a bug.
    fetch('/api/stacks').then(r => r.ok ? r.json() : { stacks: {} }).catch(() => ({ stacks: {} })),
    fetch('/api/collections?kind=pack').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('/api/collections?kind=character').then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([tr, tx, st, pk, ch]) => {
    /* Microsoft Clarity — session replays and heatmaps, on when the owner has
       pasted a project id into Dashboard → Stats. Off for Do-Not-Track
       visitors, same rule the home tracker follows: watching a recording of
       somebody who asked not to be tracked is not a grey area. */
    const clarityId = ((tx && tx.texts) || {})['config.clarity-id'];
    const dnt = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    if (clarityId && /^[a-z0-9]{6,20}$/i.test(clarityId) && !dnt) {
      const cs = document.createElement('script');
      cs.src = 'https://www.clarity.ms/tag/' + clarityId;
      cs.async = true;
      document.head.appendChild(cs);
    }
    for (const [key, d2] of [['packs', pk], ['characters', ch]]) {
      if (!d2) continue;
      SHELF[key].list = d2.collections || [];
      SHELF[key].hidden = !!d2.shelfHidden;
      indexShelf(key);
    }
    syncShelfButtons();
    STACKS = st.stacks || {};
    indexStacks();
    overrides = tr.overrides || {};
    (tr.deleted || []).forEach((sl) => DELETED.add(sl));
    (tr.laneLocked || []).forEach((sl) => LANE_LOCKED.add(sl));
    // only fetched in curate mode — a visitor has no use for the old names
    if (curateMode || (window.MutraMembers && MutraMembers.user && MutraMembers.user.admin)) {
      fetch('/api/tracks/orig', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.orig) Object.assign(ORIG_TITLES, d.orig); })
        .catch(() => {});
    }
    applyOverrides();
    try { curated = JSON.parse((tx.texts || {})[PICKS_KEY] || '[]'); } catch { curated = []; }
    if (!Array.isArray(curated)) curated = [];
    render();
  }).catch(() => {});

  /* What the bulk editor needs, and nothing more. Kept to four things on
     purpose: a wider surface here turns into two modules that each half-own
     the catalogue state. */
  /* The spotlight strip drops a real catalogue row in under the covers when a
     card is played. It calls THIS, rather than building its own markup, so the
     row it shows can never drift from every other row on the page. */
  /** A guest row (promo strip, spotlight expand) starts life collapsed no
   *  matter what openStacks says: its versions unfold INLINE, so seeding the
   *  chip from the main list's expanded state makes it claim an unfold that
   *  is not there and turns the first click into a phantom collapse. */
  function resetGuestChip(row, track) {
    const sb = row.querySelector('.trk-stack');
    if (sb) { sb.setAttribute('aria-expanded', 'false');
              sb.textContent = '+' + childrenOf(track.slug).length; }
    return row;
  }

  window.mutraRenderRow = function (track) {
    const i = MUTRA.tracks.indexOf(track);
    if (i < 0) return null;
    const row = buildRow(track, i);
    // the waveform needs the row in the document before it can measure, so
    // paint on the next frame rather than now
    requestAnimationFrame(() => paintRowWave(row, track));
    return resetGuestChip(row, track);
  };

  /* Show an explicit set of slugs, in the order given. The agent search ranks
     by relevance, and re-sorting that into the catalogue's own order would
     throw away the only thing the ranking was for. */
  /* Closing the Describe-it dock puts the catalogue back the way it was. The
     dock drives the real list now, so leaving a brief's result set behind after
     the panel is gone would look like the filters had broken. */
  window.mutraClearAgent = function () {
    if (!agentDriving) return;
    agentDriving = false;
    clearFilters();
  };
  let agentDriving = false;

  window.mutraShowSlugs = function (slugs, label) {
    agentDriving = true;
    const order = new Map(slugs.map((sl, i) => [sl, i]));
    // clearFilters() ends in render(), which would rebuild `list` from the
    // facets and throw the ranking away — so the set is written after it, not
    // before.
    clearFilters();
    state.q = '';
    const se = $('#search'); if (se) se.value = '';
    list = MUTRA.tracks.filter((t) => order.has(t.slug))
      .sort((a, b) => order.get(a.slug) - order.get(b.slug));
    shown = 0;
    tracksEl.innerHTML = '';
    appendPage();
    tracksEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.mutraCatalog = {
    filtered: () => list,
    all: () => MUTRA.tracks,
    // Arming the spotlight mid-page must not wait for the next infinite-scroll
    // batch — this lets the promo module ask for the re-check directly.
    recheckSpotlight: () => maybeInsertSpotlight(),
    /* A REAL row — play, license, tags, wave — for the promo strips. Building a
       second row type there would drift from this one; calling the same builder
       cannot. */
    row: (slug) => {
      const t = MUTRA.tracks.find((x) => x.slug === slug);
      if (!t) return null;
      const r = buildRow(t, MUTRA.tracks.indexOf(t));
      paintRowWave(r, t);
      return resetGuestChip(r, t);
    },
    narrowed: () => !!(state.q
      || ['genres', 'moods', 'characteristics', 'instruments', 'scales', 'packs', 'characters']
           .some((k) => state[k] && (state[k].inc.size || state[k].exc.size))
      || state.vocal || state.dur || state.bpm || state.favoritesOnly || state.hiddenOnly
      || state.sort === 'custom'),
    /* After a bulk write the local copy is stale in a way a re-render cannot
       fix — the patches changed server-side. Refetch, re-merge, redraw. */
    reload: async () => {
      try {
        const r = await fetch('/api/tracks', { credentials: 'same-origin' });
        const d = await r.json();
        overrides = d.overrides || {};
        applyOverrides();
        refreshVocab(); syncChips();
        render();
      } catch { render(); }
    },
  };

  async function saveTrack(slug, patch) {
    overrides[slug] = patch;
    try {
      const r = await fetch('/api/tracks', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, patch }),
      });
      if (!r.ok) throw new Error('save_failed');
      const d = await r.json();
      if (d.reset) delete overrides[slug];
      toast(d.reset ? 'Reset to the original' : 'Saved');
      return true;
    } catch {
      toast('Couldn\u2019t save that \u2014 try again');
      return false;
    }
  }

  function saveCurated() {
    clearTimeout(curateSaveTimer);
    curateSaveTimer = setTimeout(() => {
      fetch('/api/texts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: PICKS_KEY, html: JSON.stringify(curated) }),
      }).then(r => {
        if (!r.ok) throw new Error('save_failed');
        toast(curated.length ? `${curated.length} staff pick${curated.length === 1 ? '' : 's'} saved` : 'Staff picks cleared');
      }).catch(() => toast('Couldn’t save that order — try again'));
    }, 700); // debounce: reordering is a burst of clicks, not one decision
  }

  /** Move a slug within the curated list. dir -1 = earlier, +1 = later. */
  function moveCurated(slug, dir) {
    const i = curated.indexOf(slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= curated.length) return;
    [curated[i], curated[j]] = [curated[j], curated[i]];
    saveCurated();
    render();
  }

  /**
   * Put a track AT a place, rather than nudging it there one arrow at a time.
   * Ten arrow clicks to move something from 11th to 1st is the kind of thing
   * that stops a staff-picks list from ever being curated.
   *
   * place is 1-based, or 0 to unpin. Anything already in the list is removed
   * first, so pinning to 3 means "third", not "third counting the copy of
   * itself that used to be second".
   */
  function pinCurated(slug, place) {
    const i = curated.indexOf(slug);
    if (i >= 0) curated.splice(i, 1);
    if (place > 0) curated.splice(Math.min(place - 1, curated.length), 0, slug);
    saveCurated();
    render();
  }

  function toggleCurated(slug) {
    const i = curated.indexOf(slug);
    if (i < 0) curated.push(slug); else curated.splice(i, 1);
    saveCurated();
    render();
  }

  /** Owner row controls: a diamond for staff picks (with order arrows once
      pinned), an eye for hide, and a pencil that opens the full editor. Only
      ever appended while edit mode is on, so every visitor's render path is
      exactly what it always was. */
  function addCurateControls(row, track) {
    const picked = curated.indexOf(track.slug) >= 0;
    const wrap = document.createElement('div');
    wrap.className = 'trk-cur' + (picked ? ' on' : '');
    wrap.innerHTML = `
      <button type="button" class="trk-cur-star" title="${picked ? 'Remove from staff picks' : 'Add to staff picks'}"
        aria-label="${picked ? 'Remove' : 'Add'} ${track.title} ${picked ? 'from' : 'to'} staff picks">${picked ? '\u25c6' : '\u25c7'}</button>
      ${picked ? `<span class="trk-cur-n">${curated.indexOf(track.slug) + 1}</span>
        <button type="button" class="trk-cur-up" title="Move up" aria-label="Move ${track.title} up">\u25b2</button>
        <button type="button" class="trk-cur-dn" title="Move down" aria-label="Move ${track.title} down">\u25bc</button>` : ''}
      <button type="button" class="trk-cur-hide" title="${track.hidden ? 'Hidden \u2014 click to show' : 'Hide from the catalog'}"
        aria-label="${track.hidden ? 'Show' : 'Hide'} ${track.title}">${track.hidden ? '\u25cf' : '\u25cb'}</button>
      <button type="button" class="trk-cur-edit" title="Edit this track" aria-label="Edit ${track.title}">\u270e</button>
      <button type="button" class="trk-cur-del" title="Delete this track from the catalog"
        aria-label="Delete ${track.title}">\u2715</button>`;
    wrap.querySelector('.trk-cur-star').addEventListener('click', e => { e.stopPropagation(); toggleCurated(track.slug); });
    const up = wrap.querySelector('.trk-cur-up'), dn = wrap.querySelector('.trk-cur-dn');
    if (up) up.addEventListener('click', e => { e.stopPropagation(); moveCurated(track.slug, -1); });
    if (dn) dn.addEventListener('click', e => { e.stopPropagation(); moveCurated(track.slug, +1); });
    wrap.querySelector('.trk-cur-hide').addEventListener('click', async e => {
      e.stopPropagation();
      const patch = { ...(overrides[track.slug] || {}), hidden: !track.hidden };
      if (!patch.hidden) delete patch.hidden;
      track.hidden = !track.hidden;
      await saveTrack(track.slug, patch);
      render();
    });
    wrap.querySelector('.trk-cur-edit').addEventListener('click', e => { e.stopPropagation(); openEditor(track, row); });

    /* Delete is not hide. Hidden keeps the track in the owner's Hidden view and
       keeps its audio in the live bucket; deleted takes it out of every view and
       moves the audio to the trash the dashboard empties. Both reversible — the
       word people mean by "delete" here is almost always "get this out of my
       sight", not "destroy it" — but the confirm says which one this is. */
    wrap.querySelector('.trk-cur-del').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete “${track.title}” from the catalogue?\n\n`
        + `It disappears from every view and its audio moves to the trash, where you can `
        + `restore it or empty it for good from the dashboard.\n\n`
        + `To simply take it off the public list instead, use the ○ hide button.`)) return;
      const r = await fetch('/api/tracks?slug=' + encodeURIComponent(track.slug),
        { method: 'DELETE', credentials: 'same-origin' }).then(x => x.json()).catch(() => null);
      if (!r || !r.ok) return toast('Could not delete that track');
      DELETED.add(track.slug);
      // The set changed, so this render is a real one and going to the top would
      // be correct — but the row is gone and the reader is mid-list, so hold the
      // view anyway by dropping the row in place first.
      row.remove();
      render(true);            // one row fewer is still the same view
      toast(`“${track.title}” deleted${r.binned ? ' — audio in the trash' : ''}`);
    });

    /* Grade, custom percentage, and the quote toggle — the three decisions a
       pass through 374 tracks is actually made of. On the row rather than
       behind an editor: one decision per track, then move on.

       The letter and the percentage are the SAME control seen two ways. A
       preset is a shortcut to a number, so typing 250 simply lights none of
       them and shows the custom mark instead. */
    const ov = overrides[track.slug] || {};
    const clsWrap = document.createElement('span');
    clsWrap.className = 'trk-cls';

    const gradeOf = () => {
      const pct = Number(ov.pct);
      if (Number.isFinite(pct) && pct > 0) {
        const hit = Object.entries(CLASS_MULT).find(([, m]) => Math.abs(m * 100 - pct) < 0.5);
        return hit ? hit[0] : '◈';
      }
      return (ov.cls || 'C').toUpperCase();
    };

    function paintCls() {
      const g = gradeOf();
      clsWrap.querySelectorAll('.trk-clsb').forEach(x =>
        x.classList.toggle('on', x.dataset.c === g));
      const pctInp = clsWrap.querySelector('.trk-pct');
      if (pctInp && document.activeElement !== pctInp) {
        pctInp.value = Number.isFinite(Number(ov.pct)) && ov.pct ? ov.pct : '';
      }
      clsWrap.querySelector('.trk-custom').hidden = g !== '◈';
    }

    clsWrap.innerHTML = ['A', 'B', 'C', 'D'].map(c =>
      `<button type="button" class="trk-clsb" data-c="${c}" title="Price class ${c}">${c}</button>`).join('')
      + '<span class="trk-custom" data-c="◈" title="Custom percentage" hidden>◈</span>'
      + '<input class="trk-pct" type="number" min="10" max="2000" step="10" placeholder="%"'
      + ' title="Custom percentage — overrides the class">';

    clsWrap.querySelectorAll('.trk-clsb').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      // choosing a letter clears any custom percentage, or the two would
      // disagree and the number would silently win
      delete ov.pct;
      ov.cls = b.dataset.c;
      overrides[track.slug] = ov;
      track.cls = ov.cls; delete track.pct;
      paintCls();
      await saveTrack(track.slug, { ...ov });
    }));

    const pctInp = clsWrap.querySelector('.trk-pct');
    ['click', 'pointerdown', 'mousedown'].forEach(ev =>
      pctInp.addEventListener(ev, e => e.stopPropagation()));
    pctInp.addEventListener('change', async () => {
      const v = pctInp.value.trim();
      if (v === '') delete ov.pct; else ov.pct = Math.round(Number(v));
      overrides[track.slug] = ov;
      track.pct = ov.pct;
      paintCls();
      await saveTrack(track.slug, { ...ov });
    });

    /* Quote toggle. A rights declaration naming a controller LOCKS it — an
       owner must not be able to click past a legal fact — but where nothing
       forces it, it is free, because plenty of tracks are quote-worthy for
       commercial reasons that have nothing to do with rights. */
    const locked = LANE_LOCKED.has(track.slug);
    const qBtn = document.createElement('button');
    qBtn.type = 'button';
    qBtn.className = 'trk-qtog' + (track.lane === 'quote' ? ' on' : '') + (locked ? ' locked' : '');
    qBtn.textContent = locked ? '🔒' : '₪';
    qBtn.title = locked
      ? 'Quote only — fixed by the signed rights declaration'
      : (track.lane === 'quote' ? 'Quote only — click to allow instant pricing'
                                : 'Instant price — click to make it quote only');
    qBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (locked) { toast('The rights declaration names a controller — this one stays quote only'); return; }
      const next = track.lane === 'quote' ? 'instant' : 'quote';
      ov.lane = next;
      overrides[track.slug] = ov;
      track.lane = next;
      qBtn.classList.toggle('on', next === 'quote');
      await saveTrack(track.slug, { ...ov });
      render();
    });

    paintCls();
    wrap.insertBefore(clsWrap, wrap.querySelector('.trk-cur-edit'));
    wrap.insertBefore(qBtn, wrap.querySelector('.trk-cur-edit'));
    // the bulk checkbox leads the group — it is the control you reach for most
    // once you are working through the catalogue rather than fixing one track
    if (window.mutraBulkRowControl) {
      wrap.insertBefore(window.mutraBulkRowControl(row, track), wrap.firstChild);
    }
    row.querySelector('.trk-right').insertAdjacentElement('afterbegin', wrap);
  }


  /* ═══ drag to reorder, any track ═══
     The curated list started life as "staff picks" but it is really just a
     manual order: anything in it sorts by its position, anything not falls
     through to the heuristic below. Dragging a track that was never picked
     therefore just inserts it into that list at the drop point — which is
     what makes drag-to-reorder work across the whole catalog rather than
     only among the starred few. */
  let dragSlug = null;

  function makeDraggable(row, track) {
    row.draggable = true;
    row.classList.add('trk-drag');
    row.addEventListener('dragstart', (e) => {
      dragSlug = track.slug;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', track.slug); } catch {}
    });
    row.addEventListener('dragend', () => {
      dragSlug = null;
      row.classList.remove('dragging');
      tracksEl.querySelectorAll('.drop-before,.drop-after,.drop-into,.drop-arming')
        .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-arming'));
    });
    /* Two drops, told apart by where you are and how long you have been there.
       Near an edge, it is a reorder, as it always was. Rest in the middle of a
       row for a beat and it becomes "file this under that one" — the same
       spring-loading a file manager uses for dropping into a folder, so the
       gesture is already known and the two meanings cannot be confused. */
    let holdTimer = null;
    const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };

    row.addEventListener('dragover', (e) => {
      if (!dragSlug || dragSlug === track.slug) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = row.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      const middle = y > 0.28 && y < 0.72;

      if (!middle) {
        cancelHold();
        row.classList.remove('drop-into', 'drop-arming');
        row.classList.toggle('drop-before', y <= 0.5);
        row.classList.toggle('drop-after', y > 0.5);
        return;
      }
      row.classList.remove('drop-before', 'drop-after');
      if (row.classList.contains('drop-into') || holdTimer) return;
      row.classList.add('drop-arming');                   // 400ms fill animation
      holdTimer = setTimeout(() => {
        holdTimer = null;
        row.classList.remove('drop-arming');
        row.classList.add('drop-into');
      }, 400);
    });
    row.addEventListener('dragleave', () => {
      cancelHold();
      row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-arming');
    });
    row.addEventListener('drop', (e) => {
      if (!dragSlug || dragSlug === track.slug) return;
      e.preventDefault();
      cancelHold();
      const into = row.classList.contains('drop-into');
      const above = row.classList.contains('drop-before');
      row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-arming');
      if (into) {
        const moved = dragSlug;
        setStack(moved, track.slug).then(ok => {
          if (ok) toast(`Filed under ${track.title}`);
        });
        return;
      }
      dropOnto(dragSlug, track.slug, above);
    });
  }

  /** Move `moved` to sit immediately before/after `target` in the manual order.
   *  A target that was never in the list is appended first, so dropping onto an
   *  unordered track still produces a sensible, stable position. */
  function dropOnto(moved, target, above) {
    const list = curated.slice();
    const mi = list.indexOf(moved);
    if (mi >= 0) list.splice(mi, 1);
    let ti = list.indexOf(target);
    if (ti < 0) { list.push(target); ti = list.length - 1; }
    list.splice(above ? ti : ti + 1, 0, moved);
    curated = list;
    saveCurated();
    if (state.sort !== 'picks') {
      // the manual order is only visible in that sort, so show the result
      state.sort = 'picks';
      sortLabel.textContent = 'Staff picks';
      drawSortMenu();
    }
    render();
  }

  const CREDIT_ROLES = ['Writer', 'Composer', 'Producer', 'Singer', 'Featured Artist',
    'Drums', 'Bass', 'Guitar', 'Piano', 'Keys', 'Strings', 'Horns', 'Percussion',
    'Mixing Engineer', 'Mastering Engineer', 'Arranger'];
  let artistRoster = [];

  /** Splitting the artist field mints a real record per name, so a collaborator
      typed into a text box becomes someone the owner can actually build a
      profile for and assign more tracks to. */
  async function ensureArtists(names) {
    try {
      const r = await fetch('/api/artistreg/ensure', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names }),
      });
      if (!r.ok) return;
      const d = await r.json();
      artistRoster = d.artists || [];
      if (d.created && d.created.length) {
        toast(d.created.length === 1
          ? `Added ${d.created[0]} to your artists`
          : `Added ${d.created.length} artists`);
      }
    } catch {}
  }

  const EDIT_FACETS = [
    ['genres', 'Genres', () => MUTRA.genres],
    ['moods', 'Moods', () => MUTRA.moods],
    ['instruments', 'Instruments', () => INSTRUMENTS],
  ];
  const PITCHES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  /** The full editor, opened under its row. Everything the catalog shows about
      a track is editable here; Save writes a patch, Reset deletes it. */
  function openEditor(track, row) {
    const existing = row.nextElementSibling;
    const mine = existing && existing.classList.contains('trk-edit') && existing.dataset.slug === track.slug;
    document.querySelectorAll('.trk-edit').forEach(p => p.remove());
    if (mine) return;

    const hl = HL[track.slug] || [0.25, 0.5];
    const draft = {
      title: track.title, artist: track.artist, bpm: track.bpm || '',
      key: track.key || '', scale: track.scale || '', vocal: track.vocal || 'Instrumental',
      cover: track.cover,
      genres: [...(track.genres || [])], moods: [...(track.moods || [])],
      instruments: [...(track.instruments || [])],
      hl: [hl[0], hl[1]],
      credits: (track.credits || []).map(c => ({ ...c })),
      lane: track.lane === 'quote' ? 'quote' : 'instant',
      prices: { ...(track.prices || {}) },
      fee: Number.isFinite(track.fee) ? track.fee : '',
      lyrics: track.lyrics || '',
    };

    const panel = document.createElement('div');
    panel.className = 'trk-edit';
    panel.dataset.slug = track.slug;
    panel.innerHTML = `
      <div class="te-grid">
        <label class="te-f te-wide"><span>Title</span><input data-f="title" maxlength="120"></label>
        <label class="te-f te-wide"><span>Artist</span><input data-f="artist" maxlength="120"></label>
        <label class="te-f"><span>BPM</span><input data-f="bpm" type="number" min="1" max="399"></label>
        <label class="te-f"><span>Key</span><select data-f="key"><option value="">\u2014</option>${
          PITCHES.map(k => `<option>${k}</option>`).join('')}</select></label>
        <label class="te-f"><span>Scale</span><select data-f="scale"><option value="">\u2014</option>
          <option>major</option><option>minor</option></select></label>
        <label class="te-f"><span>Lyrics</span><select data-f="vocal">
          <option>Instrumental</option><option>Vocals</option></select></label>
      </div>
      ${EDIT_FACETS.map(([k, label]) => `
        <div class="te-facet" data-facet="${k}">
          <div class="te-flabel">${label}</div>
          <div class="te-chips"></div>
          <input class="te-add" placeholder="add \u2026" maxlength="60">
        </div>`).join('')}
      ${['packs', 'characters'].map((k) => `
        <div class="te-facet te-coll" data-shelf="${k}">
          <div class="te-flabel">${k === 'packs' ? 'Packs' : 'Characters'}</div>
          <div class="te-chips"></div>
        </div>`).join('')}
      <div class="te-hl">
        <div class="te-flabel">Highlight \u2014 where preview starts</div>
        <div class="te-hlrow">
          <input type="range" data-f="hl0" min="0" max="0.98" step="0.005">
          <input type="range" data-f="hl1" min="0.02" max="1" step="0.005">
          <span class="te-hlval"></span>
          <button type="button" class="te-hlplay">Preview</button>
        </div>
      </div>
      <div class="te-facet te-orig" hidden>
        <div class="te-flabel">Originally called</div>
        <p class="te-origname"></p>
        <p class="te-hint">The name this track shipped with when the catalogue was
          imported. Shown so a renamed track is still recognisable.</p>
      </div>
      <div class="te-facet te-uses">
        <div class="te-flabel">Used before</div>
        <div class="te-uselist"></div>
        <div class="te-userow">
          <input class="te-uc" placeholder="Client" maxlength="140">
          <input class="te-up" placeholder="Project" maxlength="200">
          <input class="te-uy" type="number" placeholder="Year" min="1990" max="2100">
          <button type="button" class="te-uadd">＋</button>
        </div>
        <p class="te-hint">A track that has already carried a campaign sells on that.
          It is also what you need in front of you before selling an exclusive.</p>
      </div>
      <div class="te-facet te-pin">
        <div class="te-flabel">Pin to the top of staff picks</div>
        <select class="te-pinsel">
          <option value="0">Not pinned</option>
          ${Array.from({ length: 10 }, (_, i) =>
            `<option value="${i + 1}">${i + 1}${['st', 'nd', 'rd'][i] || 'th'}</option>`).join('')}
        </select>
        <p class="te-hint te-pinnote"></p>
      </div>
      <div class="te-facet te-credits">
        <div class="te-flabel">Credits \u2014 who did what</div>
        <div class="te-crlist"></div>
        <button type="button" class="te-addcr">\uff0b Add collaborator</button>
      </div>
      <div class="te-facet">
        <div class="te-flabel">Lyrics</div>
        <textarea class="te-lyrics" rows="5" placeholder="Paste the lyrics \u2014 shown under the track when someone clicks the lyrics icon"></textarea>
      </div>
      <div class="te-facet te-prices">
        <div class="te-flabel">How this track sells</div>
        <div class="te-lane">
          <button type="button" class="te-lanebtn" data-lane="instant">License \u2014 shows a price</button>
          <button type="button" class="te-lanebtn" data-lane="quote">Get a quote \u2014 no price shown</button>
        </div>
        <p class="te-lanenote"></p>
        <div class="te-flabel">Licence prices \u2014 \u20aa per use, blank = catalogue default</div>
        <div class="te-pgrid"></div>
        <label class="te-flat"><span>Or one flat fee for every use</span>
          <input class="te-fee" type="number" min="0" placeholder="\u2014"></label>
      </div>
      <div class="te-cover">
        <div class="te-flabel">Cover art</div>
        <img class="te-cimg" alt="">
        <label class="te-cbtn">Replace\u2026<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
        <span class="te-cstat"></span>
      </div>
      <div class="te-foot">
        <button type="button" class="te-save">Save</button>
        <button type="button" class="te-reset">Reset to original</button>
        <button type="button" class="te-cancel">Close</button>
        <span class="te-note"></span>
      </div>`;
    row.insertAdjacentElement('afterend', panel);

    const q = sel => panel.querySelector(sel);
    ['title', 'artist', 'bpm', 'key', 'scale', 'vocal'].forEach(f => {
      const el = panel.querySelector(`[data-f="${f}"]`);
      el.value = draft[f];
      el.addEventListener('input', () => { draft[f] = el.value; });
    });
    q('.te-cimg').src = draft.cover;

    // ── the name it shipped with ──
    const origBox = q('.te-orig');
    const orig = ORIG_TITLES[track.slug];
    if (orig && orig.toUpperCase() !== String(track.title || '').toUpperCase()) {
      origBox.hidden = false;
      q('.te-origname').textContent = orig;
    }

    // ── used before ──
    async function paintUses() {
      const box = q('.te-uselist');
      box.innerHTML = '<p class="te-hint">Loading…</p>';
      let d;
      try { d = await (await fetch('/api/tracks/uses?slug=' + encodeURIComponent(track.slug))).json(); }
      catch { box.innerHTML = '<p class="te-hint">Couldn’t load those.</p>'; return; }
      const uses = d.uses || [];
      box.innerHTML = uses.length ? uses.map(u => `
        <div class="te-use" data-id="${u.id}">
          <b>${esc(u.client)}</b>${u.project ? ' — ' + esc(u.project) : ''}
          ${u.year ? `<i>${u.year}</i>` : ''}
          <button type="button" class="te-udel" aria-label="Remove">×</button>
        </div>`).join('') : '<p class="te-hint">No recorded uses yet.</p>';
      box.querySelectorAll('.te-udel').forEach(b => b.addEventListener('click', async () => {
        await fetch('/api/tracks/uses', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ remove: Number(b.closest('.te-use').dataset.id) }),
        });
        paintUses();
      }));
    }
    paintUses();
    q('.te-uadd').addEventListener('click', async () => {
      const client = q('.te-uc').value.trim();
      if (!client) { q('.te-uc').focus(); return; }
      await fetch('/api/tracks/uses', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: track.slug, client,
          project: q('.te-up').value.trim(), year: q('.te-uy').value.trim() }),
      });
      q('.te-uc').value = q('.te-up').value = q('.te-uy').value = '';
      paintUses();
    });

    // ── pin ──
    const pinSel = q('.te-pinsel');
    const pinNote = q('.te-pinnote');
    const paintPin = () => {
      const at = curated.indexOf(track.slug);
      pinSel.value = at >= 0 && at < 10 ? String(at + 1) : '0';
      pinNote.textContent = at < 0
        ? 'Not in staff picks.'
        : at < 10 ? `Currently ${at + 1} of ${curated.length} picks.`
                  : `In picks at ${at + 1} — outside the top ten.`;
    };
    paintPin();
    pinSel.addEventListener('change', () => {
      // Only meaningful in the picks sort, so say so rather than let someone
      // set it and see nothing move.
      pinCurated(track.slug, Number(pinSel.value));
      paintPin();
      if (state.sort !== 'picks') toast('Pinned — switch Sort to Staff picks to see it');
    });

    // ── credits ──
    // The markup for these two shipped without handlers: the button did
    // nothing and the textarea was never read back into the draft, so lyrics
    // typed here were discarded on save. Both are wired here.
    const CREDIT_ROLES = ['Composer', 'Producer', 'Performer', 'Vocals', 'Featuring',
                          'Mix', 'Master', 'Lyrics', 'Arrangement'];
    function paintCredits() {
      const box = q('.te-crlist');
      box.innerHTML = draft.credits.map((c, i) => `
        <div class="te-cr" data-i="${i}">
          <input class="te-crrole" list="te-roles" placeholder="Role" value="${escAttr(c.role || '')}">
          <input class="te-crname" placeholder="Name" value="${escAttr(c.name || '')}">
          <button type="button" class="te-crdel" aria-label="Remove this credit">\u00d7</button>
        </div>`).join('')
        + `<datalist id="te-roles">${CREDIT_ROLES.map(r => `<option value="${r}">`).join('')}</datalist>`;
      box.querySelectorAll('.te-cr').forEach((elr) => {
        const i = Number(elr.dataset.i);
        elr.querySelector('.te-crrole').addEventListener('input', (e) => { draft.credits[i].role = e.target.value; });
        elr.querySelector('.te-crname').addEventListener('input', (e) => { draft.credits[i].name = e.target.value; });
        elr.querySelector('.te-crdel').addEventListener('click', () => {
          draft.credits.splice(i, 1); paintCredits();
        });
      });
    }
    paintCredits();
    q('.te-addcr').addEventListener('click', () => {
      draft.credits.push({ role: '', name: '' });
      paintCredits();
      // land the cursor in the row that was just made, or adding several in a
      // row means reaching for the mouse between each one
      const rows = q('.te-crlist').querySelectorAll('.te-cr');
      const last = rows[rows.length - 1];
      if (last) last.querySelector('.te-crrole').focus();
    });

    // ── lyrics ──
    const lyr = q('.te-lyrics');
    lyr.value = draft.lyrics;
    lyr.addEventListener('input', () => { draft.lyrics = lyr.value; });

    // ── facet chips: click to toggle, type to add a new one ──
    function paintChips() {
      EDIT_FACETS.forEach(([k, , vals]) => {
        const box = panel.querySelector(`[data-facet="${k}"] .te-chips`);
        const all = [...new Set([...vals(), ...draft[k]])].sort();
        box.innerHTML = all.map(v =>
          `<button type="button" class="te-chip${draft[k].includes(v) ? ' on' : ''}">${v}</button>`).join('');
        box.querySelectorAll('.te-chip').forEach((b, i) => b.addEventListener('click', () => {
          const v = all[i];
          const at = draft[k].indexOf(v);
          at < 0 ? draft[k].push(v) : draft[k].splice(at, 1);
          paintChips();
        }));
      });
    }
    paintChips();

    /* Pack and character membership lives in its own table, not on the track,
       so it saves on click rather than waiting for the panel's Save — batching
       it into the patch would mean teaching saveOverride about collections.
       This is the "easier way to add tracks" that was missing: previously the
       only route was typing raw slugs into a textarea in the dashboard. */
    function paintColl() {
      panel.querySelectorAll('.te-coll').forEach((box) => {
        const key = box.dataset.shelf, sh = SHELF[key];
        const chips = box.querySelector('.te-chips');
        if (!sh.list.length) {
          chips.innerHTML = `<span class="te-hint">None yet — make one in the ${
            key === 'packs' ? 'Packs' : 'Characters'} menu.</span>`;
          return;
        }
        chips.innerHTML = sh.list.map((c) => {
          const inIt = (c.tracks || []).includes(track.slug);
          return `<button type="button" class="te-chip${inIt ? ' on' : ''}"
            data-id="${c.id}">${c.name}${c.hidden ? ' ·hidden' : ''}</button>`;
        }).join('');
        chips.querySelectorAll('.te-chip').forEach((b) => b.addEventListener('click', async () => {
          const id = Number(b.dataset.id);
          const c = sh.list.find((x) => x.id === id);
          const inIt = (c.tracks || []).includes(track.slug);
          b.disabled = true;
          await fetch('/api/collections/tracks', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, slugs: [track.slug], remove: inIt || undefined }),
          }).catch(() => null);
          await loadShelf(key);
          syncShelfButtons();
          paintColl();
          /* Only re-render when a pack or character filter is actually on. A
             plain render() here rebuilds every row and takes the open editor
             with it — you would click "add to Nightmare" and the panel you were
             working in would vanish. */
          const f = state[key];
          if (f && (f.inc.size || f.exc.size)) render();
        }));
      });
    }
    paintColl();

    panel.querySelectorAll('.te-add').forEach(inp => inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const k = inp.closest('.te-facet').dataset.facet;
      const v = inp.value.trim();
      if (v && !draft[k].includes(v)) draft[k].push(v);
      inp.value = '';
      paintChips();
    }));

    // ── highlight window, previewable against the real audio ──
    const h0 = q('[data-f="hl0"]'), h1 = q('[data-f="hl1"]'), hv = q('.te-hlval');
    const fmtPct = v => (v * 100).toFixed(0) + '%';
    function syncHl() {
      if (Number(h1.value) <= Number(h0.value) + 0.01) h1.value = String(Math.min(1, Number(h0.value) + 0.02));
      draft.hl = [Number(h0.value), Number(h1.value)];
      hv.textContent = `${fmtPct(draft.hl[0])} \u2013 ${fmtPct(draft.hl[1])}`;
      HL[track.slug] = draft.hl;                 // live, so the waveform redraws
      const c = row.querySelector('.trk-wave canvas');
      if (c && c._peaks) drawWave(c, c._peaks, null, draft.hl);
    }
    h0.value = String(draft.hl[0]); h1.value = String(draft.hl[1]);
    h0.addEventListener('input', syncHl); h1.addEventListener('input', syncHl);
    syncHl();
    q('.te-hlplay').addEventListener('click', () => {
      loadTrack(track, row);
      const seek = () => {
        if (audio.duration) audio.currentTime = draft.hl[0] * audio.duration;
        audio.removeEventListener('loadedmetadata', seek);
      };
      audio.duration ? (audio.currentTime = draft.hl[0] * audio.duration) : audio.addEventListener('loadedmetadata', seek);
    });

    // ── lane + prices ──
    // The lane decides whether a visitor sees a number at all. Quote is the
    // safe setting for anything not owned and controlled outright, so the note
    // spells out the consequence rather than leaving it to be discovered.
    const laneNote = q('.te-lanenote');
    function paintLane() {
      panel.querySelectorAll('.te-lanebtn').forEach(b =>
        b.classList.toggle('on', b.dataset.lane === draft.lane));
      laneNote.textContent = draft.lane === 'quote'
        ? 'Every enquiry reaches you first. Prices below are kept but never shown — ready for when the rights are resolved.'
        : 'Priced and self-serve. Only for tracks owned and controlled outright.';
      panel.querySelector('.te-pgrid').classList.toggle('muted', draft.lane === 'quote');
    }
    panel.querySelectorAll('.te-lanebtn').forEach(b => b.addEventListener('click', () => {
      draft.lane = b.dataset.lane;
      paintLane();
    }));

    // One row per licence tier, taken straight off the chooser's own list so
    // the two can never drift apart. Blank means "use the catalogue default",
    // which is why the placeholder shows that default rather than a dash.
    // Rows are BUYER BANDS now, not the seven where-it-runs tiers. Prices moved
    // onto who-is-buying when the funnel was rebuilt; a grid of the old tiers
    // would edit fields nothing reads any more.
    const BANDS = (window.mutraLicense && mutraLicense.BUYERS) || {};
    const pgrid = panel.querySelector('.te-pgrid');
    pgrid.innerHTML = Object.entries(BANDS).map(([id, b]) => `
      <label class="te-prow">
        <span>${esc(b.short)}</span>
        <input type="number" min="0" data-tier="${esc(id)}"
               placeholder="${b.base == null ? 'quote only' : '₪' + b.base}"
               ${b.base == null ? 'disabled' : ''}>
      </label>`).join('');
    pgrid.querySelectorAll('input[data-tier]').forEach(inp => {
      const id = inp.dataset.tier;
      if (Number.isFinite(draft.prices[id])) inp.value = draft.prices[id];
      inp.addEventListener('input', () => {
        const v = inp.value.trim();
        if (v === '') delete draft.prices[id];
        else draft.prices[id] = Number(v);
      });
    });

    const feeInp = q('.te-fee');
    feeInp.value = draft.fee;
    feeInp.addEventListener('input', () => { draft.fee = feeInp.value.trim(); });
    paintLane();

    // ── cover art ──
    const fileInp = q('.te-cbtn input'), cstat = q('.te-cstat');
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files[0];
      if (!f) return;
      cstat.textContent = 'Uploading\u2026';
      try {
        const r = await fetch('/api/tracks/cover?slug=' + encodeURIComponent(track.slug), {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': f.type }, body: f,
        });
        if (!r.ok) throw new Error('upload_failed');
        const d = await r.json();
        draft.cover = d.url;
        q('.te-cimg').src = d.url;
        cstat.textContent = 'Uploaded \u2014 Save to apply';
      } catch { cstat.textContent = 'Upload failed'; }
      fileInp.value = '';
    });

    // ── save / reset ──
    q('.te-save').addEventListener('click', async () => {
      const patch = { ...(overrides[track.slug] || {}) };
      const base = { title: track.title, artist: track.artist, cover: track.cover };
      ['title', 'artist', 'cover'].forEach(f => { if (draft[f] && draft[f] !== base[f]) patch[f] = draft[f]; });
      ['key', 'scale', 'vocal'].forEach(f => { if (draft[f]) patch[f] = draft[f]; });
      if (draft.bpm) patch.bpm = Number(draft.bpm);
      EDIT_FACETS.forEach(([k]) => { patch[k] = draft[k]; });
      patch.hl = draft.hl;
      patch.credits = draft.credits.filter(c => c.role && c.name.trim());
      patch.prices = draft.prices;
      patch.lane = draft.lane;
      if (String(draft.fee).trim() !== '') patch.fee = Number(draft.fee);
      else delete patch.fee;
      patch.lyrics = draft.lyrics.trim();
      // a comma-separated artist field means several people — give each one a
      // real record rather than leaving them as a substring
      const names = draft.artist.split(',').map(x => x.trim()).filter(x => x.length >= 2);
      const credited = [...new Set([...names, ...patch.credits.map(c => c.name.trim())])];
      if (credited.length) await ensureArtists(credited);
      if (track.hidden) patch.hidden = true;
      if (await saveTrack(track.slug, patch)) {
        Object.assign(track, patch);
        HL[track.slug] = draft.hl;
        /* No syncChips() here: it clears every facet, which reset the admin's
           filters and threw the view back to the top after every save. Editing
           is a walk down a filtered list — keep the filters, keep the scroll
           (render(true) forces the keep even though the row just changed), and
           let the edited row update in place. */
        refreshVocab();
        panel.remove(); render(true);
      }
    });
    q('.te-reset').addEventListener('click', async () => {
      if (!confirm('Reset ' + track.title + ' to the original catalog entry?')) return;
      if (await saveTrack(track.slug, {})) { panel.remove(); location.reload(); }
    });
    q('.te-cancel').addEventListener('click', () => {
      if (overrides[track.slug] && overrides[track.slug].hl) HL[track.slug] = overrides[track.slug].hl;
      panel.remove(); render(true);
    });
  }

  /** The Hidden shelf: a real place to see what has been tucked away.
   *  Only exists in edit mode, because outside it the answer is always "none
   *  of them" — and it carries the count, so you can tell at a glance whether
   *  anything is hidden without opening it. */
  function syncHiddenToggle() {
    let hb = $('#hiddenToggle');
    const cur = $('#curateToggle');
    if (!curateMode || !cur) {
      if (hb) hb.remove();
      return;
    }
    const n = MUTRA.tracks.filter(t => t.hidden).length;
    if (!hb) {
      hb = document.createElement('button');
      hb.id = 'hiddenToggle';
      hb.className = 'fcat fcat-tgl fcat-hid';
      hb.addEventListener('click', () => {
        state.hiddenOnly = !state.hiddenOnly;
        hb.classList.toggle('on', state.hiddenOnly);
        render();
        toast(state.hiddenOnly
          ? `Showing ${MUTRA.tracks.filter(t => t.hidden).length} hidden \u2014 \u25cf unhides a track`
          : 'Back to the full catalog');
      });
      cur.insertAdjacentElement('afterend', hb);
    }
    hb.classList.toggle('on', state.hiddenOnly);
    hb.title = n ? `${n} hidden track${n === 1 ? '' : 's'}` : 'Nothing is hidden';
    hb.setAttribute('aria-pressed', state.hiddenOnly ? 'true' : 'false');
    // an eye with a slash — the same idea as the per-row \u25cb/\u25cf, at shelf scale
    hb.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/>'
      + '<circle cx="12" cy="12" r="3"/><path d="M3 21L21 3"/></svg>'
      + `<span>Hidden${n ? ' \u00b7 ' + n : ''}</span>`;
  }

  /** The toggle only ever exists for the owner — built on the account state
      landing, and torn down again if they sign out mid-session. */
  function syncCurateToggle() {
    const isAdmin = !!(window.MutraMembers && MutraMembers.user && MutraMembers.user.admin);
    let btn = $('#curateToggle');
    if (!isAdmin) {
      if (btn) btn.remove();
      const hb = $('#hiddenToggle');
      if (hb) hb.remove();
      // leaving edit mode must also drop the Hidden view, or a signed-out
      // visitor would be looking at an empty catalog with no way back
      if (curateMode || state.hiddenOnly) {
        curateMode = false; state.hiddenOnly = false; syncShelfButtons(); render();
      }
      return;
    }
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'curateToggle';
    btn.className = 'fcat fcat-tgl fcat-cur';
    btn.title = 'Edit the catalog';
    // the icon MUST be an <svg>: .fcat-tgl span is the collapsing label rule
    // (max-width:0 until hover), so a <span> icon renders as an invisible sliver
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z"/></svg><span>Edit catalog</span>';
    btn.addEventListener('click', () => {
      curateMode = !curateMode;
      btn.classList.toggle('on', curateMode);
      if (!curateMode) state.hiddenOnly = false;   // don't strand them in an empty view
      syncHiddenToggle();
      // Hidden shelves appear and disappear with edit mode, so the buttons have
      // to be re-synced here — this used to run once at boot and never again.
      syncShelfButtons();
      if (window.mutraBulkSetMode) window.mutraBulkSetMode(curateMode);
      // the pick ORDER arrows only mean anything in the picks sort, but the
      // rest of the editor works in any order, so don't hijack the sort
      render();
      toast(curateMode ? 'Editing — tick rows to edit in bulk, ✎ edits one' : 'Editing off');
    });
    favToggle.insertAdjacentElement('afterend', btn);
    syncHiddenToggle();
  }

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

  lyrBtn.addEventListener('click', () => {
    state.lyrics = !state.lyrics;
    spinToggle(lyrBtn);
    paintToggle(lyrBtn, state.lyrics, 'no-lyr');
    toast(state.lyrics ? 'Showing which tracks have lyrics' : 'Lyrics flag hidden');
  });
  keyBtn.addEventListener('click', () => {
    state.keys = !state.keys;
    spinToggle(keyBtn);
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
    spinToggle(hlBtn);
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
      syncCurateToggle();
    });
  }
  syncCurateToggle(); // in case the session was already resolved before this ran

  // ── deep link: ?license=slug opens the licence chooser, so a link can go
  //    to whoever actually signs off the budget ──
  (function licenseLink() {
    const slug = new URLSearchParams(location.search).get('license');
    if (!slug) return;
    setTimeout(() => {
      const t = MUTRA.tracks.find(x => x.slug === slug);
      if (t && window.mutraLicense) mutraLicense.open(t);
    }, 500);
  })();

  // ── deep link: ?track=slug opens (and plays) that track ──
  (function deepLink() {
    const slug = new URLSearchParams(location.search).get('track');
    if (!slug) return;
    // wait a tick so the first render + waveforms exist
    setTimeout(() => focusTrack(slug, true), 300);
  })();

  // ── "sounds like this" — neighbours precomputed from the audio itself ──

  /** One open panel at a time under a row — credits, lyrics and "sounds like
   *  this" all share the slot, so opening one closes whatever was there. */
  function rowPanel(row, slug, kind, html) {
    const open = row.nextElementSibling;
    const mine = open && open.classList.contains('sim-panel')
      && open.dataset.slug === slug && open.dataset.kind === kind;
    document.querySelectorAll('.sim-panel').forEach(p => p.remove());
    if (mine) return null;
    const panel = document.createElement('div');
    panel.className = 'sim-panel';
    panel.dataset.slug = slug;
    panel.dataset.kind = kind;
    panel.innerHTML = html;
    row.insertAdjacentElement('afterend', panel);
    const close = panel.querySelector('.sim-close');
    if (close) close.addEventListener('click', () => panel.remove());
    return panel;
  }

  function showCredits(track, row) {
    const credits = track.credits || [];
    const artists = String(track.artist || '').split(',').map(s => s.trim()).filter(Boolean);
    const body = credits.length
      ? `<dl class="cr-list">${credits.map(c =>
          `<div><dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd></div>`).join('')}</dl>`
      : '<p class="cr-empty">No credits recorded for this track yet.</p>';
    rowPanel(row, track.slug, 'credits', `
      <div class="sim-head">Credits — <b>${esc(track.title)}</b>
        <button class="sim-close" aria-label="Close">&times;</button></div>
      <div class="cr-body">
        <div class="cr-artists">${artists.map(a => `<span class="cr-artist">${esc(a)}</span>`).join('')}</div>
        ${body}
      </div>`);
  }

  function showLyrics(track, row) {
    const body = track.lyrics
      ? `<pre class="ly-text">${esc(track.lyrics)}</pre>`
      : `<p class="cr-empty">${track.vocal === 'Vocals'
          ? 'This track has vocals, but the lyrics aren’t written up yet.'
          : 'This is an instrumental — no lyrics.'}</p>`;
    rowPanel(row, track.slug, 'lyrics', `
      <div class="sim-head">Lyrics — <b>${esc(track.title)}</b>
        <button class="sim-close" aria-label="Close">&times;</button></div>
      <div class="cr-body">${body}</div>`);
  }

  /** Quote-lane licensing: an enquiry rather than a checkout. */
  function startQuote(track) {
    const subject = `Mutra — licence enquiry: ${track.title}`;
    const body = `Hi Snowstar,\n\nI'd like to license "${track.title}" by ${track.artist}.\n\n`
      + `Where it will run:\nTerritory:\nHow long for:\n\nThanks!`;
    openMail('mailto:licensing@snowstar.company?subject='
      + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
    if (window.mutraTrack) mutraTrack('quote', track.slug);
  }

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
        loadTrack(t, liveRow || null);   // never borrow the originating row
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
    // the list lives in the Worker now (owner-editable); this local copy is
    // only the emergency fallback if the API can't be reached
    const render = (items) => {
      const html = items.map(l =>
        `<img src="${l.url}" alt="" loading="lazy"${l.tone === 'mixed' ? ' data-tone="mixed"' : ''}>`).join('');
      track.innerHTML = html + html;   // doubled so the loop is seamless
    };
    fetch('/api/logos')
      .then(r => { if (!r.ok) throw new Error('logos_' + r.status); return r.json(); })
      .then(d => render(d.logos))
      .catch(() => {
        const LOGOS = [10, 2, 7, 4, 23, 19, 20, 21, 12, 1, 17, 3, 14,
                       6, 8, 11, 18, 16, 5, 31, 0, 9, 24, 29, 22, 30, 32, 27,
                       13, 26, 25, 28, 15];
        const MIXED = new Set([2, 19]); // carry their own dark ink, so they don't get inverted
        render(LOGOS.map(n => ({ url: `assets/clients/logo${String(n).padStart(2, '0')}.png`,
                                 tone: MIXED.has(n) ? 'mixed' : '' })));
      });
  })();

  /* "I have a brief" opens the Describe-it panel rather than a signup form.
     Somebody who arrives with a brief wants to hand it over, not make an
     account first — and the panel is the thing that can actually read it. */
  const heroBrief = $('#heroBrief');
  if (heroBrief) heroBrief.addEventListener('click', () => {
    // A toggle, not a launcher: the second press closes what the first opened.
    if (document.body.classList.contains('ag-open')) {
      if (window.mutraAgent) mutraAgent.close();
      return;
    }
    document.querySelector('#browse')?.scrollIntoView({ behavior: 'smooth' });
    if (window.mutraAgent) mutraAgent.open();
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
      /* Characters are pictures, not a filter list. People scroll the results
         WHILE looking at the row and come back to it, so closing it out from
         under them loses their place for no gain — the exemption is the shelf,
         not the drawer in general. */
      if (SHELF[openCat] && fdrop.querySelector('.charrow')) { openedAt = null; return; }
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
