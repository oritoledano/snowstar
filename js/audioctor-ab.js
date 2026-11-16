/* Audioctor's hero: one video, its sound Before and After, one switch (2026-11-15, the council: "the advanced part
   is one switch on a playing video; hear the difference within 3 seconds").
   The picture plays muted; both sounds are decoded once and started together on the AudioContext's clock, so the
   switch is a crossfade between two copies of the same moment, never a jump. The picture follows the sound's clock.
   Before and After are at the same loudness (-16 LUFS, made so in media/audioctor/ab), so the switch is heard as the
   change, not the volume. The first play opens on Before and turns to After by itself after 2.5 s, once.
   Media: media/audioctor/ab/<ex>.mp4 (no sound), <ex>-before.m4a, <ex>-after.m4a, <ex>.jpg, peaks.json. */
(function () {
  const root = document.getElementById('abp');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const M = '../media/audioctor/ab/';
  const EX = {                                        // the first one opens (2026-11-16, Ori: Dalit's lecture first)
    lecture: { cap: 'Dalit Nemirovsky · a lecture', tall: true },
    reel:    { cap: 'Shahak Shapira · a phone reel', tall: true },
  };
  const video = $('abVideo'), canvas = $('abWave'), g = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ex = 'lecture', after = true, peaks = null, ctx = null, gains = null, srcs = [], bufs = {}, startAt = 0, dur = 0;
  let playing = false, flipped = false, morph = 1, morphFrom = 1, morphAt = 0, raf = 0, flipTimer = 0, loading = false;

  fetch(M + 'peaks.json').then((r) => r.json()).then((p) => { peaks = p; draw(); }).catch(() => {});

  function setEx(name) {
    stop();
    ex = name;
    const e = EX[name];
    root.classList.toggle('tall', e.tall);
    video.poster = M + name + '.jpg';
    video.src = M + name + '.mp4';
    root.style.setProperty('--poster', `url("${M}${name}.jpg")`);
    $('abCap').textContent = e.cap;
    root.querySelectorAll('[data-ex]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ex === name)));
    flipped = false;
    setSide(true, true);
    draw();
  }

  function setSide(isAfter, instant) {
    after = isAfter;
    $('abBefore').setAttribute('aria-pressed', String(!after));
    $('abAfter').setAttribute('aria-pressed', String(after));
    root.classList.toggle('after', after);
    $('abTag').textContent = after ? 'After · Audioctor' : 'Before';
    if (gains && ctx) {
      const t = ctx.currentTime, k = instant ? 0.005 : 0.12;
      gains.before.gain.cancelScheduledValues(t); gains.after.gain.cancelScheduledValues(t);
      gains.before.gain.setValueAtTime(gains.before.gain.value, t); gains.after.gain.setValueAtTime(gains.after.gain.value, t);
      gains.before.gain.linearRampToValueAtTime(after ? 0 : 1, t + k);
      gains.after.gain.linearRampToValueAtTime(after ? 1 : 0, t + k);
    }
    morphFrom = morph; morphAt = performance.now();
    if (instant || reduce) { morph = after ? 1 : 0; morphFrom = morph; }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  async function load(name) {
    if (bufs[name]) return bufs[name];
    const get = (side) => fetch(M + name + '-' + side + '.m4a').then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a));
    const [b, a] = await Promise.all([get('before'), get('after')]);
    return (bufs[name] = { before: b, after: a });
  }

  async function play() {
    if (loading) return;
    loading = true;
    root.classList.add('busy');
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const b = await load(ex);
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
      if (!flipped) {                                   // the first play: Before first, then After by itself
        setSide(false, true);
        flipTimer = setTimeout(() => { flipped = true; if (playing) setSide(true); }, 2500);
      } else setSide(after, true);
      video.currentTime = from;
      document.querySelectorAll('.film .sound[aria-pressed="true"]').forEach((b) => b.click());   // one sound at a time
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
    srcs.forEach((s) => { try { s.stop(); } catch (e) {} });
    srcs = [];
    video.pause();
    playing = false;
    root.classList.remove('playing');
  }

  const clock = () => (ctx && playing ? ((ctx.currentTime - startAt) % dur + dur) % dur : video.currentTime || 0);

  function tick(now) {
    raf = 0;
    if (!reduce) {
      const k = Math.min(1, (now - morphAt) / 320), e = 1 - Math.pow(1 - k, 3);
      morph = morphFrom + ((after ? 1 : 0) - morphFrom) * e;
    }
    if (playing && dur) {                              // the picture keeps the sound's time
      const t = clock();
      if (Math.abs(video.currentTime - t) > 0.08 && !video.seeking) video.currentTime = t;
    }
    draw();
    if (playing || Math.abs(morph - (after ? 1 : 0)) > 0.001) raf = requestAnimationFrame(tick);
  }

  function draw() {
    const W = canvas.width, H = canvas.height, mid = H / 2;
    g.clearRect(0, 0, W, H);
    const p = peaks && peaks[ex];
    if (!p) return;
    const n = p.before.length, w = W / n, prog = dur ? clock() / dur : 0;
    for (let i = 0; i < n; i++) {
      const v = p.before[i] + (p.after[i] - p.before[i]) * morph;
      const h = Math.max(1.5, v * (mid - 4));
      const played = i / n < prog;
      // Before amber, After lime; the played part brighter
      const r = Math.round(255 + (200 - 255) * morph), gg = Math.round(211 + (242 - 211) * morph), b = Math.round(138 + (58 - 138) * morph);
      g.fillStyle = `rgba(${r},${gg},${b},${played ? 0.95 : 0.38})`;
      g.fillRect(i * w + 1, mid - h, Math.max(1, w - 2), h * 2);
    }
    if (dur) { g.fillStyle = '#f3eddc'; g.fillRect(prog * W - 1, 0, 2, H); }
  }

  $('abPlay').addEventListener('click', () => (playing ? stop() : play()));
  video.addEventListener('click', () => (playing ? stop() : play()));
  $('abBefore').addEventListener('click', () => { flipped = true; clearTimeout(flipTimer); setSide(false); if (!playing) play(); });
  $('abAfter').addEventListener('click', () => { flipped = true; clearTimeout(flipTimer); setSide(true); if (!playing) play(); });
  canvas.addEventListener('click', (e) => {               // the waveform moves through the clip
    if (!dur) return;
    const r = canvas.getBoundingClientRect(), t = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)) * dur;
    const was = playing; stop(); video.currentTime = t; draw(); if (was) play();
  });
  root.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.ex !== ex) setEx(b.dataset.ex); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });
  document.querySelectorAll('.film .sound').forEach((b) => b.addEventListener('click', () => { if (playing) stop(); }));
  if ('IntersectionObserver' in window)                 // out of sight, out of hearing
    new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting && playing) stop(); }), { threshold: 0.15 }).observe(root);

  // On a phone the Mac app is a link to keep: share it, or mail it to yourself
  const mail = $('abMail');
  if (mail) mail.addEventListener('click', (e) => {
    if (navigator.share) {
      e.preventDefault();
      navigator.share({ title: 'Audioctor for my Mac', url: 'https://snowstar.company/apps/audioctor.html' }).catch(() => {});
    }
  });

  setEx('lecture');
})();
