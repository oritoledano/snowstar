/* ═══════════ Mutra — agent search ═══════════

   One prompt, one set of results. Type "something warm for a wedding montage,
   no vocals" and get tracks, not a chat.

   WHY THIS IS NOT AN LLM CALL — at least not yet.

   The catalogue's vocabulary is closed and small: 21 genres, 14 moods, 9
   instruments, two vocal states, and a BPM. A language model would spend a
   round trip and a token budget to land back inside that same list, and it
   would sometimes land outside it and return nothing. Matching directly
   against the vocabulary is instant, free, offline, and — the part that
   matters most for search — PREDICTABLE: the same words give the same tracks
   every time, and when it finds nothing it can say precisely which word it
   failed on.

   Where a model genuinely helps is the phrasing the vocabulary cannot reach:
   "like the Stranger Things titles", "for a sad dog food advert". So the
   parser is isolated behind one function, `interpret()`, and a model can be
   dropped in front of it later without touching anything else. The hook is
   marked.

   PINPOINTING is the second half. Every result set comes back with the facets
   it actually matched on and the ones it could still narrow by, as chips — so
   the follow-up is a click rather than a re-typed sentence. */
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Everyday words that mean a catalogue term. The catalogue says "Chill /
     Lo-Fi"; nobody types that. Each entry is [what people say, what we store]. */
  const SYNONYMS = {
    genres: {
      'lo-fi': 'Chill / Lo-Fi', lofi: 'Chill / Lo-Fi', chillhop: 'Chill / Lo-Fi',
      orchestral: 'Classical', orchestra: 'Classical', strings: 'Classical',
      epic: 'Cinematic', trailer: 'Cinematic', film: 'Cinematic', score: 'Cinematic',
      edm: 'Dance', house: 'Dance', techno: 'Dance', club: 'Dance',
      electro: 'Electronic', synthwave: 'Electronic', ambient: 'Ambient',
      acoustic: 'Folk & Acoustic', folk: 'Folk & Acoustic', guitar: 'Folk & Acoustic',
      funk: 'Funk & Soul', soul: 'Funk & Soul', motown: 'Funk & Soul',
      rap: 'Hip Hop', trap: 'Hip Hop', beats: 'Hip Hop',
      rock: 'Rock', indie: 'Indie', pop: 'Pop', jazz: 'Jazz',
      world: 'World', latin: 'World', african: 'World', middleeastern: 'World',
    },
    moods: {
      happy: 'Happy', joyful: 'Happy', cheerful: 'Happy', fun: 'Happy',
      sad: 'Sad', melancholy: 'Sad', sombre: 'Sad', somber: 'Sad',
      calm: 'Chill', relaxed: 'Chill', mellow: 'Chill', laid: 'Chill',
      dark: 'Dark', moody: 'Dark', sinister: 'Dark', ominous: 'Dark',
      tense: 'Tense', suspense: 'Tense', anxious: 'Tense', urgent: 'Tense',
      uplifting: 'Uplifting', hopeful: 'Uplifting', positive: 'Uplifting',
      inspiring: 'Motivational', motivational: 'Motivational', driving: 'Motivational',
      emotional: 'Emotional', touching: 'Emotional', heartfelt: 'Emotional',
      warm: 'Emotional', tender: 'Emotional', romantic: 'Romantic', love: 'Romantic',
      dreamy: 'Dreamy', ethereal: 'Dreamy', floaty: 'Dreamy',
      dramatic: 'Dramatic', cinematic: 'Dramatic',
      party: 'Party', celebration: 'Party', energetic: 'Party',
      aggressive: 'Aggressive', angry: 'Aggressive', heavy: 'Aggressive',
      playful: 'Playful', quirky: 'Playful', whimsical: 'Playful',
    },
    instruments: {
      piano: 'Piano', keys: 'Piano', guitar: 'Guitar', drums: 'Drums',
      percussion: 'Drums', synth: 'Synth', synths: 'Synth',
      strings: 'Strings', violin: 'Strings', cello: 'Strings',
      choir: 'Choir', vocals: 'Vocals', voice: 'Vocals',
      flute: 'Flute', brass: 'Brass', horns: 'Brass', sax: 'Brass',
    },
  };

  /* Occasions people describe instead of naming a mood. A wedding montage is
     not a genre, but it is a very good predictor of several. */
  const OCCASIONS = {
    wedding: { moods: ['Emotional', 'Romantic', 'Uplifting'] },
    montage: { moods: ['Uplifting', 'Motivational'] },
    documentary: { moods: ['Emotional', 'Dramatic'], genres: ['Cinematic'] },
    corporate: { moods: ['Motivational', 'Uplifting'] },
    advert: { moods: ['Uplifting', 'Happy'] },
    ad: { moods: ['Uplifting', 'Happy'] },
    commercial: { moods: ['Uplifting', 'Happy'] },
    vlog: { moods: ['Chill', 'Happy'], genres: ['Chill / Lo-Fi'] },
    podcast: { moods: ['Chill'], vocal: 'Instrumental' },
    workout: { moods: ['Motivational', 'Party'], bpm: [125, 175] },
    gaming: { moods: ['Tense', 'Aggressive'] },
    fashion: { moods: ['Party'], genres: ['Electronic'] },
    travel: { moods: ['Uplifting', 'Dreamy'] },
    trailer: { moods: ['Epic', 'Dramatic'], genres: ['Cinematic'] },
    'time lapse': { moods: ['Dreamy'], bpm: [100, 140] },
    timelapse: { moods: ['Dreamy'], bpm: [100, 140] },
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
    const want = { genres: [], moods: [], instruments: [], not: [], bpm: null,
                   vocal: null, unmatched: [] };

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
      for (const [re, range] of TEMPO) if (re.test(stripped)) { want.bpm = range; break; }
    }

    for (const [word, cfg] of Object.entries(OCCASIONS)) {
      if (!stripped.includes(word)) continue;
      (cfg.moods || []).forEach((m) => want.moods.push(m));
      (cfg.genres || []).forEach((g) => want.genres.push(g));
      if (cfg.vocal && !want.vocal) want.vocal = cfg.vocal;
      if (cfg.bpm && !want.bpm) want.bpm = cfg.bpm;
    }

    // the catalogue's own vocabulary wins over any synonym
    const vocab = catalogueVocab();
    for (const field of ['genres', 'moods', 'instruments']) {
      for (const term of vocab[field]) {
        if (stripped.includes(norm(term))) want[field].push(term);
      }
      for (const [say, mean] of Object.entries(SYNONYMS[field])) {
        if (new RegExp('\\b' + say.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b').test(stripped)
            && vocab[field].includes(mean)) want[field].push(mean);
      }
    }

    ['genres', 'moods', 'instruments'].forEach((f) => { want[f] = [...new Set(want[f])]; });

    // words we could not place, so the UI can admit it rather than guess
    const STOP = new Set(('a an the and or for with some something track music song '
      + 'need want looking find me my i of to in on that this like sounds sound very '
      + 'really bit quite more less please').split(' '));
    const placed = new Set([...want.genres, ...want.moods, ...want.instruments]
      .flatMap((t) => norm(t).split(/[^a-z]+/)));
    Object.keys(OCCASIONS).forEach((o) => { if (stripped.includes(o)) placed.add(o); });
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
    _vocab = { genres: grab('genres'), moods: grab('moods'), instruments: grab('instruments') };
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
    const W = { mood: 3, genre: 2.5, instrument: 1.5, bpm: 2, vocal: 2 };
    const out = [];

    for (const t of all) {
      if (t.hidden) continue;
      let score = 0, hits = 0;

      for (const m of want.moods) if ((t.moods || []).includes(m)) { score += W.mood; hits++; }
      for (const g of want.genres) if ((t.genres || []).includes(g)) { score += W.genre; hits++; }
      for (const i of want.instruments) if ((t.instruments || []).includes(i)) { score += W.instrument; hits++; }

      if (want.vocal) {
        if (t.vocal === want.vocal) { score += W.vocal; hits++; }
        else score -= W.vocal;            // asked for instrumental, this sings
      }
      if (want.bpm && t.bpm) {
        if (t.bpm >= want.bpm[0] && t.bpm <= want.bpm[1]) { score += W.bpm; hits++; }
        else score -= Math.min(2, Math.abs(t.bpm - (want.bpm[0] + want.bpm[1]) / 2) / 40);
      }
      // an explicit "no X" is a veto, not a penalty
      const bag = norm([...(t.moods || []), ...(t.genres || []), ...(t.instruments || [])].join(' '));
      if (want.not.some((n) => n.length > 2 && bag.includes(n))) continue;

      if (hits) out.push({ t, score });
    }

    out.sort((a, b) => b.score - a.score || (b.t.bpm || 0) - (a.t.bpm || 0));
    return out;
  }

  /* ── UI ───────────────────────────────────────────────────────────────── */

  let el = null, lastWant = null;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'ag-modal';
    el.hidden = true;
    el.innerHTML = `
      <div class="ag-card" role="dialog" aria-modal="true" aria-label="Describe what you need">
        <button class="ag-close" aria-label="Close">&times;</button>
        <h3 class="ag-h">Describe what you need</h3>
        <div class="ag-inwrap">
          <textarea class="ag-in" rows="2" placeholder="Warm and hopeful for a wedding montage, no vocals"></textarea>
          <button class="ag-go" type="button">Find</button>
        </div>
        <div class="ag-examples">
          ${['Tense build for a thriller trailer',
             'Upbeat instrumental for a corporate explainer',
             'Sad piano, slow, no drums',
             'Lo-fi beats for a vlog, around 90 bpm'].map((x) =>
            `<button type="button" class="ag-eg">${esc(x)}</button>`).join('')}
        </div>
        <div class="ag-out"></div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.ag-close').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
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

  function run() {
    const prompt = el.querySelector('.ag-in').value.trim();
    if (!prompt) return;
    lastWant = interpret(prompt);
    paint(lastWant, prompt);
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

  function paint(want, prompt) {
    const ranked = rank(want);
    const out = el.querySelector('.ag-out');
    const top = ranked.slice(0, 12);

    const read = [];
    if (want.moods.length) read.push(want.moods.join(', '));
    if (want.genres.length) read.push(want.genres.join(', '));
    if (want.instruments.length) read.push(want.instruments.join(', '));
    if (want.vocal) read.push(want.vocal === 'Instrumental' ? 'no vocals' : 'with vocals');
    if (want.bpm) read.push(`${want.bpm[0]}–${want.bpm[1]} bpm`);

    out.innerHTML = `
      ${read.length
        ? `<p class="ag-read">Looking for <b>${esc(read.join(' · '))}</b></p>`
        : `<p class="ag-read ag-none">Nothing in that I could match to the catalogue.
             Try a mood, a genre, or an occasion — “tense”, “folk”, “wedding”.</p>`}
      ${want.unmatched.length
        ? `<p class="ag-miss">Ignored: ${esc(want.unmatched.join(', '))} — not something the
             catalogue is tagged for.</p>` : ''}
      <div class="ag-refine"></div>
      ${top.length
        ? `<div class="ag-list">${top.map(({ t, score }) => `
            <div class="ag-row" data-slug="${esc(t.slug)}">
              <button type="button" class="ag-play" aria-label="Play ${esc(t.title)}">▶</button>
              <img src="${esc(t.cover || '')}" alt="" loading="lazy">
              <span class="ag-t">${esc(t.title)}<i>${esc(t.artist || '')}</i></span>
              <span class="ag-m">${t.bpm ? t.bpm + ' bpm' : ''}</span>
              <span class="ag-s" title="match strength">${'●'.repeat(Math.min(3, Math.ceil(score / 3)))}</span>
              <button type="button" class="ag-lic">License</button>
            </div>`).join('')}</div>
           <button type="button" class="ag-all">Show all ${ranked.length} in the catalogue</button>`
        : (read.length ? '<p class="ag-read ag-none">No track matches all of that. Loosen one of the chips above.</p>' : '')}`;

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
      want.vocal = 'Instrumental'; paint(want, prompt);
    }));
    void vocab;

    out.querySelectorAll('.ag-row').forEach((row) => {
      const t = (window.mutraPlayer && mutraPlayer.find(row.dataset.slug));
      row.querySelector('.ag-play').addEventListener('click', () => {
        if (t && window.mutraPlayer) mutraPlayer.play(t);   // panel stays open
      });
      row.querySelector('.ag-lic').addEventListener('click', () => {
        close();
        if (t && window.mutraLicense) mutraLicense.open(t);
      });
    });

    const allBtn = out.querySelector('.ag-all');
    if (allBtn) allBtn.addEventListener('click', () => {
      // hand the whole result set to the catalogue's own list
      close();
      if (window.mutraShowSlugs) mutraShowSlugs(ranked.map(({ t }) => t.slug), prompt);
    });
  }

  function open(seed) {
    build();
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    const inp = el.querySelector('.ag-in');
    if (seed) { inp.value = seed; run(); }
    setTimeout(() => inp.focus(), 40);
  }
  function close() {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
  }

  addEventListener('click', (e) => {
    if (e.target.closest('[data-agent]')) { e.preventDefault(); open(); }
  });

  window.mutraAgent = { open, close, interpret, rank };
})();
