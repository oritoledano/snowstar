/* ═══════════ Mutra — agent search ═══════════

   Describe the job, get tracks. "Bar mitzvah entrance, big, celebratory" or
   "unsettling titles for a true-crime podcast, sits under narration".

   TWO HALVES, ON PURPOSE.

   Understanding the brief is a model's job and happens server-side, at
   /api/agent: it maps a sentence onto the tags the catalogue actually uses,
   and its answer is intersected against the real vocabulary before anyone
   trusts it. This replaced a hand-written dictionary that could only ever
   recognise words somebody had thought to type into it — it returned nothing
   at all for "sneaker drop, street, confident, hard beat", and answered an
   unsettling true-crime brief with EPIC FAST DRUMS.

   Choosing the tracks stays here, deterministic and inspectable, because a
   result you cannot see the reasoning for is a result you cannot correct.

   The dictionary below survives as the FALLBACK. If the model is unreachable,
   "sad piano" must still work, and the panel says plainly that it has dropped
   to keyword matching rather than pretending to have understood.

   PINPOINTING is the second half. Every result set comes back with the facets
   it matched on and the ones it could still narrow by, as chips — so the
   follow-up is a click rather than a re-typed sentence. */
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Everyday words that mean a catalogue term. The catalogue says "Chill /
     Lo-Fi"; nobody types that. Each entry is [what people say, what we store].
     Kept in step with the mood/characteristic split — a word like "dark" is a
     characteristic now, not a mood. */
  const SYNONYMS = {
    genres: {
      'lo-fi': 'Chill / Lo-Fi', lofi: 'Chill / Lo-Fi', chillhop: 'Chill / Lo-Fi',
      orchestral: 'Classical', orchestra: 'Classical',
      trailer: 'Cinematic', film: 'Cinematic', score: 'Cinematic',
      edm: 'Dance', club: 'Dance', house: 'House & Techno', techno: 'House & Techno',
      electro: 'Electronic', synthwave: 'Electronic', ambient: 'Ambient',
      acoustic: 'Folk & Acoustic', folk: 'Folk & Acoustic',
      funk: 'Funk & Soul', soul: 'Funk & Soul', motown: 'Funk & Soul',
      rap: 'Hip Hop', beats: 'Hip Hop', trap: 'Trap',
      rock: 'Rock', indie: 'Indie', pop: 'Pop', jazz: 'Jazz & Blues', blues: 'Jazz & Blues',
      metal: 'Metal', world: 'World', latin: 'Latin', chiptune: 'Retro 8-Bit',
    },
    moods: {
      happy: 'Happy', joyful: 'Happy', cheerful: 'Happy',
      fun: 'Fun', celebratory: 'Fun', festive: 'Fun', party: 'Fun',
      sad: 'Sad', melancholy: 'Sad', sombre: 'Sad', somber: 'Sad', mournful: 'Sad',
      calm: 'Calm', gentle: 'Calm', peaceful: 'Calm', restrained: 'Calm',
      chill: 'Chill', relaxed: 'Chill', mellow: 'Chill',
      tense: 'Tense', anxious: 'Tense', urgent: 'Tense',
      suspenseful: 'Suspenseful', suspense: 'Suspenseful', unsettling: 'Suspenseful',
      ominous: 'Suspenseful', creepy: 'Scary', scary: 'Scary', horror: 'Scary',
      uplifting: 'Uplifting', positive: 'Uplifting', triumphant: 'Uplifting',
      hopeful: 'Hopeful', optimistic: 'Hopeful', warm: 'Hopeful',
      inspiring: 'Inspiring', motivational: 'Inspiring', aspirational: 'Inspiring',
      reflective: 'Reflective', emotional: 'Reflective', thoughtful: 'Reflective',
      heartfelt: 'Reflective', touching: 'Reflective', nostalgic: 'Reflective',
      romantic: 'Romantic', love: 'Romantic', tender: 'Romantic',
      playful: 'Playful', whimsical: 'Playful', quirky: 'Quirky', odd: 'Quirky',
      angry: 'Angry', furious: 'Angry',
    },
    characteristics: {
      dark: 'Dark', moody: 'Dark', sinister: 'Dark',
      epic: 'Epic', huge: 'Epic', cinematic: 'Epic', big: 'Epic',
      aggressive: 'Aggressive', heavy: 'Aggressive', hard: 'Aggressive',
      dreamy: 'Dreamy', ethereal: 'Dreamy', floaty: 'Dreamy',
      atmospheric: 'Atmospheric', ambient: 'Atmospheric', textural: 'Atmospheric',
      minimal: 'Minimal', sparse: 'Minimal', simple: 'Minimal', understated: 'Minimal',
      building: 'Building', builds: 'Building', rising: 'Building', swelling: 'Building',
      soaring: 'Soaring', sweeping: 'Soaring',
      dancey: 'Dancey', danceable: 'Dancey', groovy: 'Dancey',
      upbeat: 'Upbeat', bouncy: 'Upbeat', energetic: 'Upbeat',
      intense: 'Intense', driving: 'Intense', relentless: 'Intense',
      chaotic: 'Chaotic', frantic: 'Chaotic', messy: 'Chaotic',
      droning: 'Droning', drone: 'Droning', static: 'Droning',
      dynamic: 'Dynamic', retro: 'Retro', vintage: 'Retro', throwback: 'Retro',
      soulful: 'Soulful', sophisticated: 'Sophisticated', classy: 'Sophisticated',
      elegant: 'Sophisticated', beautiful: 'Beautiful', pretty: 'Beautiful',
      cruising: 'Cruising', steady: 'Cruising',
      rebellious: 'Rebellious', childlike: 'Childlike', innocent: 'Childlike',
    },
    instruments: {
      piano: 'Piano', keys: 'Piano', rhodes: 'Rhodes',
      guitar: 'Guitar', banjo: 'Banjo', ukulele: 'Ukulele',
      drums: 'Drums', percussion: 'Percussion', bass: 'Bass',
      synth: 'Synth', synths: 'Synth', organ: 'Organ', samples: 'Samples',
      strings: 'Strings', violin: 'Strings', cello: 'Strings',
      choir: 'Choir', flute: 'Flute', brass: 'Horns', horns: 'Horns', sax: 'Horns',
      harmonica: 'Harmonica', accordion: 'Accordion', whistling: 'Whistling',
      woodwinds: 'Woodwinds', pads: 'Ambient Tones', textures: 'Ambient Tones',
    },
  };

  /* Occasions people describe instead of naming a mood. A wedding montage is
     not a genre, but it is a very good predictor of several. */
  const OCCASIONS = {
    wedding:      { moods: ['Romantic', 'Hopeful'], characteristics: ['Beautiful'] },
    montage:      { moods: ['Uplifting', 'Inspiring'], characteristics: ['Building'] },
    documentary:  { moods: ['Reflective'], characteristics: ['Atmospheric'], genres: ['Cinematic'] },
    corporate:    { moods: ['Inspiring', 'Hopeful'], characteristics: ['Upbeat'] },
    advert:       { moods: ['Uplifting', 'Happy'] },
    ad:           { moods: ['Uplifting', 'Happy'] },
    commercial:   { moods: ['Uplifting', 'Happy'] },
    vlog:         { moods: ['Chill', 'Happy'], genres: ['Chill / Lo-Fi'] },
    podcast:      { moods: ['Calm'], characteristics: ['Minimal'], vocal: 'Instrumental' },
    workout:      { moods: ['Fun'], characteristics: ['Intense', 'Dancey'], bpm: [125, 175] },
    gaming:       { moods: ['Tense'], characteristics: ['Intense'] },
    fashion:      { characteristics: ['Sophisticated', 'Dancey'], genres: ['Electronic'] },
    travel:       { moods: ['Uplifting'], characteristics: ['Soaring'] },
    trailer:      { moods: ['Suspenseful'], characteristics: ['Epic', 'Building'], genres: ['Cinematic'] },
    'time lapse': { characteristics: ['Dreamy'], bpm: [100, 140] },
    timelapse:    { characteristics: ['Dreamy'], bpm: [100, 140] },
  };

  const TEMPO = [
    [/\b(very slow|slow|slowly|sparse|drifting)\b/, [0, 85]],
    [/\b(mid ?tempo|medium|moderate|steady)\b/, [85, 115]],
    [/\b(upbeat|fast|driving|energetic|uptempo)\b/, [115, 145]],
    [/\b(very fast|frantic|racing|intense)\b/, [145, 300]],
  ];

  const norm = (s) => String(s || '').toLowerCase();

  /**
   * THE PARSER — the one place a language model would go.
   *
   * Turns a sentence into the facets the catalogue actually stores, plus what
   * it could not place. Returning the misses is deliberate: "I don't know what
   * 'shoegaze' means here" is a far better answer than silently ignoring the
   * only word that mattered.
   */
  function interpret(prompt) {
    const q = norm(prompt);
    const want = { genres: [], moods: [], characteristics: [], instruments: [],
                   not: [], bpm: null, vocal: null, unmatched: [] };

    // negation first, so "no vocals" does not also read as "vocals"
    const negations = [...q.matchAll(/\b(?:no|not|without|avoid|minus)\s+([a-z\- ]{2,20})/g)]
      .map((m) => m[1].trim());
    for (const n of negations) {
      if (/vocal|sing|lyric|voice/.test(n)) want.vocal = 'Instrumental';
      else want.not.push(n.split(/\s+/)[0]);
    }
    const stripped = q.replace(/\b(?:no|not|without|avoid|minus)\s+[a-z\- ]{2,20}/g, ' ');

    if (/\b(instrumental|no words|wordless)\b/.test(stripped)) want.vocal = 'Instrumental';
    else if (/\b(vocals?|sung|singer|lyrics|female voice|male voice)\b/.test(stripped)) want.vocal = 'Vocals';

    const bpmExact = stripped.match(/\b(\d{2,3})\s*bpm\b/);
    if (bpmExact) {
      const n = Number(bpmExact[1]);
      want.bpm = [n - 8, n + 8];
    } else {
      for (const [re, range] of TEMPO) {
        const m = stripped.match(re);
        if (m) { want.bpm = range; want._tempoWord = m[0]; break; }
      }
    }

    /* Word boundaries, not substrings. "ad" lives inside "sad", so a
       substring test turned "sad piano" into an advert brief and returned
       Happy and Uplifting — the exact opposite of what was asked for. */
    const hasWord = (w) => new RegExp('\\b' + w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b')
      .test(stripped);
    const usedWords = [];
    for (const [word, cfg] of Object.entries(OCCASIONS)) {
      if (!hasWord(word)) continue;
      usedWords.push(...word.split(/\s+/));
      (cfg.moods || []).forEach((m) => want.moods.push(m));
      (cfg.genres || []).forEach((g) => want.genres.push(g));
      (cfg.characteristics || []).forEach((c) => want.characteristics.push(c));
      if (cfg.vocal && !want.vocal) want.vocal = cfg.vocal;
      if (cfg.bpm && !want.bpm) want.bpm = cfg.bpm;
    }

    // the catalogue's own vocabulary wins over any synonym
    const vocab = catalogueVocab();
    for (const field of ['genres', 'moods', 'characteristics', 'instruments']) {
      for (const term of vocab[field]) {
        if (stripped.includes(norm(term))) want[field].push(term);
      }
      for (const [say, mean] of Object.entries(SYNONYMS[field])) {
        if (hasWord(say) && vocab[field].includes(mean)) {
          want[field].push(mean);
          usedWords.push(say);          // it worked; do not call it ignored
        }
      }
    }

    ['genres', 'moods', 'characteristics', 'instruments'].forEach((f) => { want[f] = [...new Set(want[f])]; });

    // words we could not place, so the UI can admit it rather than guess
    const STOP = new Set(('a an the and or for with some something track music song '
      + 'need want looking find me my i of to in on that this like sounds sound very '
      + 'really bit quite more less please').split(' '));
    /* Everything that contributed: the catalogue terms themselves, the synonym
       and occasion words that reached them, and the tempo word. Reporting a
       word as ignored when it silently steered the whole result is worse than
       saying nothing — it teaches the user to distrust a search that worked. */
    const placed = new Set([...want.genres, ...want.moods, ...want.characteristics, ...want.instruments]
      .flatMap((t) => norm(t).split(/[^a-z]+/)));
    usedWords.forEach((w) => norm(w).split(/[^a-z]+/).forEach((x) => x && placed.add(x)));
    if (want._tempoWord) norm(want._tempoWord).split(/[^a-z]+/).forEach((x) => x && placed.add(x));
    delete want._tempoWord;
    want.unmatched = [...new Set(stripped.split(/[^a-z0-9]+/).filter(Boolean))]
      .filter((w) => w.length > 2 && !STOP.has(w) && !placed.has(w)
        && !/^\d+$/.test(w) && !/bpm|instrumental|vocals?/.test(w))
      .slice(0, 4);

    return want;
  }

  let _vocab = null;
  function catalogueVocab() {
    if (_vocab) return _vocab;
    const all = (window.mutraCatalog && mutraCatalog.all()) || [];
    const grab = (f) => [...new Set(all.flatMap((t) => t[f] || []))];
    _vocab = { genres: grab('genres'), moods: grab('moods'),
               characteristics: grab('characteristics'), instruments: grab('instruments') };
    return _vocab;
  }

  /**
   * Score every track against the parsed intent.
   *
   * Weighted rather than filtered: a strict AND across five facets returns
   * nothing on a 374-track catalogue, and "no results" is the one answer a
   * search must almost never give. A mood is worth more than an instrument
   * because it is what people are actually choosing on.
   */
  function rank(want) {
    const all = (window.mutraCatalog && mutraCatalog.all()) || [];
    /* Characteristics carry nearly as much weight as mood now: they are what
       separates two tracks that share a mood, which was the whole reason for
       splitting the axis. */
    const W = { mood: 2.6, characteristic: 2.4, genre: 2, instrument: 1,
                bpm: 1.5, vocal: 1.5, keyword: 1 };
    const out = [];
    const avoid = want.avoid || { moods: [], genres: [] };
    const overlap = (a, b) => (a || []).filter((x) => (b || []).includes(x)).length;

    for (const t of all) {
      if (t.hidden) continue;

      /* Proportional, not additive. The old version gave a track full mood
         credit for matching ONE of three requested moods, so "Aggressive,
         Happy, Uplifting" scored the same on a track that was merely Happy as
         on one that was all three — and with sets that broad, 341 of 376
         tracks came back as matches. Sharing the weight across what was asked
         for makes a partial match read as a partial match. */
      const mood = want.moods.length ? overlap(t.moods, want.moods) / want.moods.length : null;
      const genre = want.genres.length ? overlap(t.genres, want.genres) / want.genres.length : null;
      const chr = (want.characteristics || []).length
        ? overlap(t.characteristics, want.characteristics) / want.characteristics.length : null;
      const inst = want.instruments.length
        ? overlap(t.instruments, want.instruments) / want.instruments.length : null;

      /* Asking for instrumental is a requirement, not a preference: music that
         sits under narration cannot sing. Score it down and it still surfaces;
         drop it and the brief is honoured. */
      if (want.vocal === 'Instrumental' && t.vocal === 'Vocals') continue;

      // an explicit "no X" from the dictionary path is a veto, not a penalty
      const bag = norm([...(t.moods || []), ...(t.genres || []), ...(t.instruments || [])].join(' '));
      if ((want.not || []).some((n) => n.length > 2 && bag.includes(n))) continue;

      let score = 0;
      if (mood != null) score += W.mood * mood;
      if (genre != null) score += W.genre * genre;
      if (chr != null) score += W.characteristic * chr;
      if (inst != null) score += W.instrument * inst;

      if (want.vocal === 'Vocals') score += t.vocal === 'Vocals' ? W.vocal : -W.vocal;
      if (want.bpm && t.bpm) {
        score += (t.bpm >= want.bpm[0] && t.bpm <= want.bpm[1])
          ? W.bpm
          : -Math.min(1.5, Math.abs(t.bpm - (want.bpm[0] + want.bpm[1]) / 2) / 45);
      }

      /* Words no tag can carry — a theme, a place, a reference. A Star Trek
         wedding yields "space". A bonus on top of a real match, never a way in
         on its own, or a brief about crime returns everything with crime in
         the title regardless of how it sounds. */
      if (want.keywords && want.keywords.length) {
        const title = norm(t.title + ' ' + (t.artist || ''));
        for (const k of want.keywords) if (title.includes(k)) score += W.keyword;
      }

      // Negative evidence, weighted heavily: being wrong disqualifies faster
      // than being right qualifies.
      score -= 2.2 * overlap(t.moods, avoid.moods);
      score -= 1.8 * overlap(t.characteristics, avoid.characteristics || []);
      score -= 1.4 * overlap(t.genres, avoid.genres);

      /* A floor, and a mood gate. Without them every track sharing one loose
         genre is called a match, which is how a search returns 90% of the
         catalogue and means nothing by it. */
      // The gate now accepts a strong sonic match too — a brief can be all
      // about how something sounds and name no mood at all.
      const gated = want.moods.length && mood === 0
                    && (chr == null || chr === 0) && (genre == null || genre < 0.5);
      if (gated || score < 1.4) continue;

      out.push({ t, score });
    }

    out.sort((a, b) => b.score - a.score || (b.t.bpm || 0) - (a.t.bpm || 0));
    return out;
  }

  /* ── UI ───────────────────────────────────────────────────────────────── */

  let el = null, lastWant = null, lastHow = 'ai';

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'ag-dock';
    el.hidden = true;
    el.innerHTML = `
      <div class="ag-card" role="dialog" aria-label="Describe what you need">
        <button class="ag-close" aria-label="Close">&times;</button>
        <h3 class="ag-h">Tell me about your project</h3>
        <p class="ag-sub">A sentence or two about the film, the brand and the feeling.
          Write it the way you would say it to a composer — the situation is more
          use to me than a list of adjectives.</p>
        <div class="ag-inwrap">
          <textarea class="ag-in" rows="4" placeholder="Opening titles for a true-crime podcast. Unsettling, sparse, builds slowly — and it sits under narration, so nothing that sings."></textarea>
          <button class="ag-go" type="button">Find</button>
        </div>
        <div class="ag-examples">
          ${['Bar mitzvah entrance — big, celebratory, everyone on their feet',
             'Bank commercial. Trustworthy and modern, nothing cheesy',
             '30s sneaker drop for Instagram. Street, confident, hard beat',
             'Hospital fundraising film. Soft bed, nothing that pulls focus'].map((x) =>
            `<button type="button" class="ag-eg">${esc(x)}</button>`).join('')}
        </div>
        <div class="ag-out"></div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.ag-close').addEventListener('click', close);

    addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && !el.hidden) close(); });
    el.querySelector('.ag-go').addEventListener('click', run);
    el.querySelector('.ag-in').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); }
    });
    el.querySelectorAll('.ag-eg').forEach((b) => b.addEventListener('click', () => {
      el.querySelector('.ag-in').value = b.textContent;
      run();
    }));
    return el;
  }

  /**
   * Ask the model first, fall back to the dictionary.
   *
   * The dictionary stays because it is the difference between a degraded
   * search and no search at all: if Workers AI is down, rate-limited or slow,
   * "sad piano" must still work. But it is now the fallback rather than the
   * plan — it could only ever recognise words someone had written into it, and
   * the briefs people actually type are an open set.
   */
  async function run() {
    const prompt = el.querySelector('.ag-in').value.trim();
    if (!prompt) return;
    const out = el.querySelector('.ag-out');
    const go = el.querySelector('.ag-go');
    out.innerHTML = '<p class="ag-read ag-busy">Reading your brief…</p>';
    go.disabled = true;

    let want = null, how = 'ai';
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief: prompt, vocab: catalogueVocab() }),
      });
      const d = await r.json();
      // `not` and `unmatched` are the dictionary's shape; the model does its
      // negation inline, so they are empty here and rank/paint stay unchanged.
      if (d && d.ok && d.want) want = Object.assign({ not: [], unmatched: [] }, d.want);
    } catch (e) { /* offline or blocked — the fallback below covers it */ }

    if (!want) { want = interpret(prompt); how = 'local'; }
    go.disabled = false;
    lastWant = want;
    paint(want, prompt, how);
    if (window.mutraTrack) mutraTrack('agent-search', prompt.slice(0, 80));
  }

  function chip(label, on, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ag-chip' + (on ? ' on' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function paint(want, prompt, how) {
    lastHow = how === undefined ? lastHow : how;
    how = lastHow;
    const ranked = rank(want);
    const out = el.querySelector('.ag-out');
    const top = ranked.slice(0, 12);

    const read = [];
    if (want.keywords && want.keywords.length) read.push(want.keywords.join(', '));
    if (want.moods.length) read.push(want.moods.join(', '));
    if ((want.characteristics || []).length) read.push(want.characteristics.join(', '));
    if (want.genres.length) read.push(want.genres.join(', '));
    if (want.instruments.length) read.push(want.instruments.join(', '));
    if (want.vocal) read.push(want.vocal === 'Instrumental' ? 'no vocals' : 'with vocals');
    if (want.bpm) read.push(`${want.bpm[0]}–${want.bpm[1]} bpm`);

    /* The results land in the catalogue's own list. They used to render into
       a second list inside the panel — the same rows, drawn a lesser way, with
       no player integration, no favourites, no licence button, and a "show all"
       button to escape into the real thing. The panel now only ever says what
       it understood and how to narrow it. */
    if (window.mutraShowSlugs) mutraShowSlugs(ranked.map(({ t }) => t.slug), prompt);

    out.innerHTML = `
      ${want.summary ? `<p class="ag-sum">${esc(want.summary)}</p>` : ''}
      ${read.length
        ? `<p class="ag-read">Looking for <b>${esc(read.join(' · '))}</b></p>`
        : `<p class="ag-read ag-none">Nothing in that I could match to the catalogue.
             Try a mood, a genre, or an occasion — “tense”, “folk”, “wedding”.</p>`}
      ${how === 'local' && read.length
        ? `<p class="ag-miss">Matched on keywords only — the brief reader is unreachable
             right now, so this is a rougher read than usual.</p>` : ''}
      ${(want.unmatched || []).length
        ? `<p class="ag-miss">Ignored: ${esc(want.unmatched.join(', '))} — not something the
             catalogue is tagged for.</p>` : ''}
      <p class="ag-count">${ranked.length
        ? `<b>${ranked.length}</b> track${ranked.length > 1 ? 's' : ''} in the list &rarr;`
        : 'Nothing matched. Loosen one of the chips below.'}</p>
      <div class="ag-refine"></div>`;

    // ── pinpointing: narrow by a click, not by retyping ──
    const refine = out.querySelector('.ag-refine');
    const vocab = catalogueVocab();
    const suggest = (field, chosen) => {
      const counts = {};
      ranked.slice(0, 60).forEach(({ t }) => (t[field] || []).forEach((v) => {
        if (!chosen.includes(v)) counts[v] = (counts[v] || 0) + 1;
      }));
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v);
    };
    [['moods', want.moods], ['genres', want.genres], ['instruments', want.instruments]]
      .forEach(([field, chosen]) => {
        chosen.forEach((v) => refine.appendChild(chip(v, true, () => {
          want[field] = want[field].filter((x) => x !== v);
          paint(want, prompt);
        })));
        if (ranked.length > 12) suggest(field, chosen).forEach((v) =>
          refine.appendChild(chip('+ ' + v, false, () => { want[field].push(v); paint(want, prompt); })));
      });
    if (!want.vocal) refine.appendChild(chip('+ instrumental only', false, () => {
      want.vocal = 'Instrumental'; paint(want, prompt, how);
    }));
    void vocab;

  }

  function open(seed) {
    build();
    el.hidden = false;
    document.body.classList.add('ag-open');
    const inp = el.querySelector('.ag-in');
    if (seed) { inp.value = seed; run(); }
    setTimeout(() => inp.focus(), 40);
  }
  function close() {
    if (!el) return;
    el.hidden = true;
    document.body.classList.remove('ag-open');
    if (window.mutraClearAgent) mutraClearAgent();
  }

  addEventListener('click', (e) => {
    if (e.target.closest('[data-agent]')) { e.preventDefault(); open(); }
  });

  window.mutraAgent = { open, close, interpret, rank };
})();
