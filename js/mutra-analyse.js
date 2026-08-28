/* ═══════════ Mutra — read what you can off the file ═══════════

   An upload form asks for tempo, key, whether anybody sings, and a title. Three
   of those are in the audio and the fourth is in the filename, so asking a
   person to type them is asking them to do arithmetic a computer is better at.

   Everything here is a SUGGESTION and says so. Tempo and key detection are
   genuinely hard — a half-time groove reads as 70 or 140 depending on what you
   count, and a modal piece has no single right answer — so every field arrives
   pre-filled and editable, with a note saying it was measured rather than
   stated. The one thing worse than an empty field is a wrong one that looks
   authoritative.

   Runs entirely in the browser on a decoded AudioBuffer. Nothing is uploaded to
   be analysed, so a 90MB master is read once, locally, before anything crosses
   the network. */
(function () {
  const PROFILES = {
    // Krumhansl-Schmuckler key profiles: how strongly each scale degree tends
    // to appear in major and minor music. Correlating a track's pitch-class
    // histogram against all 24 rotations is the standard approach and is good
    // enough to be a suggestion.
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  };
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

  function correlate(hist, profile) {
    const h = mean(hist), p = mean(profile);
    let num = 0, dh = 0, dp = 0;
    for (let i = 0; i < 12; i++) {
      const a = hist[i] - h, b = profile[i] - p;
      num += a * b; dh += a * a; dp += b * b;
    }
    return num / (Math.sqrt(dh * dp) || 1);
  }

  /** Pitch-class histogram from a coarse constant-Q-ish bank of band energies. */
  function chroma(buf) {
    const sr = buf.sampleRate;
    const data = buf.getChannelData(0);
    const N = 4096;
    const hist = new Float64Array(12);
    // Goertzel per semitone across four octaves — far cheaper than a full CQT
    // and all that is needed for a histogram.
    const freqs = [];
    for (let midi = 36; midi <= 84; midi++) freqs.push({ f: 440 * Math.pow(2, (midi - 69) / 12), pc: midi % 12 });

    const hop = Math.max(N, Math.floor(data.length / 60));   // ~60 windows over the track
    for (let start = 0; start + N < data.length; start += hop) {
      for (const { f, pc } of freqs) {
        const k = (2 * Math.PI * f) / sr;
        const c = 2 * Math.cos(k);
        let s0 = 0, s1 = 0, s2 = 0;
        for (let n = 0; n < N; n++) { s0 = data[start + n] + c * s1 - s2; s2 = s1; s1 = s0; }
        hist[pc] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
      }
    }
    const max = Math.max(...hist) || 1;
    return Array.from(hist, (x) => x / max);
  }

  function detectKey(buf) {
    const h = chroma(buf);
    let best = { score: -2, key: '', scale: '' };
    for (let rot = 0; rot < 12; rot++) {
      const shifted = h.slice(rot).concat(h.slice(0, rot));
      for (const scale of ['major', 'minor']) {
        const score = correlate(shifted, PROFILES[scale]);
        if (score > best.score) best = { score, key: NOTES[rot], scale };
      }
    }
    // Below this the histogram is too flat to mean anything — percussion,
    // sound design, a noise bed. Better to offer nothing than a coin toss.
    return best.score < 0.55 ? null : { key: best.key, scale: best.scale, confidence: best.score };
  }

  /**
   * Tempo by onset autocorrelation.
   *
   * Reported alongside its half and double, because those are the same groove
   * counted differently and the person who made the track knows which they
   * meant. Offering 70 when they think in 140 looks broken; offering both
   * looks like it understands music.
   */
  function detectBpm(buf) {
    const sr = buf.sampleRate;
    const d = buf.getChannelData(0);
    const win = Math.floor(sr * 0.02);                       // 20ms energy envelope
    const env = new Float64Array(Math.floor(d.length / win));
    for (let i = 0; i < env.length; i++) {
      let s = 0;
      for (let j = 0; j < win; j++) s += Math.abs(d[i * win + j] || 0);
      env[i] = s / win;
    }
    // Onset strength: positive change only. A beat is where energy arrives.
    const on = new Float64Array(env.length);
    for (let i = 1; i < env.length; i++) on[i] = Math.max(0, env[i] - env[i - 1]);

    /* Mean-centre before correlating. Without this every lag scores roughly
       mean-squared times the overlap, the DC term swamps the actual periodicity,
       and the winner is decided by how many terms each lag happens to have —
       which is why this returned the same tempo for every track it was given. */
    const mu = mean(Array.from(on));
    const c = new Float64Array(on.length);
    for (let i = 0; i < on.length; i++) c[i] = on[i] - mu;

    const fps = sr / win;
    const lagFor = (bpm) => Math.round((60 / bpm) * fps);
    let best = { bpm: 0, score: -Infinity };
    for (let bpm = 60; bpm <= 200; bpm += 0.5) {
      const lag = lagFor(bpm);
      if (lag < 2 || lag >= c.length) continue;
      let num = 0, e1 = 0, e2 = 0;
      for (let i = 0; i + lag < c.length; i++) {
        num += c[i] * c[i + lag]; e1 += c[i] * c[i]; e2 += c[i + lag] * c[i + lag];
      }
      // Normalised correlation, so lags are compared on shape rather than on
      // how much signal happens to sit under them.
      let score = num / (Math.sqrt(e1 * e2) || 1);
      /* A gentle preference for the range people actually count in. Octave
         errors are the classic failure here, and without a prior the detector
         will happily report 62 for a 124 track because half-time correlates
         just as well. */
      score *= Math.exp(-0.5 * Math.pow(Math.log(bpm / 120) / 0.55, 2));
      if (score > best.score) best = { bpm, score };
    }
    if (!best.bpm) return null;
    const round = (n) => Math.round(n);
    const alts = [round(best.bpm / 2), round(best.bpm), round(best.bpm * 2)]
      .filter((n) => n >= 50 && n <= 220);
    return { bpm: round(best.bpm), alternatives: [...new Set(alts)] };
  }

  /**
   * Is anybody singing?
   *
   * A voice lives in a narrow band and moves; a synth pad in the same band does
   * not. So this looks at how much energy sits in 300–3400Hz AND how much that
   * band fluctuates — a sustained pad scores high on the first and low on the
   * second. Deliberately conservative: it returns "probably instrumental" far
   * more readily than "vocals", because a wrongly-flagged instrumental is a
   * track that turns up in a search for songs and wastes somebody's time.
   */
  function detectVocals(buf) {
    const sr = buf.sampleRate;
    const d = buf.getChannelData(0);
    const N = 2048, hop = N;
    const bands = [];
    for (let s = 0; s + N < d.length; s += hop * 8) {
      let voice = 0, total = 0;
      for (let f = 100; f < 6000; f += 100) {
        const k = (2 * Math.PI * f) / sr;
        const c = 2 * Math.cos(k);
        let s1 = 0, s2 = 0, s0 = 0;
        for (let n = 0; n < N; n++) { s0 = d[s + n] + c * s1 - s2; s2 = s1; s1 = s0; }
        const mag = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
        total += mag;
        if (f >= 300 && f <= 3400) voice += mag;
      }
      if (total > 0) bands.push(voice / total);
    }
    if (bands.length < 4) return null;
    const m = mean(bands);
    const variance = mean(bands.map((x) => (x - m) * (x - m)));
    const moves = Math.sqrt(variance);
    // Both conditions, not either: presence in the band and movement within it.
    const vocals = m > 0.42 && moves > 0.035;
    return { vocal: vocals ? 'Vocals' : 'Instrumental',
             confidence: vocals ? Math.min(1, (m - 0.42) * 6 + moves * 8) : Math.min(1, (0.42 - m) * 6 + 0.3) };
  }

  /* Words that mean "this is a rendering of a track" rather than part of its
     name. A parenthetical is dropped only if it CONTAINS one of these — an
     upload called "Shorditch 14 (Instrumental)" must keep its bracket, because
     that is a version somebody will search for. */
  const NOISE = /\b(mstr\d*|master(ed)?|mix(down)?\d*|final|fix(ed)?|fadeout|bounce|render|export|wav|aiff?|mp3|ref|rough|comp|v\d+|r\d+|take\d*|\d{2}bit|4[48]|96|16|24|32)\b/i;

  /** "03 Learn To Say No Mix 3 (R2) (MC MSTR3) 44 24" → "Learn To Say No" */
  function titleFrom(filename) {
    let t = String(filename || '').replace(/\.[a-z0-9]+$/i, '');
    t = t.replace(/[_]+/g, ' ');                                // before any word test
    t = t.replace(/^[\s\-]*\d{1,3}[\s\-.]+/, '');              // leading track number
    // Drop only the brackets that are production notes, keeping real ones.
    t = t.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (m, a, b) =>
      NOISE.test(a || b || '') ? ' ' : m);
    t = t.replace(/\b(4[48]|96)\s?(16|24|32)\b/gi, ' ');       // "44 24" sample rate + depth
    // A noise word takes any number trailing it: "Mix 3", "Master 2".
    t = t.replace(/\b(mstr\d*|master(?:ed)?|mix(?:down)?|final|fix(?:ed)?|fadeout|bounce|render|export|ref|rough|comp|take)\b\s*\d*/gi, ' ');
    t = t.replace(/\b(v|r)\d+\b/gi, ' ');
    t = t.replace(/\s{2,}/g, ' ').replace(/\s*-\s*$/, '').trim();
    t = t.replace(/[\s\-–—,]+$/, '').trim();
    if (!t) return '';
    /* Title Case word by word, but anything already all-caps stays — an
       acronym is not a typo — and so does anything with internal capitals,
       which is somebody's deliberate styling. */
    return t.split(' ').map((w) => {
      /* Split off leading and trailing punctuation first. "(Instrumental)"
         was being title-cased from the bracket, so the I never got touched
         and the word came back lowercase. */
      const m = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/.exec(w);
      const [, pre, core, post] = m;
      if (!core) return w;
      if (/^[A-Z0-9&'.]{2,}$/.test(core)) return w;          // acronym, leave it
      if (/[a-z][A-Z]/.test(core)) return w;                  // deliberate styling
      return pre + core.charAt(0).toUpperCase() + core.slice(1).toLowerCase() + post;
    }).join(' ');
  }

  /** Streaming links pasted anywhere in a blob of text. */
  const LINK_PATTERNS = [
    [/https?:\/\/open\.spotify\.com\/[^\s"'<>]+/gi, 'Spotify'],
    [/https?:\/\/(?:music\.)?apple\.com\/[^\s"'<>]+/gi, 'Apple Music'],
    [/https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+|https?:\/\/youtu\.be\/[^\s"'<>]+/gi, 'YouTube'],
    [/https?:\/\/(?:www\.)?soundcloud\.com\/[^\s"'<>]+/gi, 'SoundCloud'],
    [/https?:\/\/(?:www\.)?bandcamp\.com\/[^\s"'<>]+|https?:\/\/[a-z0-9-]+\.bandcamp\.com\/[^\s"'<>]*/gi, 'Bandcamp'],
    [/https?:\/\/(?:www\.)?deezer\.com\/[^\s"'<>]+/gi, 'Deezer'],
    [/https?:\/\/(?:www\.)?tidal\.com\/[^\s"'<>]+/gi, 'Tidal'],
    [/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi, 'Instagram'],
  ];

  function findLinks(text) {
    const out = [];
    for (const [re, platform] of LINK_PATTERNS) {
      for (const m of String(text || '').matchAll(re)) {
        if (!out.some((x) => x.url === m[0])) out.push({ platform, url: m[0] });
      }
    }
    return out.slice(0, 12);
  }

  /**
   * Everything readable from one file.
   *
   * Decoding is the expensive step and happens once. Analysis runs on a
   * downmixed, downsampled copy — key and tempo do not need 48kHz stereo, and
   * at full rate a 5-minute track takes long enough that people assume it has
   * hung.
   */
  async function analyse(file, onProgress) {
    const step = (s) => { try { onProgress && onProgress(s); } catch {} };
    step('Reading the file…');
    const bytes = await file.arrayBuffer();

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    step('Decoding audio…');
    const buf = await ctx.decodeAudioData(bytes.slice(0));

    const duration = Math.round(buf.duration);

    // Downsample to 11025 mono: enough for everything measured here, roughly
    // sixteen times less work than the original.
    step('Measuring…');
    const target = 11025;
    const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
      1, Math.ceil(buf.duration * target), target);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const small = await off.startRendering();
    try { ctx.close(); } catch {}

    step('Tempo…');
    const bpm = detectBpm(small);
    step('Key…');
    const key = detectKey(small);
    step('Voice…');
    const vocal = detectVocals(small);

    return {
      duration,
      title: titleFrom(file.name),
      bpm: bpm ? bpm.bpm : null,
      bpmAlternatives: bpm ? bpm.alternatives : [],
      key: key ? key.key : null,
      scale: key ? key.scale : null,
      keyConfidence: key ? key.confidence : 0,
      vocal: vocal ? vocal.vocal : null,
      vocalConfidence: vocal ? vocal.confidence : 0,
    };
  }

  window.mutraAnalyse = { analyse, titleFrom, findLinks, detectBpm, detectKey, detectVocals };
})();
