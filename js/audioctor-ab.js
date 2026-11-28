/* Audioctor's reels: each phone is one video and its sound Before and After, one switch (2026-11-15, the council: "the
   advanced part is one switch on a playing video; hear the difference within 3 seconds"; 2026-11-16, Ori: three phones
   side by side, and playing one stops the others).
   Each picture plays muted; its two sounds are decoded once and started together on one shared AudioContext's clock, so
   the switch is a crossfade between two copies of the same moment, never a jump. The picture follows the sound's clock.
   Before and After are at the same loudness (-16 LUFS, made so in media/audioctor/ab), so the switch is heard as the
   change, not the volume. A reel's first play opens on Before and turns to After by itself after 2.5 s, once.
   Media: media/audioctor/ab/<ex>.mp4 (no sound), <ex>-before.m4a, <ex>-after.m4a, <ex>.jpg, peaks.json.
   Markup: apps/audioctor.html, figure.abp[data-ex] in #video; the per-reel ids end in -<ex>. */
(function () {
  const figs = [...document.querySelectorAll('.abp[data-ex]')];
  if (!figs.length) return;
  const M = '../media/audioctor/ab/';
  const V = '?v=5';                                   // media version: a new reel's URL is never one the CDN already holds as a miss
  /* Each reel: its name and its caption. The rail shows the icons without counts (2026-11-16, Ori: no numbers); a
     reel's counts [likes, comments, reposts, shares] would go in `counts`. KAYMA – ONSITELOVER live at Jaffa Port is
     Ori's own: Before is the original from 19.681 s, After the app's export of the same 10.6 s, sample-aligned. */
  const EX = {
    onsite:  { name: 'KAYMA', av: 'K', cap: 'ONSITELOVER, live at Jaffa Port', audio: 'KAYMA · ONSITELOVER', counts: null },
    reel:    { name: 'shahak', av: 'S', cap: 'Hero or villain?', audio: 'Original audio', counts: null },
    lecture: { name: 'Dalit Nemirovsky', av: 'DN', cap: 'A lecture, filmed from the back row', audio: 'Original audio', counts: null },
    matan:   { name: 'Matan Hakimi', av: 'MH', cap: 'In the garage, with the bike', audio: 'Original audio', counts: null },
    i24:     { name: 'KAYMA', av: 'K', cap: 'In the studio at i24 News', audio: 'Original audio', counts: null },
    roy:     { name: 'Roy Rieck', av: 'RR', cap: 'On the bike, by the sea', audio: 'Original audio', counts: null },
    primal:  { name: 'primalvideo', av: 'PV', cap: 'Fix Bad Audio! How to Remove Wind Noise!', audio: 'Original audio', counts: null },
    nelly:   { name: 'Nelly Tagar', av: 'NT', cap: 'Stand-up, live on stage', audio: 'Original audio', counts: null },
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ctx = null, peaks = null, current = null;
  const bufs = {};
  const players = [];

  fetch(M + 'peaks.json' + V).then((r) => r.json()).then((p) => { peaks = p; players.forEach((pl) => pl.draw()); }).catch(() => {});

  function load(name) {
    if (!bufs[name]) {
      const get = (side) => fetch(M + name + '-' + side + '.m4a' + V).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a));
      bufs[name] = Promise.all([get('before'), get('after')]).then(([b, a]) => ({ before: b, after: a }));
      bufs[name].catch(() => { delete bufs[name]; });
    }
    return bufs[name];
  }

  function Player(root) {
    const name = root.dataset.ex, e = EX[name] || {};
    const $ = (id) => document.getElementById(id + '-' + name);
    const video = root.querySelector('video'), canvas = root.querySelector('.abp-wave'), g = canvas.getContext('2d');
    const playBtn = root.querySelector('.abp-play'), tag = $('abTag');
    const bBefore = root.querySelector('[data-side="before"]'), bAfter = root.querySelector('[data-side="after"]');
    let after = true, gains = null, srcs = [], startAt = 0, dur = 0, playing = false, flipped = false;
    let morph = 1, morphFrom = 1, morphAt = 0, raf = 0, flipTimer = 0, loading = false;
    const api = { stop: () => stop(), draw: () => draw() };

    $('rName').textContent = e.name || '';
    $('rAv').textContent = e.av || '';
    $('rCap').textContent = e.cap || '';
    $('rAudio').textContent = e.audio || 'Original audio';
    ['rLikes', 'rComments', 'rReposts', 'rShares'].forEach((id, i) => { $(id).textContent = e.counts ? e.counts[i] : ''; });
    video.poster = M + name + '.jpg' + V;
    video.src = M + name + '.mp4' + V;

    function setSide(isAfter, instant) {
      after = isAfter;
      bBefore.setAttribute('aria-pressed', String(!after));
      bAfter.setAttribute('aria-pressed', String(after));
      root.classList.toggle('after', after);
      tag.textContent = after ? 'After · Audioctor' : 'Before';
      if (gains && ctx) {
        const t = ctx.currentTime, k = instant ? 0.005 : 0.12;
        for (const [side, on] of [['before', !after], ['after', after]]) {
          const p = gains[side].gain;
          p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(on ? 1 : 0, t + k);
        }
      }
      morphFrom = morph; morphAt = performance.now();
      if (instant || reduce) { morph = after ? 1 : 0; morphFrom = morph; }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    async function play() {
      if (loading) return;
      loading = true;
      root.classList.add('busy');
      if (current && current !== api) current.stop();             // one reel at a time
      current = api;
      document.querySelectorAll('.film .sound[aria-pressed="true"]').forEach((b) => b.click());   // and no film's sound
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') await ctx.resume();
        const b = await load(name);
        if (current !== api) return;                              // another reel was pressed while this one loaded
        if (!gains) {
          gains = { before: ctx.createGain(), after: ctx.createGain() };
          gains.before.connect(ctx.destination); gains.after.connect(ctx.destination);
        }
        dur = Math.min(b.before.duration, b.after.duration);
        const from = video.currentTime && video.currentTime < dur - 0.05 ? video.currentTime : 0;
        const at = ctx.currentTime + 0.06;
        srcs = ['before', 'after'].map((side) => {
          const s = ctx.createBufferSource();
          s.buffer = b[side]; s.loop = true; s.loopStart = 0; s.loopEnd = dur;
          s.connect(gains[side]); s.start(at, from);
          return s;
        });
        startAt = at - from;
        if (!flipped) {                                           // the first play: Before first, then After by itself
          setSide(false, true);
          flipTimer = setTimeout(() => { flipped = true; if (playing) setSide(true); }, 2500);
        } else setSide(after, true);
        video.currentTime = from;
        await video.play().catch(() => {});
        playing = true;
        root.classList.add('playing');
        if (!raf) raf = requestAnimationFrame(tick);
      } finally {
        loading = false;
        root.classList.remove('busy');
      }
    }

    function stop() {
      clearTimeout(flipTimer);
      srcs.forEach((s) => { try { s.stop(); } catch (err) {} });
      srcs = [];
      video.pause();
      playing = false;
      root.classList.remove('playing');
      if (current === api) current = null;
    }

    const clock = () => (ctx && playing ? ((ctx.currentTime - startAt) % dur + dur) % dur : video.currentTime || 0);

    function tick(now) {
      raf = 0;
      if (!reduce) {
        const k = Math.min(1, (now - morphAt) / 320), ez = 1 - Math.pow(1 - k, 3);
        morph = morphFrom + ((after ? 1 : 0) - morphFrom) * ez;
      }
      if (playing && dur) {                                       // the picture keeps the sound's time
        const t = clock();
        if (Math.abs(video.currentTime - t) > 0.08 && !video.seeking) video.currentTime = t;
      }
      draw();
      if (playing || Math.abs(morph - (after ? 1 : 0)) > 0.001) raf = requestAnimationFrame(tick);
    }

    function draw() {
      const W = canvas.width, H = canvas.height, mid = H / 2;
      g.clearRect(0, 0, W, H);
      const p = peaks && peaks[name];
      if (!p) return;
      const n = p.before.length, w = W / n, prog = dur ? clock() / dur : 0;
      // Before amber, After lime; the played part brighter
      const r = Math.round(255 + (200 - 255) * morph), gg = Math.round(211 + (242 - 211) * morph), bl = Math.round(138 + (58 - 138) * morph);
      for (let i = 0; i < n; i++) {
        const v = p.before[i] + (p.after[i] - p.before[i]) * morph;
        const h = Math.max(1, v * (mid - 2));
        g.fillStyle = `rgba(${r},${gg},${bl},${i / n < prog ? 0.95 : 0.38})`;
        g.fillRect(i * w + 1, mid - h, Math.max(1, w - 2), h * 2);
      }
      if (dur) { g.fillStyle = '#f3eddc'; g.fillRect(prog * W - 1, 0, 2, H); }
    }

    playBtn.addEventListener('click', () => (playing ? stop() : play()));
    video.addEventListener('click', () => (playing ? stop() : play()));
    bBefore.addEventListener('click', () => { flipped = true; clearTimeout(flipTimer); setSide(false); if (!playing) play(); });
    bAfter.addEventListener('click', () => { flipped = true; clearTimeout(flipTimer); setSide(true); if (!playing) play(); });
    canvas.addEventListener('click', (ev) => {                    // the waveform moves through the clip
      if (!dur) return;
      const rc = canvas.getBoundingClientRect(), t = Math.max(0, Math.min(0.999, (ev.clientX - rc.left) / rc.width)) * dur;
      const was = playing; stop(); video.currentTime = t; draw(); if (was) play();
    });
    if ('IntersectionObserver' in window)                         // out of sight, out of hearing
      new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting && playing) stop(); }), { threshold: 0.15 }).observe(root);

    setSide(true, true);
    return api;
  }

  figs.forEach((f) => players.push(Player(f)));
  document.addEventListener('visibilitychange', () => { if (document.hidden && current) current.stop(); });
  document.querySelectorAll('.film .sound').forEach((b) => b.addEventListener('click', () => { if (current) current.stop(); }));

  // On a phone the Mac app is a link to keep: share it, or mail it to yourself
  const mail = document.getElementById('abMail');
  if (mail) mail.addEventListener('click', (ev) => {
    if (navigator.share) {
      ev.preventDefault();
      navigator.share({ title: 'Audioctor for my Mac', url: 'https://snowstar.company/apps/audioctor.html' }).catch(() => {});
    }
  });
})();
