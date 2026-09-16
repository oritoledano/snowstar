/* ═══════════ Artist dashboard — upload, rights declaration, credits, claims ═══
   Files start uploading the moment they're dropped (never gated on paperwork);
   the signed declaration attaches when Submit fires. Ownership is chosen once
   per batch (solo, or shared) but "shared" then splits two ways: the same
   co-owner list for every track ("all"), or a per-track checklist where each
   marked track gets its own co-owner list ("pick") — every track still posts
   its own /artist/submissions call, so a "pick" batch is really a mix of solo
   and shared declarations sent individually; the backend never assumed one
   declaration per batch, that constraint only ever lived in this UI. */
(function () {
  const M = window.SnowstarAccount;
  if (!M) return;
  const $ = (s) => document.querySelector(s);
  const gate = $('#arGate'), reg = $('#arRegister'), dash = $('#arDash');
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtSize = (b) => (b / 1048576).toFixed(1) + 'MB';
  const STATUS_WORD = { pending: 'In review', approved: 'Accepted',
                        rejected: 'Not this one', info: 'Needs your answer' };
  const esc = (s) => String(s || '').replace(/</g, '&lt;');

  const DECL = {
    solo: `This track is entirely mine.\nI confirm that: I made this track and own all rights to it — the composition and the recording. Any samples, loops, or presets in it are ones I'm properly licensed to use in commercial work. No other person, band member, label, or publisher owns any part of it. Mutra may license it to clients worldwide, royalty-free.\nIf any of this turns out not to be true, I take responsibility for it — not Mutra, and not the clients who licensed the track in good faith.`,
    shared: `I share ownership of this track.\nI own part of this track, and the people listed own the rest. I confirm that: the list of co-owners and their shares is complete, correct, and adds up to 100%. Every co-owner knows about this submission and has given me permission to submit the track and let Mutra license it to clients worldwide, royalty-free. Any samples, loops, or presets in it are properly licensed for commercial use. Mutra may contact each co-owner at the details I've provided so they can claim their share of the track's income.\nIf any of this turns out not to be true, I take responsibility for it — not Mutra, not my co-owners, and not the clients who licensed the track in good faith.`,
    behalf: `Submitted by Snowstar on behalf of the credited artist.\nI confirm that the credited artist has confirmed to me that the ownership details above are correct and that they authorize Mutra to license this track to clients worldwide, royalty-free. Where written confirmation exists, it is noted here and kept on file.`,
  };

  $('#arSignin').addEventListener('click', () => window.SnowstarOpenAuth && SnowstarOpenAuth('signup',
    'Create your free account to start uploading music.', 'sell'));

  async function api(path, body) {
    const res = await fetch('/api' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'request_failed');
    return d;
  }
  /* Error codes are for logs. Anything an artist can see gets a sentence. */
  const FRIENDLY = {
    submissions_closed: 'We are not taking new music at the moment.',
    too_big: 'That file is over 95MB — export a smaller master.',
    bad_type: 'We take WAV, AIFF, FLAC, MP3, M4A and OGG.',
    unauthorized: 'Sign in as an artist to upload.',
    network: 'The connection dropped — try that one again.',
    file_missing: 'That upload did not finish — try it again.',
    declaration_required: 'Pick how you own this track before submitting.',
    signature_required: 'Type your name to sign the declaration.',
  };
  /* Is the door open? Read once at load; the page re-reads on render. */
  const DOOR = { closed: false, why: '' };

  const get = (path) => fetch('/api' + path, { credentials: 'same-origin' }).then((r) => r.json());
  const post = (path, body) => fetch('/api' + path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => null);

  /* ── the tag vocabulary ──────────────────────────────────────────────────
     Derived, never listed. The shipped catalogue is merged with the owner's
     server-side patches — the same two sources mutra-page.js's refreshVocab()
     uses — so a tag added on the catalogue this morning is offerable here this
     afternoon without anyone editing this file. A hardcoded list would be
     wrong the first time a tag was added, and silently wrong after that.

     If /api/tracks fails we keep the shipped catalogue: still a real list of
     tags in use, just missing today's edits. */
  let VOCAB = [];
  const CANON = new Map();               // lowercase -> the catalogue's spelling

  async function loadVocab() {
    // mutra-data.js declares `const MUTRA` at top level, which is a lexical
    // global — reachable by name but never as a property of window. Reading
    // window.MUTRA here silently found nothing and left the list empty.
    const M = typeof MUTRA !== 'undefined' ? MUTRA : null;
    if (!M || !Array.isArray(M.tracks)) return;
    let patches = {};
    try { patches = (await get('/tracks')).overrides || {}; } catch { /* shipped only */ }

    const seen = new Set();
    const add = (v) => {
      const s = String(v == null ? '' : v).trim();
      if (!s || seen.has(s.toLowerCase())) return;
      seen.add(s.toLowerCase());
      CANON.set(s.toLowerCase(), s);
    };
    for (const t of M.tracks) {
      const p = patches[t.slug] || {};
      for (const k of ['genres', 'moods', 'characteristics', 'instruments']) {
        for (const v of (p[k] || t[k] || [])) add(v);
      }
    }
    VOCAB = [...CANON.values()].sort((a, b) => a.localeCompare(b));

    const dl = document.getElementById('dl-uptags');
    if (dl) dl.innerHTML = VOCAB.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }
  loadVocab();

  /** Match what someone typed to the catalogue's spelling, so "blues" files
      alongside "Blues" instead of beside it. Unknown tags are kept as typed —
      an artist describing their own music should not be silently overruled. */
  const canonTag = (v) => CANON.get(String(v || '').trim().toLowerCase()) || String(v || '').trim();
  const isKnownTag = (v) => CANON.has(String(v || '').trim().toLowerCase());

  // ── state machine: gate / register / dashboard, plus credits & claims ──
  let lastUser = null;
  async function render() {
    const u = M.user;
    gate.hidden = !!u;
    if (!u) { reg.hidden = true; dash.hidden = true; $('#arCredits').hidden = true;
              $('#arClaim').hidden = true; $('#arProfile').hidden = true;
              $('#arEarnings').hidden = true; lastUser = null; return; }
    if (u === lastUser && !dash.hidden) return;
    lastUser = u;
    try {
      const [d, credits, claim, earn] = await Promise.all([
        get('/artist/uploads'), get('/credits'), get('/claim'),
        get('/earnings/mine').catch(() => null),
      ]);
      reg.hidden = !!d.artist;
      dash.hidden = !d.artist;
      /* An artist gets the workspace; anyone else keeps the pitch. The pitch is
         what persuaded them to sign up — it is just not what they came back for. */
      STUDIO.uploads = d.uploads || [];
      STUDIO.earn = earn || null;
      if (d.artist) {
        buildStudio();
        const st = $('#arStudio');
        if (st) st.hidden = false;
        document.querySelectorAll('.pj-sec').forEach((el) => { el.hidden = true; });
        const hero = document.querySelector('.ar-hero');
        if (hero) hero.hidden = true;
        $('#arWho').textContent = d.artist_name || '';
        $('#arName').value = d.artist_name || '';
        paintList(d.uploads || []);
        if (u.admin) initBehalf();
        paintHome();
      } else {
        const st = $('#arStudio');
        if (st) st.hidden = true;
        document.querySelectorAll('.pj-sec').forEach((el) => { el.hidden = false; });
        const hero = document.querySelector('.ar-hero');
        if (hero) hero.hidden = false;
      }
      paintCredits(credits.credits || []);
      paintClaim(claim);
      paintProfile(!!d.artist);
      paintEarnings(earn);
    } catch { /* leave as-is */ }
  }
  M.onChange(render);
  render();
  // Whether we are taking music at all. Read alongside the first render so the
  // upload card never paints as usable and then retracts.
  checkDoor();

  // ── become an artist / rename ──
  $('#arRegBtn').addEventListener('click', async () => {
    const name = $('#arName').value.trim();
    const st = $('#arRegStatus');
    if (name.length < 2) { st.textContent = 'Give us a name to credit.'; st.hidden = false; return; }
    try {
      await api('/artist/register', { artist_name: name });
      st.hidden = true;
      reg.hidden = true; dash.hidden = false;
      $('#arWho').textContent = name;
      const d = await get('/artist/uploads');
      paintList(d.uploads || []);
      if (M.user && M.user.admin) initBehalf();
    } catch (e) { st.textContent = 'Couldn’t save that — try again.'; st.hidden = false; }
  });
  $('#arRename').addEventListener('click', () => { dash.hidden = true; reg.hidden = false; $('#arName').focus(); });

  // ── owner-only: upload on behalf of a managed artist ──
  let managedArtists = [];
  async function initBehalf() {
    $('#arAsRow').hidden = false;
    try { managedArtists = (await get('/managed-artists')).artists || []; } catch { managedArtists = []; }
    const sel = $('#arAs');
    sel.innerHTML = `<option value="">Myself (${esc(M.user.artist_name || 'me')})</option>` +
      managedArtists.map((a) => `<option value="${a.id}">${esc(a.name)}${a.claimed_user_id ? ' ✓ (claimed)' : ''}</option>`).join('') +
      `<option value="new">＋ New artist…</option>`;
    sel.onchange = () => {
      $('#arNewArtist').hidden = sel.value !== 'new';
      syncDecl();
    };
  }
  const behalfMode = () => M.user && M.user.admin && $('#arAs') && $('#arAs').value !== '';

  /** Resolve the credited managed artist id, creating a new one if needed. */
  async function resolveManagedArtist() {
    const v = $('#arAs').value;
    if (!v) return null;
    if (v !== 'new') return Number(v);
    const name = $('#arNewName').value.trim(), email = $('#arNewEmail').value.trim();
    if (name.length < 2) throw new Error('give the new artist a name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('the new artist needs a valid email');
    const r = await api('/managed-artists', { name, email });
    return r.id;
  }

  // ── staging: files upload on drop, submission waits for the signature ──
  const drop = $('#arDrop'), fileInput = $('#arFile'), upStatus = $('#arUpStatus');
  let staged = []; // {_id, file, title, key, pct, error, shared, collabs}
  let nextStagedId = 1;

  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => stageFiles([...e.dataTransfer.files]));
  fileInput.addEventListener('change', () => { stageFiles([...fileInput.files]); fileInput.value = ''; });

  function put(path, file, onPct) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api' + path);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round(e.loaded / e.total * 100));
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText);
          // `message` when the server wrote a sentence for a person to read; the
          // code is only a fallback. Without this an artist saw, literally,
          // "⚠ submissions_closed".
          xhr.status === 200 ? resolve(d)
            : reject(new Error(d.message || FRIENDLY[d.error] || d.error || 'upload_failed'));
        } catch { reject(new Error('Something went wrong sending that file.')); }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(file);
    });
  }

  function stageFiles(files) {
    const audio = files.filter((f) => /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i.test(f.name));
    if (!audio.length) { say('Those aren’t audio files we accept.'); return; }
    for (const f of audio) {
      if (f.size > 95 * 1024 * 1024) { say(`“${f.name}” is over 95MB — export a smaller master.`); continue; }
      const guessed = (window.mutraAnalyse && mutraAnalyse.titleFrom(f.name))
        || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      const item = { _id: nextStagedId++, file: f, title: guessed, key: null, pct: 0,
                     error: null, shared: false, collabs: [],
                     // Everything measured off the audio. `meta` is what gets
                     // sent; `found` records what was suggested, so a field the
                     // uploader has corrected is never quietly overwritten by a
                     // later re-analysis.
                     meta: { bpm: null, key: null, scale: null, vocal: null, duration: null, lyrics: '', tags: [], links: [] },
                     found: null, analysing: false, analyseStep: '' };
      staged.push(item);

      /* Analysis runs beside the upload rather than after it. Both want the
         same file and neither needs the other, and a person who has just
         dropped a 90MB master should not watch two progress bars in sequence. */
      if (window.mutraAnalyse) {
        item.analysing = true;
        mutraAnalyse.analyse(f, (st) => { item.analyseStep = st; paintStaged(); })
          .then((r) => {
            item.analysing = false;
            item.found = r;
            item.meta.bpm = r.bpm; item.meta.key = r.key;
            item.meta.scale = r.scale; item.meta.vocal = r.vocal;
            // Duration was measured and shown but never copied onto meta, so it
            // was thrown away in the browser before the submission was posted.
            item.meta.duration = r.duration;
            if (r.title) item.title = r.title;
            paintStaged();
          })
          .catch(() => { item.analysing = false; item.analyseStep = ''; paintStaged(); });
      }

      put('/artist/upload?filename=' + encodeURIComponent(f.name), f, (pct) => { item.pct = pct; paintStaged(); })
        .then((d) => { item.key = d.key; paintStaged(); })
        .catch((e) => { item.error = e.message; paintStaged(); });
    }
    paintStaged();
  }

  function paintStaged() {
    const ul = $('#arStaged');
    ul.hidden = !staged.length;
    $('#arRights').hidden = !staged.length;
    const mins = (n) => n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '';
    ul.innerHTML = staged.map((s, i) => {
      const f = s.found || {};
      const chip = (label, on, act, val) =>
        `<button type="button" class="up-chip${on ? ' on' : ''}" data-i="${i}" data-act="${act}" data-v="${val}">${label}</button>`;
      return `
      <li class="up-item">
        <div class="up-top">
          <input class="up-title" data-i="${i}" value="${esc(s.title)}" placeholder="Track title" maxlength="140">
          <span class="up-state">${s.error ? '⚠ ' + esc(s.error)
            : s.key ? 'uploaded ✓' : 'uploading… ' + s.pct + '%'}</span>
          <button type="button" data-i="${i}" class="ar-unstage">✕</button>
        </div>
        ${s.analysing ? `<p class="up-an">Listening to it… ${esc(s.analyseStep)}</p>` : ''}
        ${s.found ? `<div class="up-fields">
          <p class="up-note">Measured from the audio — correct anything that is wrong.</p>
          <div class="up-grid">
            <label>Duration<input value="${mins(f.duration)}" readonly></label>
            <label>BPM<input class="up-bpm" data-i="${i}" type="number" min="20" max="300"
              value="${s.meta.bpm || ''}"></label>
            <label>Key<select class="up-key" data-i="${i}">
              <option value="">—</option>
              ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((k) =>
                `<option${s.meta.key === k ? ' selected' : ''}>${k}</option>`).join('')}
            </select></label>
            <label>Scale<select class="up-scale" data-i="${i}">
              <option value="">—</option>
              <option${s.meta.scale === 'major' ? ' selected' : ''}>major</option>
              <option${s.meta.scale === 'minor' ? ' selected' : ''}>minor</option>
            </select></label>
          </div>
          ${(f.bpmAlternatives || []).length > 1 ? `<p class="up-alt">Same groove counted differently:
            ${f.bpmAlternatives.map((n) => chip(n + ' bpm', s.meta.bpm === n, 'bpm', n)).join(' ')}</p>` : ''}
          <p class="up-alt">Voice:
            ${chip('Has vocals', s.meta.vocal === 'Vocals', 'vocal', 'Vocals')}
            ${chip('Instrumental', s.meta.vocal === 'Instrumental', 'vocal', 'Instrumental')}
            ${f.vocalConfidence < 0.5 ? '<i class="up-unsure">not sure — please check</i>' : ''}</p>
          ${s.meta.vocal === 'Vocals' ? `<label class="up-lyr">Lyrics
            <textarea class="up-lyrics" data-i="${i}" rows="4"
              placeholder="Paste the words — used for search and for the licence certificate">${esc(s.meta.lyrics)}</textarea></label>` : ''}
          <label class="up-lyr">Tags
            <input class="up-tags" data-i="${i}" value="${esc((s.meta.tags || []).join(', '))}"
              list="dl-uptags" placeholder="Start typing — pick from the tags we use">
            <span class="up-newtags" hidden></span></label>
          <label class="up-lyr">Streaming links
            <textarea class="up-links" data-i="${i}" rows="2"
              placeholder="Paste Spotify / Apple / YouTube links and we will pick them out">${
                esc((s.meta.links || []).map((l) => l.url).join('\n'))}</textarea></label>
          ${(s.meta.links || []).length ? `<p class="up-alt">Found:
            ${s.meta.links.map((l) => `<span class="up-chip on">${esc(l.platform)}</span>`).join(' ')}</p>` : ''}
        </div>` : ''}
      </li>`;
    }).join('');

    ul.querySelectorAll('.ar-unstage').forEach((b) => b.addEventListener('click', () => {
      staged.splice(Number(b.dataset.i), 1); paintStaged();
    }));
    // Typed fields write straight into the item without repainting, or the
    // caret would jump to the end of the box on every keystroke.
    const bind = (sel, fn) => ul.querySelectorAll(sel).forEach((el) =>
      el.addEventListener('input', () => fn(staged[Number(el.dataset.i)], el)));
    bind('.up-title', (it, el) => { it.title = el.value; });
    bind('.up-bpm', (it, el) => { it.meta.bpm = Number(el.value) || null; });
    bind('.up-lyrics', (it, el) => { it.meta.lyrics = el.value; });
    bind('.up-tags', (it, el) => {
      it.meta.tags = el.value.split(',').map(canonTag).filter(Boolean).slice(0, 12);
      // Say which tags are not in the catalogue yet, rather than accepting them
      // silently and leaving the uploader thinking they picked something real.
      const hint = el.parentElement.querySelector('.up-newtags');
      if (hint) {
        const unknown = it.meta.tags.filter((t) => !isKnownTag(t));
        hint.textContent = unknown.length
          ? `Not in the catalogue yet: ${unknown.join(', ')} — we'll review these.` : '';
        hint.hidden = !unknown.length;
      }
    });
    bind('.up-links', (it, el) => {
      it.meta.links = (window.mutraAnalyse ? mutraAnalyse.findLinks(el.value) : []);
    });
    ul.querySelectorAll('.up-key').forEach((el) => el.addEventListener('change', () => {
      staged[Number(el.dataset.i)].meta.key = el.value || null;
    }));
    ul.querySelectorAll('.up-scale').forEach((el) => el.addEventListener('change', () => {
      staged[Number(el.dataset.i)].meta.scale = el.value || null;
    }));
    ul.querySelectorAll('.up-chip').forEach((b) => b.addEventListener('click', () => {
      const it = staged[Number(b.dataset.i)];
      if (b.dataset.act === 'bpm') it.meta.bpm = Number(b.dataset.v);
      if (b.dataset.act === 'vocal') {
        // Clicking the one already chosen clears it — nobody should be forced
        // to assert something they are not sure about.
        it.meta.vocal = it.meta.vocal === b.dataset.v ? null : b.dataset.v;
      }
      paintStaged();
    }));
    renderTrackShares(); // diff-only — never rebuilds a block for a track that's still staged, so it never steals focus mid-type
    syncDecl();
  }

  // ── the declaration form ──
  // Ownership and control are SEPARATE axes and both can apply at once — an
  // artist can own a track outright and still have signed its commercial use
  // to a label, distributor or agent. Conflating them is exactly how a track
  // ends up looking clear when it isn't, so they're two independent ticks.
  $('#arShared').addEventListener('change', syncDecl);
  $('#arControlled').addEventListener('change', syncDecl);
  document.querySelectorAll('[name="arScope"]').forEach((r) => r.addEventListener('change', syncDecl));
  document.querySelectorAll('[name="arApprove"]').forEach((r) => r.addEventListener('change', syncDecl));
  $('#arAgree').addEventListener('change', syncDecl);
  $('#arSign').addEventListener('input', syncDecl);
  $('#arAddCollab').addEventListener('click', () => addCollabRow($('#arCollabRows'), syncDecl));
  $('#arAddController').addEventListener('click', () => addControllerRow());

  /** Whoever has a say in commercial use but isn't a co-owner: label,
   * publisher, distributor, sync agent. Name + what they control + where. */
  function addControllerRow(pre) {
    const row = document.createElement('div');
    row.className = 'ar-ctrl';
    row.innerHTML = `<input placeholder="Label, publisher or agent" maxlength="120" data-f="name">
      <select data-f="scope">
        <option value="recording">the recording</option>
        <option value="song">the song</option>
        <option value="both">both</option>
      </select>
      <input placeholder="Territory (or worldwide)" maxlength="120" data-f="territory">
      <input placeholder="their@email.com" type="email" maxlength="254" data-f="email">
      <input placeholder="Phone (with country code)" type="tel" maxlength="40" data-f="phone">
      <button type="button" title="Remove">✕</button>`;
    if (pre) {
      row.querySelector('[data-f="name"]').value = pre.name || '';
      row.querySelector('[data-f="scope"]').value = pre.scope || 'recording';
      row.querySelector('[data-f="territory"]').value = pre.territory || '';
      row.querySelector('[data-f="email"]').value = pre.email || '';
      row.querySelector('[data-f="phone"]').value = pre.phone || '';
    }
    row.querySelector('button').addEventListener('click', () => { row.remove(); syncDecl(); });
    row.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', syncDecl));
    $('#arControllerRows').appendChild(row);
    return row;
  }

  function controllerData() {
    return [...document.querySelectorAll('#arControllerRows .ar-ctrl')].map((row) => ({
      name: row.querySelector('[data-f="name"]').value.trim(),
      scope: row.querySelector('[data-f="scope"]').value,
      territory: row.querySelector('[data-f="territory"]').value.trim(),
      email: row.querySelector('[data-f="email"]').value.trim(),
      phone: row.querySelector('[data-f="phone"]').value.trim(),
    })).filter((c) => c.name);
  }

  /** container-scoped so the same row UI serves the one global co-owner list
   * ("all tracks") and each track's own list ("choose which tracks"). */
  function addCollabRow(container, onChange, pre) {
    const row = document.createElement('div');
    row.className = 'ar-crow';
    row.innerHTML = `<input placeholder="Full name" maxlength="120" data-f="name">
      <input placeholder="their@email.com" type="email" maxlength="254" data-f="email">
      <input placeholder="Phone (optional)" type="tel" maxlength="40" data-f="phone">
      <input placeholder="%" inputmode="decimal" data-f="pct">
      <button type="button" title="Remove">✕</button>`;
    if (pre) {
      row.querySelector('[data-f="name"]').value = pre.name || '';
      row.querySelector('[data-f="email"]').value = pre.email || '';
      row.querySelector('[data-f="phone"]').value = pre.phone || '';
      row.querySelector('[data-f="pct"]').value = pre.share_pct || '';
    }
    row.querySelector('button').addEventListener('click', () => { row.remove(); onChange(); });
    row.querySelectorAll('input').forEach((i) => i.addEventListener('input', onChange));
    container.appendChild(row);
    return row;
  }

  function collabData(container) {
    return [...container.querySelectorAll('.ar-crow')].map((row) => ({
      name: row.querySelector('[data-f="name"]').value.trim(),
      email: row.querySelector('[data-f="email"]').value.trim(),
      phone: row.querySelector('[data-f="phone"]').value.trim(),
      share_pct: parseFloat(row.querySelector('[data-f="pct"]').value) || 0,
    })).filter((c) => c.name || c.email || c.share_pct);
  }

  /** Mirrors the server exactly — whole-basis-point math, no float drift.
   * requireAtLeastOne: false lets an empty list pass (behalf's list is
   * optional; a "shared" list, whether global or per-track, is not). */
  function validateCollabs(collabs, requireAtLeastOne) {
    const bps = collabs.map((c) => Math.round(c.share_pct * 100));
    const leftBp = 10000 - bps.reduce((a, b) => a + b, 0);
    let ok = leftBp >= 1 && collabs.every((c, i) =>
      c.name.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) && bps[i] >= 1);
    if (requireAtLeastOne && !collabs.length) ok = false;
    return { leftBp, ok };
  }

  /** One checklist row per staged track, each revealing its own co-owner
   * editor when checked. Diff-only: an already-rendered block for a track
   * that's still staged is NEVER rebuilt, so a progress-tick repaint mid-
   * upload can't blow away focus or half-typed co-owner rows. */
  function renderTrackShares() {
    const el = $('#arTrackShares');
    const stagedIds = new Set(staged.map((s) => s._id));
    [...el.children].forEach((c) => { if (!stagedIds.has(Number(c.dataset.id))) c.remove(); });
    const existingIds = new Set([...el.children].map((c) => Number(c.dataset.id)));
    staged.forEach((item) => {
      if (existingIds.has(item._id)) return;
      const block = document.createElement('div');
      block.className = 'ar-tshare';
      block.dataset.id = item._id;
      block.innerHTML = `
        <label class="ar-tshare-head">
          <input type="checkbox" class="ar-tshare-chk">
          <span></span>
        </label>
        <div class="ar-tshare-body" hidden>
          <div class="ar-crow-rows"></div>
          <button type="button" class="ar-addrow">＋ Add co-owner</button>
          <p class="ar-note ar-tshare-left"></p>
        </div>`;
      block.querySelector('.ar-tshare-head span').textContent = item.title;
      const chk = block.querySelector('.ar-tshare-chk');
      const body = block.querySelector('.ar-tshare-body');
      const rows = block.querySelector('.ar-crow-rows');
      chk.checked = item.shared;
      body.hidden = !item.shared;
      const onRowChange = () => syncDecl();
      chk.addEventListener('change', () => {
        item.shared = chk.checked;
        body.hidden = !chk.checked;
        if (chk.checked && !rows.children.length) addCollabRow(rows, onRowChange);
        syncDecl();
      });
      block.querySelector('.ar-addrow').addEventListener('click', () => addCollabRow(rows, onRowChange));
      el.appendChild(block);
    });
  }

  function syncDecl() {
    const behalf = behalfMode();
    const shared = !behalf && $('#arShared').checked;
    const controlled = !behalf && $('#arControlled').checked;
    const kind = behalf ? 'behalf' : (shared ? 'shared' : 'solo');
    $('#arDeclText').textContent = DECL[kind];
    $('#arEvidence').hidden = !behalf;
    $('#arSharedScope').hidden = !shared;
    $('#arApproval').hidden = !shared;
    $('#arControllers').hidden = !controlled;
    if (controlled && !document.querySelector('#arControllerRows .ar-ctrl')) addControllerRow();
    const scope = (document.querySelector('[name="arScope"]:checked') || {}).value || 'all';
    const scopeAllShared = shared && scope === 'all'; // "all tracks" sub-choice
    const scopePick = shared && scope === 'pick';     // "choose which tracks"
    const useGlobalCollabs = scopeAllShared || behalf; // both read #arCollabRows

    $('#arCollabs').hidden = !useGlobalCollabs;
    $('#arTrackShares').hidden = !scopePick;
    if (scopePick) renderTrackShares();
    if (scopeAllShared && !document.querySelector('#arCollabRows .ar-crow')) addCollabRow($('#arCollabRows'), syncDecl);

    let sharesOk = true;
    if (useGlobalCollabs) {
      const collabs = collabData($('#arCollabRows'));
      const requireOne = scopeAllShared; // behalf's list is optional
      if (requireOne || collabs.length) {
        const { leftBp, ok } = validateCollabs(collabs, requireOne);
        const who = behalf ? 'the artist' : 'you';
        $('#arShareLeft').textContent = leftBp >= 1
          ? `That leaves ${who} with ${Number((leftBp / 100).toFixed(2))}%.`
          : `Shares total ${Number(((10000 - leftBp) / 100).toFixed(2))}% — ${who} must keep a share.`;
        sharesOk = ok;
      } else {
        $('#arShareLeft').textContent = '';
      }
    } else {
      $('#arShareLeft').textContent = '';
    }

    if (scopePick) {
      let anyShared = false;
      $('#arTrackShares').querySelectorAll('.ar-tshare').forEach((block) => {
        const item = staged.find((s) => s._id === Number(block.dataset.id));
        const leftEl = block.querySelector('.ar-tshare-left');
        if (!item || !item.shared) { if (leftEl) leftEl.textContent = ''; return; }
        anyShared = true;
        const collabs = collabData(block.querySelector('.ar-crow-rows'));
        item.collabs = collabs; // persisted so a later repaint doesn't lose it
        const { leftBp, ok } = validateCollabs(collabs, true);
        leftEl.textContent = leftBp >= 1
          ? `That leaves you with ${Number((leftBp / 100).toFixed(2))}%.`
          : `Shares total ${Number(((10000 - leftBp) / 100).toFixed(2))}% — you must keep a share.`;
        if (!ok) sharesOk = false;
      });
      if (!anyShared) sharesOk = false; // "choose which tracks" with none picked isn't a real choice yet
    }

    // Anything not wholly the artist's — shared ownership, or someone else with
    // a say in commercial use — is bookable but never self-serve. The counterparty
    // only gets contacted once a deal is real, which is the whole point of the lane.
    const controllers = controllerData();
    /* Name alone is not a contact. A controller has to be reachable by email
       or phone, or clearing a licence later has nowhere to start. */
    const controllersOk = !controlled
      || (controllers.length > 0 && controllers.every((c) => c.email || c.phone));
    const lane = (shared || controlled || (behalf && collabData($('#arCollabRows')).length)) ? 'quote' : 'instant';
    const laneEl = $('#arLane');
    laneEl.className = 'ar-lane ' + lane;
    laneEl.textContent = lane === 'instant'
      ? 'Clear to license — these go into the catalogue with an instant licence.'
      : 'Custom quote — these stay in the catalogue, but every licence comes through us first. Nobody else gets contacted until there is a real deal on the table.';

    const filesReady = staged.length > 0 && staged.every((s) => s.key || s.error) && staged.some((s) => s.key);
    const signed = $('#arAgree').checked && $('#arSign').value.trim().length >= 2;
    const btn = $('#arSubmit');
    btn.disabled = DOOR.closed || !(filesReady && signed && sharesOk && controllersOk);
    const n = staged.filter((s) => s.key).length;
    btn.textContent = n ? `Submit ${n} track${n === 1 ? '' : 's'}` : 'Submit';

    /* A disabled button with no explanation is a dead end — you can see that you
       cannot submit and not why. One reason at a time, in the order they need
       fixing, so the form never presents a list of complaints. */
    const why = $('#arWhy');
    if (why) {
      const reason =
        DOOR.closed ? DOOR.why
        : !filesReady ? (staged.length ? 'Waiting for the files to finish uploading.'
                                     : 'Add at least one track first.')
        : !sharesOk ? 'The co-owner shares need to add up to 100%.'
        : !controllersOk ? 'Name whoever has a say in commercial use.'
        : !$('#arAgree').checked ? 'Tick “I confirm the above” to submit.'
        : $('#arSign').value.trim().length < 2 ? 'Type your name to sign the declaration.'
        : '';
      why.textContent = reason;
      why.hidden = !reason;
    }
  }

  $('#arSubmit').addEventListener('click', async () => {
    const btn = $('#arSubmit');
    btn.disabled = true;
    try {
      const behalf = behalfMode();
      const managedId = behalf ? await resolveManagedArtist() : null;
      const sharedTick = !behalf && $('#arShared').checked;
      const controlledTick = !behalf && $('#arControlled').checked;
      const kind = behalf ? 'behalf' : (sharedTick ? 'shared' : 'solo');
      const controllers = controlledTick ? controllerData() : [];
      const approval = (document.querySelector('[name="arApprove"]:checked') || {}).value || 'any';
      const scope = (document.querySelector('[name="arScope"]:checked') || {}).value || 'all';
      const perTrack = kind === 'shared' && !behalf && scope === 'pick';
      const globalCollabs = (kind === 'shared' || behalf) && !perTrack ? collabData($('#arCollabRows')) : [];
      const signedName = $('#arSign').value.trim();
      const acum = $('#arAcum').checked;
      const evidenceKind = behalf ? $('#arEvKind').value : undefined;
      const evidenceNote = behalf ? $('#arEvNote').value.trim() : undefined;
      // "choose which tracks": every track posts its own declaration — shared
      // (with its own co-owners) for the ones checked, solo for the rest.
      // Everything else keeps the one declaration every track has always sent.
      const declFor = (item) => {
        const base = perTrack
          ? (item.shared
              ? { kind: 'shared', signed_name: signedName, acum, collaborators: item.collabs }
              : { kind: 'solo', signed_name: signedName, acum, collaborators: [] })
          : { kind, signed_name: signedName, acum, collaborators: globalCollabs,
              evidence_kind: evidenceKind, evidence_note: evidenceNote };
        // controllers apply to the whole batch — a label or distributor deal is
        // rarely per-track — and approval mode only means anything once shared
        if (controllers.length) base.controllers = controllers;
        if (base.kind === 'shared') base.approval = approval;
        return base;
      };
      const laneFor = (item) => (controllers.length || (perTrack ? item.shared : sharedTick)) ? 'quote' : 'instant';
      const note = $('#arNote').value.trim();
      let done = 0;
      for (const s of staged.filter((x) => x.key && !x.submitted)) {
        await api('/artist/submissions', {
          title: s.title, key: s.key, note, declaration: declFor(s), lane: laneFor(s),
          // What was measured and what the uploader corrected, travelling with
          // the submission so nobody has to work it out a second time when the
          // track is published.
          meta: s.meta,
          managed_artist_id: managedId || undefined,
        });
        // mark immediately: a mid-batch failure + retry must never resubmit
        // the ones that already went through
        s.submitted = true;
        done++;
      }
      staged = staged.filter((s) => !s.submitted);
      paintStaged();
      $('#arAgree').checked = false; $('#arSign').value = ''; $('#arNote').value = '';
      $('#arShared').checked = false; $('#arControlled').checked = false;
      document.querySelectorAll('#arCollabRows .ar-crow').forEach((r) => r.remove());
      document.querySelectorAll('#arControllerRows .ar-ctrl').forEach((r) => r.remove());
      say(`${done} track${done === 1 ? '' : 's'} submitted — ${behalf ? 'they’re in the review queue.' : 'we listen to everything and you’ll see the verdict here.'}`);
      const d = await get('/artist/uploads');
      paintList(d.uploads || []);
    } catch (e) {
      say('Couldn’t submit: ' + e.message);
    }
    syncDecl();
  });

  /* ── the studio shell ──────────────────────────────────────────────────
     A signed-in artist used to scroll past a hero, a placements reel, a
     why-join section, a how-it-works walkthrough and an eight-question FAQ
     before reaching anything of their own — then met a vertical stack of every
     card at once: upload, rights, profile, earnings, credits, submissions.
     That page is a good pitch and a bad workspace, and it was being asked to
     be both.

     So: the pitch stays for anyone who has not joined, and an artist gets a
     rail and one pane at a time. The existing cards are MOVED rather than
     rebuilt — a node keeps its listeners when it is re-parented, and every
     painter here writes by id, so nothing below this needs to know it happened. */
  const PANES = [
    { key: 'home',   label: 'Overview', ids: [] },
    { key: 'tracks', label: 'My tracks', ids: ['arListCard'] },
    { key: 'upload', label: 'Upload',   ids: ['arUploadCard'] },
    { key: 'money',  label: 'Earnings', ids: ['arEarnings', 'arCredits'] },
    { key: 'you',    label: 'Profile',  ids: ['arProfile', 'arClaim', 'arRegister'] },
  ];
  let pane = (location.hash || '').replace('#', '') || 'home';
  let studioBuilt = false;

  function buildStudio() {
    if (studioBuilt) return;
    const dash = $('#arDash');
    if (!dash) return;

    /* The two cards inside #arDash have no ids of their own — the upload card
       and the submissions card — so they are labelled here on the way past
       rather than by editing the markup underneath them. */
    const cards = dash.querySelectorAll(':scope > .ar-card');
    if (cards[0] && !cards[0].id) cards[0].id = 'arUploadCard';
    if (cards[1] && !cards[1].id) cards[1].id = 'arListCard';

    const shell = document.createElement('div');
    shell.className = 'st-shell';
    shell.id = 'arStudio';
    shell.innerHTML = `
      <nav class="st-rail">
        <span class="st-railhead">Studio</span>
        ${PANES.map((p) => `<button class="st-railbtn" data-pane="${p.key}">${p.label}</button>`).join('')}
        <a class="st-railbtn st-railout" href="/mutra.html">← Catalogue</a>
      </nav>
      <div class="st-main">
        <div class="st-kpis" id="stKpis"></div>
        ${PANES.map((p) => `<div class="st-pane" data-pane="${p.key}"></div>`).join('')}
      </div>`;
    dash.parentElement.insertBefore(shell, dash);

    for (const p of PANES) {
      const host = shell.querySelector(`.st-pane[data-pane="${p.key}"]`);
      for (const id of p.ids) {
        const el = document.getElementById(id);
        if (el) host.appendChild(el);          // listeners survive re-parenting
      }
    }
    /* #arDash stays in the DOM, emptied. render() reads `dash.hidden` as its
       "already painted" guard, so removing the node would make that guard read
       a detached element and repaint on every change. */

    shell.querySelectorAll('.st-railbtn[data-pane]').forEach((b) =>
      b.addEventListener('click', () => setPane(b.dataset.pane)));
    studioBuilt = true;
    setPane(pane);
  }

  function setPane(next) {
    pane = PANES.some((p) => p.key === next) ? next : 'home';
    const shell = $('#arStudio');
    if (!shell) return;
    shell.querySelectorAll('.st-railbtn[data-pane]').forEach((b) =>
      b.classList.toggle('on', b.dataset.pane === pane));
    shell.querySelectorAll('.st-pane').forEach((el) => {
      el.hidden = el.dataset.pane !== pane;
    });
    history.replaceState(null, '', '#' + pane);
    if (pane === 'home') paintHome();
  }

  /* Overview: the four numbers an artist actually wants, and the one thing
     waiting on them. Everything here is already loaded — this is a different
     arrangement of it, not another fetch. */
  function paintHome() {
    const host = document.querySelector('.st-pane[data-pane="home"]');
    if (!host) return;
    const ups = STUDIO.uploads || [];
    const by = (st) => ups.filter((u) => u.status === st).length;
    const live = ups.filter((u) => u.published_slug).length;
    const asked = ups.filter((u) => u.status === 'info');
    const owed = STUDIO.earn && STUDIO.earn.owed ? STUDIO.earn.owed : 0;

    const kpis = $('#stKpis');
    if (kpis) kpis.innerHTML = [
      [live, 'live in the catalogue'],
      [by('pending') + by('info'), 'with us'],
      [ups.length, 'sent in total'],
      ['₪' + (owed / 100).toFixed(2), 'owed to you'],
    ].map(([n, l]) => `<div class="st-kpi"><b>${n}</b><span>${l}</span></div>`).join('');

    host.innerHTML = `
      ${asked.length ? `<div class="st-card st-urgent">
        <h3>${asked.length} track${asked.length === 1 ? '' : 's'} waiting on you</h3>
        <p>We asked a question before ${asked.length === 1 ? 'it' : 'they'} can go further.</p>
        <button class="mbtn mbtn-solid" data-goto="tracks">Answer ${asked.length === 1 ? 'it' : 'them'}</button>
      </div>` : ''}
      <div class="st-card">
        <h3>${ups.length ? 'Your last few' : 'Nothing sent yet'}</h3>
        ${ups.length ? `<ul class="st-recent">${ups.slice(0, 5).map((u) => `
          <li><b>${esc(u.title)}</b>
            <span class="ar-badge ${u.status}">${STATUS_WORD[u.status] || u.status}</span>
            ${u.published_slug ? '<span class="ar-badge">live</span>' : ''}</li>`).join('')}</ul>`
          : `<p>Send us music and it appears here. We listen to everything.</p>
             <button class="mbtn mbtn-solid" data-goto="upload">Upload a track</button>`}
      </div>`;
    host.querySelectorAll('[data-goto]').forEach((b) =>
      b.addEventListener('click', () => setPane(b.dataset.goto)));
  }

  /* What the overview reads. Filled by render(), which already fetches it. */
  const STUDIO = { uploads: [], earn: null };

  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">'
    + '<path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">'
    + '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';

  /* ── playing your own track back ───────────────────────────────────────
     An artist could not hear what they had sent us. The endpoint for it —
     GET /artist/file?id=, ownership-checked, Range-aware — has existed all
     along and had exactly two consumers, both of them ours: the admin review
     screen and the re-analyser.

     This is a small transport of its own rather than mutra-page.js's, which is
     bound to catalogue objects and does not load on this page. It borrows the
     same .player/.pl-* chrome so the two look like one product; if the portal
     ever needs seeking, waveforms or a queue, that is the moment to extract
     the catalogue's transport properly instead of growing a second one here. */
  const heard = new Audio();
  heard.preload = 'none';
  let heardId = null;

  function playerBar() {
    let bar = document.getElementById('arPlayer');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'arPlayer';
    bar.className = 'player';
    bar.innerHTML = `
      <div class="player-in">
        <div class="pl-now">
          <button class="pl-play" type="button" aria-label="Play or pause">${PLAY_SVG}</button>
          <div class="pl-meta"><div class="pl-title"></div><div class="pl-artist">your upload</div></div>
        </div>
        <div class="pl-seek-wrap"><span class="pl-time">0:00</span></div>
        <div class="pl-actions"><button class="pl-close" type="button" aria-label="Close">✕</button></div>
      </div>`;
    document.body.appendChild(bar);
    bar.querySelector('.pl-play').addEventListener('click', () => {
      if (heard.paused) heard.play(); else heard.pause();
    });
    bar.querySelector('.pl-close').addEventListener('click', () => {
      heard.pause(); heardId = null; bar.classList.remove('up'); syncPlayButtons();
    });
    return bar;
  }

  const fmtClock = (t) => Number.isFinite(t)
    ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00';

  function syncPlayButtons() {
    document.querySelectorAll('.sub-play').forEach((b) => {
      const on = Number(b.dataset.sub) === heardId && !heard.paused;
      b.innerHTML = on ? PAUSE_SVG : PLAY_SVG;
      b.classList.toggle('on', on);
    });
    const bar = document.getElementById('arPlayer');
    if (bar) bar.querySelector('.pl-play').innerHTML = heard.paused ? PLAY_SVG : PAUSE_SVG;
  }
  heard.addEventListener('play', syncPlayButtons);
  heard.addEventListener('pause', syncPlayButtons);
  heard.addEventListener('timeupdate', () => {
    const bar = document.getElementById('arPlayer');
    if (bar) bar.querySelector('.pl-time').textContent = fmtClock(heard.currentTime);
  });
  heard.addEventListener('error', () => {
    const bar = document.getElementById('arPlayer');
    if (bar) bar.querySelector('.pl-artist').textContent = 'could not play that file';
  });

  function wirePlayers(scope, items) {
    scope.querySelectorAll('.sub-play').forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.dataset.sub);
      if (heardId === id) { heard.paused ? heard.play() : heard.pause(); return; }
      const it = items.find((x) => x.id === id);
      heardId = id;
      const bar = playerBar();
      bar.querySelector('.pl-title').textContent = (it && it.title) || 'your upload';
      bar.querySelector('.pl-artist').textContent = 'your upload';
      bar.classList.add('up');
      heard.src = `/api/artist/file?id=${id}`;
      heard.play().catch(() => {
        bar.querySelector('.pl-artist').textContent = 'could not play that file';
      });
      syncPlayButtons();
    }));
  }

  /* ── the door ──────────────────────────────────────────────────────────
     When the library is full, an artist should meet a sentence, not a dead
     form and not an error code. The drop zone goes away entirely — a control
     that looks usable and is not is worse than one that is absent — and the
     space it leaves says why and takes an address, so a closure captures
     interest instead of losing it. */
  async function checkDoor() {
    let texts = {};
    try { texts = (await get('/texts')).texts || {}; } catch { return; }
    const mode = (texts['config.submissions-open'] || 'auto').trim();
    const auto = (texts['config.submissions-auto'] || 'open').trim();
    const closed = mode === 'closed' || (mode === 'auto' && auto === 'closed');
    DOOR.closed = closed;
    DOOR.why = (texts['config.submissions-closed-why'] || '').trim()
      || 'We are not taking new music at the moment — our library is full while we '
       + 'work through what artists have already sent us.';
    if (!closed) return;

    const drop = $('#arDrop');
    if (drop) drop.hidden = true;
    const host = $('#arStaged');
    if (!host || document.getElementById('arClosed')) return;
    const box = document.createElement('div');
    box.className = 'ar-closed';
    box.id = 'arClosed';
    box.innerHTML = `
      <h3>The door is shut for now</h3>
      <p>${esc(DOOR.why)}</p>
      <p>We would genuinely love to hear yours when we open again — leave your
         address and you will be the first to know.</p>
      <div class="ar-closed-row">
        <input type="email" id="arWait" placeholder="you@example.com" autocomplete="email">
        <button type="button" class="mbtn mbtn-solid" id="arWaitGo">Tell me when</button>
      </div>
      <span class="ar-closed-said" id="arWaitSaid"></span>`;
    host.parentElement.insertBefore(box, host);
    const go = $('#arWaitGo'), input = $('#arWait'), said = $('#arWaitSaid');
    go.addEventListener('click', async () => {
      const email = (input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { input.focus(); return; }
      go.disabled = true; said.textContent = 'Saving…';
      const r = await post('/waitlist', { email, kind: 'artist-submissions' });
      said.textContent = r && r.ok
        ? 'Got it. We will write to you the day we reopen.'
        : 'That did not save — try again in a moment.';
      if (r && r.ok) input.disabled = true;
    });
  }

  function say(msg) { upStatus.textContent = msg; upStatus.hidden = false; }

  /* An open question from us, and the box to answer it. Drawn from the same
     thread the dashboard writes, so there is one record of what was asked. */
  function askBlock(s) {
    let m = {};
    try { m = JSON.parse(s.meta || '{}') || {}; } catch {}
    const thread = Array.isArray(m.questions) ? m.questions : [];
    const open = [...thread].reverse().find((q) => !q.a);
    const answered = thread.filter((q) => q.a);
    return `
      ${answered.map((q) => `<div class="qa-done"><b>We asked:</b> ${esc(q.q)}
        <br><b>You said:</b> ${esc(q.a)}</div>`).join('')}
      ${open ? `<div class="qa-open">
        <p class="qa-q"><b>We need one thing before this can go further:</b><br>${esc(open.q)}</p>
        <textarea class="qa-text" rows="3" placeholder="Your answer"></textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <button type="button" class="mbtn mbtn-solid qa-send" data-qid="${esc(open.qid || '')}">Send answer</button>
          <span class="ar-status qa-msg" style="margin:0"></span>
        </div></div>` : ''}`;
  }

  function paintList(items) {
    const ul = $('#arList');
    if (!items.length) {
      ul.innerHTML = '<li style="color:var(--muted)">Nothing yet — your uploads appear here.</li>';
      return;
    }
    /* Grouped, because a flat list by upload date buries the one thing that
       needs the artist: a question they have not answered. Order is what is
       blocked on them, then what is blocked on us, then what is done. */
    const GROUPS = [
      ['info',     'Needs your answer', 'These are held until you reply.'],
      ['pending',  'With us',           'We are listening. Nothing needed from you.'],
      ['approved', 'Accepted',          'Taken for the catalogue.'],
      ['rejected', 'Not this time',     ''],
    ];
    const meta1 = (s) => { try { return JSON.parse(s.meta || '{}') || {}; } catch { return {}; } };
    const mins = (sec) => sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '';

    const rowFor = (s) => {
      const m = meta1(s);
      const facts = [mins(m.duration), m.bpm ? `${m.bpm} BPM` : '',
                     m.key ? `${m.key}${m.scale ? ' ' + m.scale : ''}` : '',
                     m.vocal || ''].filter(Boolean);
      const flags = Array.isArray(m.rights_flags) ? m.rights_flags : [];
      return `
      <li class="sub-row" data-sub="${s.id}">
        <button type="button" class="sub-play" data-sub="${s.id}"
          aria-label="Play ${esc(s.title)}">${PLAY_SVG}</button>
        <div class="sub-art${m.cover ? ' has' : ''}">${m.cover
          ? `<img src="${esc(m.cover)}" alt="" loading="lazy">` : '<span>art</span>'}</div>
        <div class="sub-main">
          <div class="sub-line">
            <b class="sub-title">${esc(s.title)}</b>
            <span class="ar-badge ${s.status}">${STATUS_WORD[s.status] || s.status}</span>
            ${s.lane === 'quote' ? '<span class="ar-badge">quote only</span>' : ''}
            ${s.published_slug
              ? `<a class="sub-live" href="/mutra.html?q=${encodeURIComponent(s.title)}"
                   target="_blank" rel="noopener">live in the catalogue ↗</a>` : ''}
          </div>
          <div class="sub-facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}
            <span class="sub-dim">${fmtSize(s.size)} · ${fmtDate(s.created_at)}</span></div>
          ${(m.tags || []).length
            ? `<div class="sub-tags">${m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${flags.length
            ? `<p class="sub-flag">${esc(flags[0].why)}</p>` : ''}
          ${s.status !== 'info' && s.review_note ? `<p class="ar-rnote">“${esc(s.review_note)}”</p>` : ''}
        </div>
        <button type="button" class="ar-addrow sub-edit">Edit details</button>
        ${askBlock(s)}
        <div class="sub-form" hidden></div>
      </li>`;
    };

    const seen = new Set();
    let html = '';
    for (const [key, label, blurb] of GROUPS) {
      const inGroup = items.filter((s) => s.status === key);
      inGroup.forEach((s) => seen.add(s.id));
      if (!inGroup.length) continue;
      html += `<li class="sub-group"><h3>${label}<span>${inGroup.length}</span></h3>${
        blurb ? `<p>${blurb}</p>` : ''}</li>` + inGroup.map(rowFor).join('');
    }
    // Anything with a status we do not have a bucket for still has to appear.
    const rest = items.filter((s) => !seen.has(s.id));
    if (rest.length) html += `<li class="sub-group"><h3>Other<span>${rest.length}</span></h3></li>`
      + rest.map(rowFor).join('');
    ul.innerHTML = html;
    wirePlayers(ul, items);

    /* Answering in place. The alternative was "reply to the email", which
       works until they reply from a different address, or answer half of it,
       or the mail lands in spam — and then the track just sits there. */
    ul.querySelectorAll('.qa-send').forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('li');
      const ta = li.querySelector('.qa-text');
      const msg = li.querySelector('.qa-msg');
      const answer = ta.value.trim();
      if (!answer) { ta.focus(); return; }
      b.disabled = true; msg.textContent = 'Sending…';
      const r = await post('/artist/answer', {
        id: Number(li.dataset.sub), qid: b.dataset.qid, answer,
      });
      if (r && r.ok) {
        msg.textContent = 'Thank you — back with us now.';
        const d = await get('/artist/uploads');
        paintList(d.uploads || []);
      } else { b.disabled = false; msg.textContent = 'Did not go through. Try again?'; }
    }));

    /* Editing after the fact. The declaration is signed and stays signed — this
       only touches what the track IS, never who owns it or what was approved. */
    ul.querySelectorAll('.sub-edit').forEach((b) => b.addEventListener('click', () => {
      const li = b.closest('li'), box = li.querySelector('.sub-form');
      const s = items.find((x) => x.id === Number(li.dataset.sub));
      if (!box.hidden) { box.hidden = true; b.textContent = 'Edit details'; return; }
      let m = {};
      try { m = JSON.parse(s.meta || '{}') || {}; } catch {}
      b.textContent = 'Close';
      box.hidden = false;
      box.innerHTML = `
        <label class="ar-field"><span>Title</span>
          <input class="se-title" maxlength="120" value="${esc(s.title)}"></label>
        <div class="sub-grid">
          <label class="ar-field"><span>BPM</span>
            <input class="se-bpm" type="number" min="1" max="399" value="${m.bpm || ''}"></label>
          <label class="ar-field"><span>Key</span>
            <input class="se-key" maxlength="3" value="${esc(m.key || '')}"></label>
          <label class="ar-field"><span>Scale</span>
            <input class="se-scale" maxlength="8" value="${esc(m.scale || '')}"></label>
          <label class="ar-field"><span>Voice</span>
            <input class="se-vocal" maxlength="14" value="${esc(m.vocal || '')}"></label>
        </div>
        <label class="ar-field"><span>Tags</span>
          <input class="se-tags" list="dl-uptags" value="${esc((m.tags || []).join(', '))}"></label>
        <label class="ar-field"><span>Lyrics</span>
          <textarea class="se-lyrics" rows="3">${esc(m.lyrics || '')}</textarea></label>
        <label class="ar-field"><span>Streaming links</span>
          <textarea class="se-links" rows="2">${(m.links || []).map((l) => l.url).join('\n')}</textarea></label>
        <div class="ar-field"><span>Artwork</span>
          <div class="se-artrow">
            <div class="se-artimg${m.cover ? ' has' : ''}">${m.cover
              ? `<img src="${esc(m.cover)}" alt="">` : '<span>none yet</span>'}</div>
            <div>
              <label class="ar-addrow se-artpick">Choose a picture
                <input type="file" class="se-artfile" accept="image/jpeg,image/png,image/webp" hidden></label>
              <p class="up-note" style="margin:6px 0 0">Square looks best. Up to 6MB.
                Without one we generate a plain card so the row is never broken.</p>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="mbtn mbtn-solid se-save">Save</button>
          <button type="button" class="ar-addrow se-anal">Analyze the audio</button>
          <span class="ar-status se-msg" style="margin:0"></span>
        </div>`;

      const msg = box.querySelector('.se-msg');

      /* Artwork was the one piece of metadata an artist could not supply:
         cover upload existed but was admin-only and keyed by PUBLISHED slug,
         so it was unreachable for the whole stretch before a track goes live. */
      const artFile = box.querySelector('.se-artfile');
      if (artFile) artFile.addEventListener('change', async () => {
        const f = artFile.files && artFile.files[0];
        if (!f) return;
        if (f.size > 6 * 1024 * 1024) { msg.textContent = 'That picture is over 6MB.'; return; }
        msg.textContent = 'Uploading artwork…';
        try {
          const r = await fetch(`/api/artist/artwork?id=${s.id}`, {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'content-type': f.type }, body: f,
          }).then((x) => x.json());
          if (!r || !r.ok) { msg.textContent = FRIENDLY[r && r.error] || 'That picture would not upload.'; return; }
          const slot = box.querySelector('.se-artimg');
          slot.classList.add('has');
          slot.innerHTML = `<img src="${r.url}" alt="">`;
          msg.textContent = 'Artwork saved.';
          const d = await get('/artist/uploads');
          paintList(d.uploads || []);
        } catch { msg.textContent = 'That picture would not upload.'; }
      });
      box.querySelector('.se-anal').onclick = async (e) => {
        if (!window.mutraReanalyse) { msg.textContent = 'Analyser not loaded.'; return; }
        e.target.disabled = true;
        try {
          const r = await mutraReanalyse.analyseSubmission(s.id, (st) => { msg.textContent = st; });
          if (r.bpm) box.querySelector('.se-bpm').value = r.bpm;
          if (r.key) box.querySelector('.se-key').value = r.key;
          if (r.scale) box.querySelector('.se-scale').value = r.scale;
          if (r.vocal) box.querySelector('.se-vocal').value = r.vocal;
          msg.textContent = mutraReanalyse.describe(r) + ' — check it, then Save.';
        } catch (err) { msg.textContent = 'Could not analyse: ' + (err.message || err); }
        e.target.disabled = false;
      };

      box.querySelector('.se-save').onclick = async (e) => {
        e.target.disabled = true;
        const v = (sel) => box.querySelector(sel).value.trim();
        const meta = {
          bpm: Number(v('.se-bpm')) || null,
          key: v('.se-key') || null,
          scale: v('.se-scale') || null,
          vocal: v('.se-vocal') || null,
          lyrics: v('.se-lyrics'),
          tags: v('.se-tags').split(',').map(canonTag).filter(Boolean).slice(0, 12),
          links: window.mutraAnalyse ? mutraAnalyse.findLinks(v('.se-links')) : [],
        };
        try {
          await api('/artist/submissions/update', { id: s.id, title: v('.se-title'), meta });
          msg.textContent = 'Saved.';
          const d = await get('/artist/uploads');
          paintList(d.uploads || []);
        } catch (err) { msg.textContent = 'Could not save — try again.'; e.target.disabled = false; }
      };
    }));
  }

  /* ── the artist's own public profile ──────────────────────────────────────
     Posts to the same /artists/profiles the owner uses; the server allows it
     only when the pid is your own. One implementation of the field rules means
     self-service and admin cannot drift apart. */
  let profile = null;
  async function paintProfile(isArtist) {
    const card = $('#arProfile');
    /* `artist` is not on the session object — /api/me never returns it. It comes
       back from /artist/uploads, so the caller passes it in; reading
       M.user.artist here left the card permanently hidden. */
    if (!M.user || !isArtist) { card.hidden = true; return; }
    try { profile = await get('/artist/profile'); } catch { card.hidden = true; return; }
    card.hidden = false;
    $('#apName').value = profile.name || '';
    $('#apBio').value = profile.bio || '';
    $('#apLinks').value = (profile.links || []).map((l) => l.url).join('\n');
    const img = $('#apPhoto'), hint = $('#apPhotoHint');
    if (profile.avatar) { img.src = profile.avatar; img.hidden = false; hint.hidden = true; }
    else { img.hidden = true; hint.hidden = false; }
  }

  $('#apPhotoWrap').addEventListener('click', () => $('#apPhotoFile').click());
  $('#apPhotoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !profile) return;
    const msg = $('#apMsg');
    msg.textContent = 'Uploading…';
    try {
      const r = await fetch('/api/artists/photo?pid=' + encodeURIComponent(profile.pid), {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'content-type': f.type }, body: f,
      }).then((x) => x.json());
      if (!r.url) throw new Error(r.error || 'failed');
      $('#apPhoto').src = r.url; $('#apPhoto').hidden = false; $('#apPhotoHint').hidden = true;
      msg.textContent = 'Photo saved.';
    } catch { msg.textContent = 'Could not upload that image.'; }
    e.target.value = '';
  });

  $('#apSave').addEventListener('click', async () => {
    if (!profile) return;
    const msg = $('#apMsg');
    msg.textContent = 'Saving…';
    const links = $('#apLinks').value.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((url) => ({ platform: platformOf(url), url })).slice(0, 12);
    try {
      await api('/artists/profiles', {
        pid: profile.pid, name: $('#apName').value.trim(),
        bio: $('#apBio').value.trim(), links,
      });
      msg.textContent = 'Saved.';
      await paintProfile();
    } catch { msg.textContent = 'Could not save — check the name is at least 2 characters.'; }
  });

  /** Name a link by its host, so the profile does not ask people to label them. */
  function platformOf(url) {
    const h = (url.match(/^https?:\/\/([^/]+)/i) || [,''])[1].toLowerCase();
    if (h.includes('spotify')) return 'Spotify';
    if (h.includes('apple')) return 'Apple Music';
    if (h.includes('youtu')) return 'YouTube';
    if (h.includes('soundcloud')) return 'SoundCloud';
    if (h.includes('bandcamp')) return 'Bandcamp';
    if (h.includes('instagram')) return 'Instagram';
    return h.replace(/^www\./, '') || 'Link';
  }

  // ── earnings: the ledger's answer to "what has my music made" ──
  function paintEarnings(earn) {
    const card = $('#arEarnings');
    const lines = (earn && earn.lines) || [];
    card.hidden = !lines.length;
    if (!lines.length) return;
    const ils = (n) => '₪' + ((n || 0) / 100).toFixed(2);
    $('#arEarnSum').innerHTML =
      `On your balance: <b style="color:var(--text)">${ils(earn.owed)}</b>`
      + (earn.paid ? ` · paid out so far: <b style="color:var(--text)">${ils(earn.paid)}</b>` : '');
    $('#arEarnList').innerHTML = lines.slice(0, 25).map((l) => `
      <li>
        <b>${esc(l.slug)}</b>
        <span style="color:var(--muted);font-size:.78rem">${
          new Date(l.created_at * 1000).toLocaleDateString()}${
          l.licence_ref ? ' · ' + esc(l.licence_ref) : ''}</span>
        <span style="font-variant-numeric:tabular-nums">${ils(l.amount_agorot)}</span>
        ${l.status === 'paid'
          ? `<span class="ar-badge approved" title="${esc(l.payout_ref || '')}">paid</span>`
          : '<span class="ar-badge pending">on balance</span>'}
      </li>`).join('');
  }

  // ── credits (any signed-in user, artist or not) ──
  function paintCredits(credits) {
    const card = $('#arCredits');
    card.hidden = !credits.length;
    if (!credits.length) return;
    $('#arCreditsList').innerHTML = credits.map((c) => `
      <li style="flex-wrap:wrap" data-id="${c.id}">
        <b>${esc(c.title)}</b>
        <span style="color:var(--muted);font-size:.8rem">by ${esc(c.artist)} · your share ${(c.share_bp / 100).toFixed(c.share_bp % 100 ? 2 : 0)}%</span>
        ${c.status === 'flagged'
          ? '<span class="ar-badge rejected">disputed</span>'
          : c.status === 'joined'
            ? '<span class="ar-badge approved">confirmed</span>'
            : `<button class="mbtn mbtn-solid ar-cok" style="padding:6px 14px;font-size:.72rem">Confirm</button>
               <button class="ar-cflag" style="background:none;border:0;color:var(--muted);cursor:pointer;font-size:.76rem;text-decoration:underline">that’s not my share</button>`}
      </li>`).join('');
    card.querySelectorAll('.ar-cok').forEach((b) => b.addEventListener('click', async () => {
      await api('/credits/respond', { id: Number(b.closest('li').dataset.id), action: 'confirm' });
      paintCredits((await get('/credits')).credits || []);
    }));
    card.querySelectorAll('.ar-cflag').forEach((b) => b.addEventListener('click', async () => {
      const note = window.prompt('What should it be? (goes to Snowstar, not the uploader)') || '';
      await api('/credits/respond', { id: Number(b.closest('li').dataset.id), action: 'flag', note });
      paintCredits((await get('/credits')).credits || []);
    }));
  }

  // ── claim countersign ──
  function paintClaim(claim) {
    const card = $('#arClaim');
    card.hidden = !claim || !claim.pending;
    if (card.hidden) return;
    $('#arClaimCount').textContent = claim.pending;
    $('#arClaimText').textContent = claim.text || '';
  }
  $('#arClaimBtn').addEventListener('click', async () => {
    const st = $('#arClaimStatus');
    const name = $('#arClaimName').value.trim();
    if (name.length < 2) { st.textContent = 'Type your full name to sign.'; st.hidden = false; return; }
    try {
      const r = await api('/claim', { signed_name: name });
      st.hidden = true;
      $('#arClaim').hidden = true;
      say(`${r.countersigned} track${r.countersigned === 1 ? '' : 's'} confirmed as yours.`);
    } catch (e) { st.textContent = 'Couldn’t sign: ' + e.message; st.hidden = false; }
  });
})();
