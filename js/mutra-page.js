/* ═══════════ Mutra page — catalog, filters, sticky player w/ working seek ═══════════ */
(function () {
  const $ = s => document.querySelector(s);
  const fmt = t => (isNaN(t) || t == null) ? '0:00' : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const mailto = title =>
    'mailto:hello@snowstar.company?subject=' + encodeURIComponent('Mutra license: ' + title) +
    '&body=' + encodeURIComponent(`Hi Snowstar,\n\nI'd like to license "${title}".\n\nUsage / media:\nTimeline:\n\nThanks!`);

  // deterministic pseudo-waveform so each track looks distinct but stable
  const waveform = (seed, n = 42) => {
    const bars = [];
    let x = seed * 9301 + 49297;
    for (let i = 0; i < n; i++) {
      x = (x * 9301 + 49297) % 233280;
      const r = x / 233280;
      bars.push(18 + Math.round(r * r * 82)); // 18–100%
    }
    return bars;
  };

  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';

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
    const bars = row.querySelectorAll('.trk-wave .bar');
    const head = Math.floor(frac * bars.length);
    bars.forEach((b, i) => {
      b.classList.toggle('on', i <= head);
      b.classList.toggle('head', i === head);
    });
  }

  function loadTrack(track, row) {
    if (current && current.track === track) { toggle(); return; }
    if (current) current.row.classList.remove('playing');
    current = { track, row };
    row.classList.add('playing');
    audio.src = track.preview;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    plTitle.textContent = track.title;
    plArtist.textContent = track.artist;
    plTot.textContent = fmt(track.duration);
    plCur.textContent = '0:00';
    plLic.href = mailto(track.title);
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
  const tracksEl = $('#tracks'), countEl = $('#catCount');
  const state = { genre: 'ALL', mood: 'ALL', q: '' };

  function matches(t) {
    if (state.genre !== 'ALL' && !t.genres.includes(state.genre)) return false;
    if (state.mood !== 'ALL' && !t.moods.includes(state.mood)) return false;
    if (state.q && !t.title.toLowerCase().includes(state.q)) return false;
    return true;
  }

  function render() {
    const list = MUTRA.tracks.filter(matches);
    countEl.textContent = list.length + (list.length === 1 ? ' track' : ' tracks');
    tracksEl.innerHTML = '';
    if (!list.length) { tracksEl.innerHTML = '<p class="cat-empty">No tracks match those filters — try clearing one.</p>'; return; }
    list.forEach(track => {
      const i = MUTRA.tracks.indexOf(track);
      const row = document.createElement('div');
      row.className = 'trk' + (current && current.track === track ? ' playing' : '');
      const bars = waveform(i + 1).map(h => `<span class="bar" style="height:${h}%"></span>`).join('');
      const tags = [
        ...track.genres.map(g => `<span class="tag">${g}</span>`),
        ...track.moods.slice(0, 2).map(m => `<span class="tag mood">${m}</span>`),
      ].join('');
      row.innerHTML = `
        <button class="trk-play" aria-label="Play ${track.title}">${current && current.track === track && !audio.paused ? ICON_PAUSE : ICON_PLAY}</button>
        <div class="trk-id">
          <div class="trk-title">${track.title}</div>
          <div class="trk-artist">${track.artist}</div>
        </div>
        <div class="trk-wave" role="button" aria-label="Seek ${track.title}">${bars}</div>
        <div class="trk-tags">${tags}</div>
        <div class="trk-right">
          <span class="trk-dur">${fmt(track.duration)}</span>
          <a class="trk-lic" href="${mailto(track.title)}">License</a>
        </div>`;
      row.querySelector('.trk-play').addEventListener('click', () => loadTrack(track, row));
      // seeking by clicking a track's own waveform (only when it's the playing track)
      const wave = row.querySelector('.trk-wave');
      wave.addEventListener('click', e => {
        if (!current || current.track !== track) { loadTrack(track, row); return; }
        if (!audio.duration) return;
        const r = wave.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      });
      if (current && current.track === track) paintWave(row, audio.duration ? audio.currentTime / audio.duration : 0);
      tracksEl.appendChild(row);
    });
    // keep the live "playing" row reference valid after re-render
    if (current) {
      const live = [...tracksEl.querySelectorAll('.trk')].find((_, idx) => MUTRA.tracks.filter(matches)[idx] === current.track);
      if (live) current.row = live;
    }
  }

  // ── filter chips ──
  function buildChips(rowEl, values, key) {
    ['ALL', ...values].forEach((v, i) => {
      const c = document.createElement('button');
      c.className = 'chip' + (key === 'mood' ? ' mood' : '') + (i === 0 ? ' active' : '');
      c.textContent = v === 'ALL' ? (key === 'genre' ? 'All genres' : 'All moods') : v;
      c.addEventListener('click', () => {
        rowEl.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        state[key] = v;
        render();
      });
      rowEl.appendChild(c);
    });
  }
  buildChips($('#genreRow'), MUTRA.genres, 'genre');
  buildChips($('#moodRow'), MUTRA.moods, 'mood');
  $('#search').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });

  render();

  // ── hero equalizer bars ──
  const eq = $('#heroEq');
  if (eq) for (let i = 0; i < 11; i++) {
    const s = document.createElement('span');
    s.style.animationDelay = (i * 0.11).toFixed(2) + 's';
    s.style.animationDuration = (1 + (i % 4) * 0.28).toFixed(2) + 's';
    eq.appendChild(s);
  }

  // ── nav + reveal ──
  const mnav = $('#mnav');
  addEventListener('scroll', () => mnav.classList.toggle('scrolled', scrollY > 24), { passive: true });
  const burger = $('#mnavBurger'), links = $('#mnavLinks');
  burger.addEventListener('click', () => links.classList.toggle('open'));
  links.addEventListener('click', e => { if (e.target.tagName === 'A') links.classList.remove('open'); });

  const obs = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); obs.unobserve(x.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.rv').forEach(el => obs.observe(el));
  document.getElementById('statTracks').textContent = MUTRA.tracks.length;
  document.getElementById('year').textContent = new Date().getFullYear();
})();
