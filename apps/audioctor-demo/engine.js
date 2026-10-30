/* Audioctor web demo: the engine's real output, played in the browser with the app's own mixing rules.
 *
 * window.AudioctorDemo.Engine plays one example at a time from media/manifest.json (made by build_audio.py from
 * AudioctorCli's ch_<Part>.wav files). It mixes exactly as the app's desk does (engine/Pipeline.cpp sum + applyEq):
 *   each part = the EQ's  unprocessed + amount x band(processed - unprocessed)  (flat EQ: the processed part as is),
 *   then mono (0.5 (L+R) on both sides), the fader, ON and solo; Background starts at -40 dB.
 * Before and After are each at -16 LUFS, like the app's switch. Switching keeps the position and plays on.
 *
 * window.AudioctorDemo.bridge(engine) speaks the app's JUCE bridge (window.__JUCE__.backend), so app/ui/index.html
 * runs unchanged on top of it: the same calls ('select', 'transport', 'setChannel', 'setEq', 'eqSpectrum', ...),
 * the same events ('files', 'selected', 'position', 'afterPeaks', 'status', ...). Nothing is processed here: what
 * the demo can't do (your own file, export, other engine settings) it says, and hands over to the free download.
 */
(function () {
  'use strict';
  const dbToG = db => (db <= -60 ? 0 : Math.pow(10, db / 20));
  const KIND = name => (name === 'Voice' ? 'voice' : name === 'Background' ? 'background' : 'part');
  const eqFlat = s => s.amount >= 0.999 && s.loHz <= 20.5 && s.hiHz >= 19999;
  const freshState = name => ({ gainDb: name === 'Background' ? -40 : 0, on: true, mono: false, solo: false, loHz: 20, hiHz: 20000, amount: 1 });

  class Engine {
    constructor(media) {
      this.media = media.replace(/\/?$/, '/');
      this.ctx = null; this.manifest = null; this.buffers = new Map(); this.loading = new Map();
      this.ex = null; this.variant = null; this.states = {};   // states[exampleId][variantKey][part]
      this.showAfter = true; this.playing = false; this.pos = 0; this.startedAt = 0; this.graph = null;
      this.listeners = {};
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, payload) { (this.listeners[ev] || []).forEach(fn => fn(payload)); }

    async init() {
      const r = await fetch(this.media + 'manifest.json');
      if (!r.ok) throw new Error('manifest ' + r.status);
      this.manifest = await r.json();
      return this.manifest.examples;
    }
    examples() { return this.manifest ? this.manifest.examples : []; }
    audio() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        const lim = this.ctx.createDynamicsCompressor();          // the desk's ceiling: nothing past about -1 dBFS
        lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
        lim.connect(this.ctx.destination);
        this.master = lim;
      }
      return this.ctx;
    }
    async unlock() {
      // iPhone: Web Audio follows the ringer switch unless the page says it plays media
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      const c = this.audio(); if (c.state !== 'running') { try { await c.resume(); } catch (e) {} }
    }

    // ---- loading: every file of an example, decoded once, with progress
    filesOf(ex) {
      const f = [ex.before.file];
      Object.values(ex.variants).forEach(v => v.channels.forEach(c => f.push(c.file)));
      return [...new Set(f)];
    }
    async load(id, onProgress) {
      const ex = this.examples().find(e => e.id === id);
      if (!ex) throw new Error('no example ' + id);
      const files = this.filesOf(ex).filter(f => !this.buffers.has(f));
      if (!files.length) return ex;
      if (this.loading.has(id)) return this.loading.get(id);
      const ctx = this.audio();
      let done = 0;
      const p = Promise.all(files.map(async f => {
        const r = await fetch(this.media + f);
        if (!r.ok) throw new Error(f + ' ' + r.status);
        const ab = await r.arrayBuffer();
        const buf = await new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej); });
        this.buffers.set(f, buf);
        done++; if (onProgress) onProgress(done / files.length);
      })).then(() => { this.loading.delete(id); return ex; });
      this.loading.set(id, p);
      return p;
    }

    // ---- what is selected
    stateOf(name) {
      const e = this.states[this.ex.id] = this.states[this.ex.id] || {};
      const v = e[this.variant] = e[this.variant] || {};
      return v[name] = v[name] || freshState(name);
    }
    v() { return this.ex.variants[this.variant]; }
    channels() {
      return this.v().channels.map(c => {
        const s = this.stateOf(c.name), kind = KIND(c.name);
        return Object.assign({ name: c.name, kind, stereo: true, eq: kind !== 'background', minor: !!c.minor }, s);
      });
    }
    flags(key) {                      // what a variant is, in the app's step words
      const v = this.ex.variants[key];
      return { parts: v.parts || (v.channels.some(c => c.name === 'Drums') ? 'instruments' : 'voice'), quality: v.quality || 'best',
        clean: v.chain.includes('clean'), studio: v.chain.includes('studio'), highs: v.chain.includes('highs'), separate: v.chain.includes('separate') };
    }
    rawVoice() {                      // the voice before cleaning, from the same separation (the EQ's "unprocessed")
      const f = this.flags(this.variant);
      const k = Object.keys(this.ex.variants).find(key => { const g = this.flags(key); return g.parts === f.parts && !g.clean && !g.studio; });
      const c = k && this.ex.variants[k].channels.find(x => x.name === 'Voice');
      return c ? this.buffers.get(c.file) : null;
    }
    steps() { const f = this.flags(this.variant); return { quality: f.quality, separate: f.separate, clean: f.clean, studio: f.studio, highs: f.highs }; }
    find(want) {                      // the variant that matches the asked steps, or null
      return Object.keys(this.ex.variants).find(k => {
        const f = this.flags(k);
        return f.parts === want.parts && f.quality === (want.quality || f.quality) && f.clean === !!want.clean && f.studio === !!want.studio;
      }) || null;
    }
    select(ex, variant) {
      const wasPlaying = this.playing;
      if (this.ex && this.ex.id !== ex.id) { this.stopGraph(); this.pos = 0; }
      this.ex = ex; this.variant = variant || 'base';
      if (this.pos > ex.seconds) this.pos = 0;
      if (wasPlaying) this.startGraph(); else this.stopGraph();
    }
    setVariant(key) { if (key === this.variant) return; const was = this.playing; this.pos = this.position(); this.stopGraph(); this.variant = key; if (was) this.startGraph(); }

    // ---- the desk
    position() { return this.playing ? Math.min(this.ex.seconds, this.ctx.currentTime - this.startedAt) : this.pos; }
    stopGraph() {
      if (this.graph) { this.graph.sources.forEach(s => { try { s.stop(); } catch (e) {} s.disconnect(); }); this.graph.out.disconnect(); }
      this.graph = null; this.playing = false;
    }
    startGraph() {
      const ctx = this.audio(), ex = this.ex, v = this.v();
      this.stopGraph();
      const out = ctx.createGain(); out.connect(this.master);
      const sources = [], strips = [];
      const src = buf => { const s = ctx.createBufferSource(); s.buffer = buf; sources.push(s); return s; };
      const gainNode = (g, from, to) => { const n = ctx.createGain(); n.gain.value = g; if (from) from.connect(n); if (to) n.connect(to); return n; };
      const band = (from, to) => {             // 24 dB/oct high-pass at lo, 24 dB/oct low-pass at hi
        const f = ['highpass', 'highpass', 'lowpass', 'lowpass'].map(t => { const b = ctx.createBiquadFilter(); b.type = t; b.Q.value = 0.7071; return b; });
        from.connect(f[0]); f[0].connect(f[1]); f[1].connect(f[2]); f[2].connect(f[3]); f[3].connect(to);
        return f;
      };
      const beforeBuf = this.buffers.get(ex.before.file);
      // Before: the original at -16 LUFS
      const bSrc = src(beforeBuf), bBus = gainNode(this.showAfter ? 0 : ex.before.gain, bSrc, out);
      const bMeter = ctx.createAnalyser(); bMeter.fftSize = 1024; bBus.connect(bMeter);
      // After: every part through its EQ, mono, fader; the variant's gain puts the default desk at -16 LUFS
      const aBus = gainNode(this.showAfter ? v.gain : 0, null, out);
      const rawVoice = this.rawVoice();
      v.channels.forEach((c, i) => {
        const sum = ctx.createGain();
        const p = src(this.buffers.get(c.file));
        const procDirect = gainNode(1, p, sum), procBand = gainNode(0, null, sum);
        const pf = band(p, procBand);
        // the unprocessed signal the EQ blends from: the voice before cleaning, or for a part the whole mix (its bleed)
        let unDirect = null, unBand = null, uf = null;
        const unBuf = KIND(c.name) === 'voice' ? rawVoice : KIND(c.name) === 'part' ? beforeBuf : null;
        if (unBuf && unBuf !== this.buffers.get(c.file)) {
          const u = src(unBuf);
          unDirect = gainNode(0, u, sum); unBand = gainNode(0, null, sum); uf = band(u, unBand);
        }
        const stereo = gainNode(1, sum), mono = ctx.createGain();
        mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
        sum.connect(mono);
        const monoOut = gainNode(0, mono);
        const fader = gainNode(0); stereo.connect(fader); monoOut.connect(fader); fader.connect(aBus);
        const meter = ctx.createAnalyser(); meter.fftSize = 1024; fader.connect(meter);
        strips.push({ name: c.name, procDirect, procBand, pf, unDirect, unBand, uf, stereo, monoOut, fader, meter });
      });
      const at = Math.max(0, Math.min(this.pos, ex.seconds - 0.05)), t0 = ctx.currentTime + 0.03;
      sources.forEach(s => s.start(t0, at));
      this.startedAt = t0 - at; this.playing = true;
      this.graph = { sources, out, bBus, bMeter, aBus, strips };
      this.apply(true);
    }
    apply(now) {                       // the desk's state onto the graph
      const g = this.graph; if (!g) return;
      const ctx = this.ctx, t = ctx.currentTime, set = (param, val) => (now ? param.setValueAtTime(val, t) : param.setTargetAtTime(val, t, 0.012));
      const anySolo = this.v().channels.some(c => this.stateOf(c.name).solo);
      set(g.bBus.gain, this.showAfter ? 0 : this.ex.before.gain);
      set(g.aBus.gain, this.showAfter ? this.v().gain : 0);
      g.strips.forEach(st => {
        const s = this.stateOf(st.name), eqOn = KIND(st.name) !== 'background' && !eqFlat(s) && st.unDirect;
        set(st.procDirect.gain, eqOn ? 0 : 1);
        set(st.procBand.gain, eqOn ? s.amount : 0);
        if (st.unDirect) { set(st.unDirect.gain, eqOn ? 1 : 0); set(st.unBand.gain, eqOn ? -s.amount : 0); }
        [st.pf, st.uf].forEach(f => { if (!f) return; set(f[0].frequency, Math.max(20, s.loHz)); set(f[1].frequency, Math.max(20, s.loHz));
          set(f[2].frequency, Math.min(20000, s.hiHz)); set(f[3].frequency, Math.min(20000, s.hiHz)); });
        set(st.stereo.gain, s.mono ? 0 : 1); set(st.monoOut.gain, s.mono ? 1 : 0);
        set(st.fader.gain, s.on && (!anySolo || s.solo) ? dbToG(s.gainDb) : 0);
      });
    }
    play() { if (!this.playing) this.startGraph(); }
    pause() { if (this.playing) { this.pos = this.position(); this.stopGraph(); } }
    seek(s) { this.pos = Math.max(0, Math.min(this.ex.seconds, s)); if (this.playing) this.startGraph(); }
    setAfter(a) { this.showAfter = !!a; this.apply(false); }
    setChannel(name, patch) { Object.assign(this.stateOf(name), patch); this.apply(false); }
    resetMixer() { (this.states[this.ex.id] || {})[this.variant] = {}; this.apply(false); }
    tick() {                            // the transport loops at the end, like a sample on repeat
      if (this.playing && this.ctx.currentTime - this.startedAt >= this.ex.seconds - 0.02) { this.pos = 0; this.startGraph(); }
    }
    levels() {                          // the meters: peak per part, post-fader, at the output's gain; last: the original
      const n = this.v().channels.length, out = [];
      const peak = (an, g) => { if (!an) return 0; const a = new Float32Array(an.fftSize); an.getFloatTimeDomainData(a); let m = 0; for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i]); if (x > m) m = x; } return m * g; };
      for (let i = 0; i < n; i++) { const st = this.graph && this.graph.strips[i]; const p = this.playing ? peak(st && st.meter, this.v().gain) : 0; out.push([p, p]); }
      const b = this.playing && this.graph ? peak(this.graph.bMeter, 1) : 0; out.push([b, b]);
      return out;
    }

    // ---- pictures: the scope's waveform and the EQ's two spectra
    peaksOf(bufs, gains, n = 900) {
      const len = bufs[0].length, k = Math.max(1, Math.floor(len / n)), out = new Array(n).fill(0);
      bufs.forEach((b, j) => {
        const g = gains ? gains[j] : 1, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
        for (let i = 0; i < n; i++) { let m = 0; const a = i * k, e = Math.min(len, a + k); for (let s = a; s < e; s += 4) { const x = Math.abs(L[s] + R[s]) * 0.5 * g; if (x > m) m = x; } out[i] += m; }
      });
      return out;
    }
    peaksBefore() { return this.peaksOf([this.buffers.get(this.ex.before.file)]); }
    peaksAfter() {
      const chs = this.v().channels;
      return this.peaksOf(chs.map(c => this.buffers.get(c.file)), chs.map(c => dbToG(this.stateOf(c.name).gainDb)));
    }
    spectrum(name) {
      const c = this.v().channels.find(x => x.name === name); if (!c) return null;
      const kind = KIND(name);
      const unBuf = kind === 'voice' ? this.rawVoice() : this.buffers.get(this.ex.before.file);
      const P = avgSpectrum(this.buffers.get(c.file)), U = unBuf ? avgSpectrum(unBuf) : P;
      const freqs = [], p = [], u = [];
      for (let f = 20; f <= 20001; f *= Math.pow(2, 1 / 6)) {
        freqs.push(f); p.push(bandDb(P, f)); u.push(bandDb(U, f));
      }
      return { freqs, processed: p, unprocessed: u };
    }
  }

  // ---- a small FFT for the EQ's picture (the app averages Hann-windowed frames the same way)
  const N = 4096;
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function avgSpectrum(buf) {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const frames = Math.min(48, Math.max(1, Math.floor(L.length / N))), hop = Math.floor((L.length - N) / Math.max(1, frames - 1)) || 0;
    const P = new Float64Array(N / 2 + 1), re = new Float64Array(N), im = new Float64Array(N);
    for (let f = 0; f < frames; f++) {
      const o = f * hop;
      for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); re[i] = ((L[o + i] || 0) + (R[o + i] || 0)) * 0.5 * w; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    }
    return { P, frames, rate: buf.sampleRate };
  }
  function bandDb(S, f) {                // power over a sixth of an octave around f
    const lo = f * Math.pow(2, -1 / 12), hi = f * Math.pow(2, 1 / 12), k0 = Math.max(1, Math.floor(lo / S.rate * N)), k1 = Math.max(k0, Math.ceil(hi / S.rate * N));
    let s = 0; for (let k = k0; k <= Math.min(N / 2, k1); k++) s += S.P[k];
    return 10 * Math.log10(s / S.frames / (k1 - k0 + 1) + 1e-20);
  }

  // ---- the app's bridge, over the engine: app/ui/index.html runs on it unchanged
  function bridge(engine, hooks) {
    hooks = hooks || {};
    const ls = {};
    const emit = (ev, payload) => (ls[ev] || []).forEach(fn => fn(payload));
    const done = (id, result) => setTimeout(() => emit('__juce__complete', { promiseId: id, result }), 0);
    let files = [], selId = null, posTimer = null, played = new Set();
    const cta = why => { if (hooks.cta) hooks.cta(why); };
    const track = (name, props) => { if (hooks.track) hooks.track(name, props); };
    const listFiles = () => files.map(f => Object.assign({}, f, { selected: f.id === selId }));
    const selected = () => {
      const ex = engine.ex;
      emit('selected', { id: ex.id, name: ex.name, seconds: ex.seconds, state: 'ready', peaksBefore: engine.peaksBefore(), parts: engine.flags(engine.variant).parts,
        mode: engine.v().mode, bandwidthHz: engine.v().bandwidthHz, steps: engine.steps(), channels: engine.channels(), highsApply: engine.v().chain.includes('highs') });
      emit('afterPeaks', { id: ex.id, peaks: engine.peaksAfter() });
      emit('status', { id: ex.id, step: 'done', fraction: 1 });
    };
    const startPos = () => {
      if (posTimer) return;
      posTimer = setInterval(() => {
        if (!engine.ex) return;
        engine.tick();
        emit('position', { seconds: engine.position(), playing: engine.playing, levels: engine.levels() });
      }, 50);
    };
    async function choose(id) {
      selId = id;
      const ex = engine.examples().find(e => e.id === id);
      const f = files.find(x => x.id === id);
      if (![...engine.filesOf(ex)].every(x => engine.buffers.has(x))) {
        f.state = 'working'; f.step = 'Loading'; f.progress = 0;
        emit('files', listFiles());
        emit('selected', { id, name: ex.name, seconds: ex.seconds, state: 'working', peaksBefore: [], parts: ex.parts, steps: { quality: 'best', separate: true, clean: true, studio: false, highs: false }, channels: [] });
        const t0 = performance.now();
        await engine.load(id, p => {
          const eta = p > 0.1 ? (performance.now() - t0) / 1000 / p * (1 - p) : -1;
          f.progress = p; f.eta = eta; emit('status', { id, step: 'Loading', fraction: p, eta }); emit('files', listFiles());
        });
        f.state = 'ready'; f.step = '';
      }
      if (selId !== id) return;
      engine.select(ex, 'base');
      emit('files', listFiles());
      selected();
      emit('position', { seconds: engine.position(), playing: engine.playing, levels: engine.levels() });
      track('demo_example', { example: id });
    }
    const handlers = {
      select: id => choose(id),
      transport: async (what, s) => {
        if (what === 'play') { await engine.unlock(); engine.play(); if (!played.has(engine.ex.id)) { played.add(engine.ex.id); track('demo_played', { example: engine.ex.id, after: engine.showAfter }); } }
        else if (what === 'pause') engine.pause();
        else if (what === 'seek') engine.seek(+s);
      },
      setAfter: a => { engine.setAfter(a); track('demo_ab', { example: engine.ex.id, after: !!a }); },
      setChannel: (name, patch) => { engine.setChannel(name, patch); if ('gainDb' in patch) emit('afterPeaks', { id: engine.ex.id, peaks: engine.peaksAfter() }); track('demo_fader', { example: engine.ex.id, part: name }); },
      setEq: (name, patch) => { engine.setChannel(name, patch); track('demo_eq', { example: engine.ex.id, part: name }); },
      eqSpectrum: name => engine.spectrum(name),
      resetMixer: () => { engine.resetMixer(); selected(); },
      setSteps: st => {
        const cur = engine.flags(engine.variant);
        if (st.quality !== cur.quality) { emit('notice', cur.quality === 'b'
          ? 'The demo plays this recording on separator B, as speech. Best, Fast and separator A are in the app, on your own files.'
          : 'The demo plays Best. Fast and separator B are in the app, on your own files.'); selected(); return; }
        if (!st.separate) { emit('notice', 'In the app this plays the file without separating it. The demo keeps its parts.'); selected(); return; }
        if (!!st.highs !== cur.highs) { emit('notice', 'Restore highs acts on a voice whose top a phone call or a codec cut off (at 8 or 12 kHz). The app left it off for this file.'); selected(); return; }
        const k = engine.find({ parts: cur.parts, quality: cur.quality, clean: st.clean, studio: st.studio });
        if (k) { engine.setVariant(k); selected(); track('demo_step', { example: engine.ex.id, variant: k }); }
        else { emit('notice', 'The demo has this file ready in fewer versions. In the app, every switch re-processes your own file in seconds.'); selected(); }
      },
      setParts: parts => {
        const cur = engine.flags(engine.variant), k = engine.find({ parts, clean: cur.clean, studio: cur.studio }) || engine.find({ parts, clean: true, studio: false }) || engine.find({ parts, clean: true, studio: true });
        if (k) { engine.setVariant(k); selected(); track('demo_parts', { example: engine.ex.id, parts }); }
        else { emit('notice', parts === 'instruments' ? 'Instruments is for songs: try On Site Lover.' : 'This one is ready as instruments: Voice is on its own cylinder.'); selected(); }
      },
      chooseFiles: () => cta('own-file'),
      export: () => cta('export'),
      remove: () => emit('notice', 'These are the demo\'s own recordings. Your files go in the app: free up to a minute.'),
      setChecked: () => undefined,
      licence: what => (what === 'state' ? { kind: 'free', exportsLeft: 3, machine: 'Demo', buyUrl: hooks.buyUrl || '/apps/audioctor.html#pricing' } : (cta('licence'), undefined)),
      openUrl: url => cta('url:' + url),
    };
    const backend = {
      addEventListener: (ev, fn) => { (ls[ev] = ls[ev] || []).push(fn); },
      emitEvent: (ev, msg) => {
        if (ev !== '__juce__invoke') return;
        const h = handlers[msg.name];
        Promise.resolve(h ? h(...(msg.params || [])) : undefined).then(r => done(msg.resultId, r), e => { emit('error', String(e && e.message || e)); done(msg.resultId, undefined); });
      },
    };
    backend.start = async (first) => {
      const list = await engine.init();
      files = list.map(e => ({ id: e.id, name: e.name, seconds: e.seconds, state: 'waiting', checked: false }));
      emit('files', listFiles());
      startPos();
      await choose(first && list.some(e => e.id === first) ? first : list[0].id);
    };
    backend.choose = choose;
    return backend;
  }

  window.AudioctorDemo = { Engine, bridge };
})();
