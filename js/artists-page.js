/* ═══════════ Artist dashboard — upload, rights declaration, credits, claims ═══
   Files start uploading the moment they're dropped (never gated on paperwork);
   the signed declaration attaches when Submit fires. One declaration covers the
   batch — tracks with different splits go in separate batches. */
(function () {
  const M = window.SnowstarAccount;
  if (!M) return;
  const $ = (s) => document.querySelector(s);
  const gate = $('#arGate'), reg = $('#arRegister'), dash = $('#arDash');
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtSize = (b) => (b / 1048576).toFixed(1) + 'MB';
  const STATUS_WORD = { pending: 'In review', approved: 'Accepted', rejected: 'Not this one' };
  const esc = (s) => String(s || '').replace(/</g, '&lt;');

  const DECL = {
    solo: `This track is entirely mine.\nI confirm that: I made this track and own all rights to it — the composition and the recording. Any samples, loops, or presets in it are ones I'm properly licensed to use in commercial work. No other person, band member, label, or publisher owns any part of it. Mutra may license it to clients worldwide, royalty-free.\nIf any of this turns out not to be true, I take responsibility for it — not Mutra, and not the clients who licensed the track in good faith.`,
    shared: `I share ownership of this track.\nI own part of this track, and the people listed own the rest. I confirm that: the list of co-owners and their shares is complete, correct, and adds up to 100%. Every co-owner knows about this submission and has given me permission to submit the track and let Mutra license it to clients worldwide, royalty-free. Any samples, loops, or presets in it are properly licensed for commercial use. Mutra may contact each co-owner at the details I've provided so they can claim their share of the track's income.\nIf any of this turns out not to be true, I take responsibility for it — not Mutra, not my co-owners, and not the clients who licensed the track in good faith.`,
    behalf: `Submitted by Snowstar on behalf of the credited artist.\nI confirm that the credited artist has confirmed to me that the ownership details above are correct and that they authorize Mutra to license this track to clients worldwide, royalty-free. Where written confirmation exists, it is noted here and kept on file.`,
  };

  $('#arSignin').addEventListener('click', () => window.SnowstarOpenAuth && SnowstarOpenAuth('signup',
    'Create your free account to start uploading music.'));

  async function api(path, body) {
    const res = await fetch('/api' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'request_failed');
    return d;
  }
  const get = (path) => fetch('/api' + path, { credentials: 'same-origin' }).then((r) => r.json());

  // ── state machine: gate / register / dashboard, plus credits & claims ──
  let lastUser = null;
  async function render() {
    const u = M.user;
    gate.hidden = !!u;
    if (!u) { reg.hidden = true; dash.hidden = true; $('#arCredits').hidden = true; $('#arClaim').hidden = true; lastUser = null; return; }
    if (u === lastUser && !dash.hidden) return;
    lastUser = u;
    try {
      const [d, credits, claim] = await Promise.all([
        get('/artist/uploads'), get('/credits'), get('/claim'),
      ]);
      reg.hidden = !!d.artist;
      dash.hidden = !d.artist;
      if (d.artist) {
        $('#arWho').textContent = d.artist_name || '';
        $('#arName').value = d.artist_name || '';
        paintList(d.uploads || []);
        if (u.admin) initBehalf();
      }
      paintCredits(credits.credits || []);
      paintClaim(claim);
    } catch { /* leave as-is */ }
  }
  M.onChange(render);
  render();

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
  let staged = []; // {file, title, key, pct, error}

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
          xhr.status === 200 ? resolve(d) : reject(new Error(d.error || 'upload_failed'));
        } catch { reject(new Error('upload_failed')); }
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
      const item = { file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), key: null, pct: 0, error: null };
      staged.push(item);
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
    ul.innerHTML = staged.map((s, i) => `
      <li><b>${esc(s.title)}</b>
        <span style="color:var(--muted);font-size:.8rem">${
          s.error ? '⚠ ' + esc(s.error) : s.key ? 'uploaded ✓' : 'uploading… ' + s.pct + '%'}</span>
        <button type="button" data-i="${i}" class="ar-unstage" style="background:none;border:0;color:var(--muted);cursor:pointer">✕</button></li>`).join('');
    ul.querySelectorAll('.ar-unstage').forEach((b) => b.addEventListener('click', () => {
      staged.splice(Number(b.dataset.i), 1); paintStaged();
    }));
    syncDecl();
  }

  // ── the declaration form ──
  document.querySelectorAll('[name="arKind"]').forEach((r) => r.addEventListener('change', syncDecl));
  $('#arAgree').addEventListener('change', syncDecl);
  $('#arSign').addEventListener('input', syncDecl);
  $('#arAddCollab').addEventListener('click', () => addCollabRow());

  function addCollabRow(pre) {
    const row = document.createElement('div');
    row.className = 'ar-crow';
    row.innerHTML = `<input placeholder="Full name" maxlength="120" data-f="name">
      <input placeholder="their@email.com" type="email" maxlength="254" data-f="email">
      <input placeholder="%" inputmode="decimal" data-f="pct">
      <button type="button" title="Remove">✕</button>`;
    row.querySelector('button').addEventListener('click', () => { row.remove(); syncDecl(); });
    row.querySelectorAll('input').forEach((i) => i.addEventListener('input', syncDecl));
    $('#arCollabRows').appendChild(row);
  }

  function collabData() {
    return [...document.querySelectorAll('#arCollabRows .ar-crow')].map((row) => ({
      name: row.querySelector('[data-f="name"]').value.trim(),
      email: row.querySelector('[data-f="email"]').value.trim(),
      share_pct: parseFloat(row.querySelector('[data-f="pct"]').value) || 0,
    })).filter((c) => c.name || c.email || c.share_pct);
  }

  function syncDecl() {
    const behalf = behalfMode();
    const kind = behalf ? 'behalf' : (document.querySelector('[name="arKind"]:checked') || {}).value || 'solo';
    $('#arDeclText').textContent = DECL[behalf ? 'behalf' : kind];
    $('#arEvidence').hidden = !behalf;
    const shared = kind === 'shared';
    $('#arCollabs').hidden = !(shared || behalf);
    if ((shared || behalf) && !document.querySelector('#arCollabRows .ar-crow') && shared) addCollabRow();

    let sharesOk = true;
    const collabs = collabData();
    if (shared || (behalf && collabs.length)) {
      // mirror the server exactly: whole-basis-point math, no float drift
      const bps = collabs.map((c) => Math.round(c.share_pct * 100));
      const leftBp = 10000 - bps.reduce((a, b) => a + b, 0);
      const who = behalf ? 'the artist' : 'you';
      $('#arShareLeft').textContent = leftBp >= 1
        ? `That leaves ${who} with ${Number((leftBp / 100).toFixed(2))}%.`
        : `Shares total ${Number(((10000 - leftBp) / 100).toFixed(2))}% — ${who} must keep a share.`;
      sharesOk = leftBp >= 1 && collabs.every((c, i) =>
        c.name.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) && bps[i] >= 1);
      if (shared && !collabs.length) sharesOk = false;
    } else {
      $('#arShareLeft').textContent = '';
    }

    const filesReady = staged.length > 0 && staged.every((s) => s.key || s.error) && staged.some((s) => s.key);
    const signed = $('#arAgree').checked && $('#arSign').value.trim().length >= 2;
    const btn = $('#arSubmit');
    btn.disabled = !(filesReady && signed && sharesOk);
    const n = staged.filter((s) => s.key).length;
    btn.textContent = n ? `Submit ${n} track${n === 1 ? '' : 's'}` : 'Submit';
  }

  $('#arSubmit').addEventListener('click', async () => {
    const btn = $('#arSubmit');
    btn.disabled = true;
    try {
      const behalf = behalfMode();
      const managedId = behalf ? await resolveManagedArtist() : null;
      const kind = behalf ? 'behalf' : (document.querySelector('[name="arKind"]:checked') || {}).value || 'solo';
      const collabs = (kind === 'shared' || behalf) ? collabData() : [];
      const declaration = {
        kind,
        signed_name: $('#arSign').value.trim(),
        acum: $('#arAcum').checked,
        collaborators: collabs,
        evidence_kind: behalf ? $('#arEvKind').value : undefined,
        evidence_note: behalf ? $('#arEvNote').value.trim() : undefined,
      };
      const note = $('#arNote').value.trim();
      let done = 0;
      for (const s of staged.filter((x) => x.key && !x.submitted)) {
        await api('/artist/submissions', {
          title: s.title, key: s.key, note, declaration,
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
      document.querySelectorAll('#arCollabRows .ar-crow').forEach((r) => r.remove());
      say(`${done} track${done === 1 ? '' : 's'} submitted — ${behalf ? 'they’re in the review queue.' : 'we listen to everything and you’ll see the verdict here.'}`);
      const d = await get('/artist/uploads');
      paintList(d.uploads || []);
    } catch (e) {
      say('Couldn’t submit: ' + e.message);
    }
    syncDecl();
  });

  function say(msg) { upStatus.textContent = msg; upStatus.hidden = false; }

  function paintList(items) {
    const ul = $('#arList');
    if (!items.length) {
      ul.innerHTML = '<li style="color:var(--muted)">Nothing yet — your uploads appear here.</li>';
      return;
    }
    ul.innerHTML = items.map((s) => `
      <li style="flex-wrap:wrap">
        <b>${esc(s.title)}</b>
        <span style="color:var(--muted);font-size:.8rem">${fmtSize(s.size)} · ${fmtDate(s.created_at)}</span>
        <span class="ar-badge ${s.status}">${STATUS_WORD[s.status] || s.status}</span>
        ${s.review_note ? `<span class="ar-rnote">“${esc(s.review_note)}”</span>` : ''}
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
