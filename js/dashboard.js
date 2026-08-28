/* ═══════════ Owner dashboard — stats, members, artists, submissions, mail ═══
   One page for everything the owner checks: the analytics that lived on
   stats.html, the review queue and outbox from review.html, plus the artist
   roster. Old URLs redirect here. Owner-only — everyone else gets the gate. */
(function () {
  const app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');
  const fmt = (ts) => new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtD = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtDur = (s) => { s = Math.round(s); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /* Fifteen tabs in one row read as fifteen unrelated things. Grouped by WHOSE
     work they are: the people buying, the people supplying, and the machine.
     The order inside each group is the order you actually touch them. */
  const GROUPS = [
    ['User',   ['overview', 'stats', 'inbox', 'members', 'licensing', 'coupons', 'invoices', 'jobs']],
    ['Artist', ['submissions', 'artists', 'clearlist', 'upload']],
    ['Admin',  ['pricing', 'packs', 'characters', 'notifications', 'alerts', 'storage', 'pipeline']],
  ];
  const TABS = GROUPS.flatMap(([, t]) => t);
  let tab = (location.hash || '').replace('#', '');
  if (!TABS.includes(tab)) tab = 'overview';
  let days = 30, subTab = 'pending';
  /* Which submission rows are open. Module-level because every review action
     ends in load(), which rebuilds the list from scratch — kept anywhere more
     local and a row would slam shut the moment you approved the track in it. */
  const openSubs = new Set();

  const get = (p) => fetch('/api' + p, { credentials: 'same-origin' }).then((r) => {
    if (r.status === 403) throw new Error('forbidden');
    return r.json();
  });
  const post = (p, body) => fetch('/api' + p, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());

  function gate() {
    app.innerHTML = `<div class="db-gate"><h1 style="font-family:var(--font-display)">Dashboard</h1>
      <p style="color:var(--muted);margin:14px 0 22px">This page is for the site owner.</p>
      <a class="mbtn mbtn-solid" href="index.html">Back to the site</a></div>`;
  }

  function table(rows, cols, opts = {}) {
    if (!rows.length) return '<p class="db-empty">Nothing yet.</p>';
    const max = opts.barKey ? Math.max(...rows.map((r) => r[opts.barKey] || 0)) : 0;
    return `<table><thead><tr>${cols.map((c) => `<th${c.num ? ' style="text-align:right"' : ''}>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map((c) => {
        let v = c.get(r);
        if (c.bar && max) v = `${v} <span class="bar" style="width:${Math.round((r[opts.barKey] / max) * 90)}px"></span>`;
        return `<td class="${c.num ? 'num' : ''}">${v}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
  }

  const shell = (inner) => `
    <div class="db-head">
      <h1>Dashboard</h1>
      <div class="db-groups">${GROUPS.map(([name, tabs]) => `
        <div class="db-group">
          <span class="db-glabel">${name}</span>
          <div class="db-tabs">${tabs.map((t) =>
            `<button class="db-tab ${t === tab ? 'active' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
        </div>`).join('')}</div>
    </div>${inner}`;

  function paint(inner) {
    app.innerHTML = shell(inner);
    app.querySelectorAll('.db-tab').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.t;
      history.replaceState(null, '', '#' + tab);
      load();
    }));
  }

  async function load() {
    /* `return await`, not `return`. Returning the promise from inside the try
       hands the rejection to nobody — a signed-out visitor got an uncaught
       "forbidden" in the console instead of the sign-in gate below. */
    try {
      if (tab === 'overview') return await paintOverview();
      if (tab === 'stats') return await paintStats();
      if (tab === 'members') return await paintMembers();
      if (tab === 'artists') return await paintArtists();
      if (tab === 'submissions') return await paintSubmissions();
      if (tab === 'notifications') return await paintMail();
      if (tab === 'licensing') return await paintLicensing();
      if (tab === 'inbox') return await paintInbox();
      if (tab === 'jobs') return await paintJobs();
      if (tab === 'coupons') return await paintCoupons();
      if (tab === 'invoices') return await paintInvoices();
      if (tab === 'packs') return await paintCollections('pack');
      if (tab === 'characters') return await paintCollections('character');
      if (tab === 'pricing') return await paintPricing();
      if (tab === 'alerts') return await paintAlerts();
      if (tab === 'storage') return await paintStorage();
      if (tab === 'upload') return await paintUpload();
      if (tab === 'clearlist') return await paintClearlistAdmin();
      if (tab === 'pipeline') return await paintPipeline();
    } catch (e) {
      if (e.message === 'forbidden') gate();
      else paint(`<p class="db-empty">Couldn’t load that right now — try a refresh.</p>`);
    }
  }



  /* ── approve / reject, with somewhere to say why ──────────────────────────
     A native prompt() cannot be styled, cannot be reopened, blocks the page
     while it is up, and — the reason it had to go — is indistinguishable from
     a browser warning, so it read as an error rather than a question. This is
     a field under the row, which also means the note can be written while the
     declaration is open next to it. */
  function openReviewNote(item, status) {
    const box = item.querySelector('.rv-review');
    if (!box) return;
    const approving = status === 'approved';
    box.hidden = false;
    box.innerHTML = `
      <label class="rv-fld"><span>${approving
        ? 'Note to the artist (optional)'
        : 'Tell them why — they will see this'}</span>
        <textarea class="rv-rnote" rows="2" placeholder="${approving
          ? 'Anything you want them to know'
          : 'The reason, in your words'}"></textarea></label>
      <div class="rv-racts">
        <button type="button" class="rv-btn ${approving ? 'rv-ok' : 'rv-no'} rv-rgo">${
          approving ? 'Approve and notify' : 'Reject and notify'}</button>
        <button type="button" class="rv-btn rv-rcancel">Cancel</button>
      </div>
      <p class="rv-hint">The artist is emailed either way — the notification is
        queued in Notifications, and nothing leaves without you approving it there.</p>`;
    const ta = box.querySelector('.rv-rnote');
    ta.focus();
    box.querySelector('.rv-rcancel').addEventListener('click', () => {
      box.hidden = true; box.innerHTML = '';
    });
    box.querySelector('.rv-rgo').addEventListener('click', () => {
      if (!approving && !ta.value.trim()) {
        // A rejection with no reason is the one case worth blocking: the artist
        // gets an email that tells them nothing and they will just ask.
        ta.focus();
        box.querySelector('.rv-hint').textContent = 'A reason, please — they only get this once.';
        return;
      }
      commitReview(item, status, ta.value.trim());
    });
  }

  async function commitReview(item, status, note) {
    const id = Number(item.dataset.id);
    const go = item.querySelector('.rv-rgo');
    if (go) { go.disabled = true; go.textContent = 'Saving…'; }
    const r = await post('/submissions/review', { id, status, note });
    if (r && r.error) {
      if (go) { go.disabled = false; go.textContent = 'Try again'; }
      return;
    }
    load();
  }

  /** Amend a filed declaration. The signed text and signature are never
      touched — that is the legal artefact. This edits the routing copy on
      top of it: title, splits, controllers, the ACUM flag and the lane,
      which is what decides who gets paid and whether a track can self-serve.
      A genuine SHARE change still needs a fresh signature from the artist. */
  function openDeclEditor(item, items) {
    const box = item.querySelector('.rv-editor');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    const id = Number(item.dataset.id);
    const s = items.find((x) => x.id === id) || {};
    let collabs = [];
    try { collabs = JSON.parse(s.collabs || '[]'); } catch {}
    let ctrl = {};
    try { ctrl = JSON.parse(s.controllers || '{}'); } catch {}
    const controllers = ctrl.controllers || [];

    const cRow = (c = {}) => `
      <div class="rv-crow">
        <input placeholder="Name" value="${esc(c.name || '')}" data-f="name">
        <input placeholder="their@email.com" value="${esc(c.email || '')}" data-f="email">
        <input placeholder="%" value="${c.share_bp ? c.share_bp / 100 : ''}" data-f="pct">
        <button type="button" class="rv-x">✕</button>
      </div>`;
    const kRow = (c = {}) => `
      <div class="rv-krow">
        <input placeholder="Label, publisher or agent" value="${esc(c.name || '')}" data-f="name">
        <select data-f="scope">${['recording', 'song', 'both'].map((o) =>
          `<option${c.scope === o ? ' selected' : ''}>${o}</option>`).join('')}</select>
        <input placeholder="Territory" value="${esc(c.territory || '')}" data-f="territory">
        <button type="button" class="rv-x">✕</button>
      </div>`;

    box.hidden = false;
    box.innerHTML = `
      <label class="rv-fld"><span>Title</span><input class="rv-title" value="${esc(s.title || '')}" maxlength="200"></label>
      <div class="rv-fld"><span>Splits — co-owners</span><div class="rv-collabs">${collabs.map(cRow).join('')}</div>
        <button type="button" class="rv-add" data-add="collab">＋ Add co-owner</button>
        <p class="rv-hint">Editing a share here changes who gets paid but does <b>not</b> re-sign anything — the snapshot inside the signed declaration stays as filed. A real change of share needs a fresh signature from the artist.</p></div>
      <div class="rv-fld"><span>Controlled by</span><div class="rv-ctrls">${controllers.map(kRow).join('')}</div>
        <button type="button" class="rv-add" data-add="ctrl">＋ Add</button></div>
      <label class="rv-chk"><input type="checkbox" class="rv-acumbox"${s.acum ? ' checked' : ''}>
        <span>Registered with ACUM or another society</span></label>
      <label class="rv-fld"><span>Lane</span><select class="rv-lanesel">
        <option value="quote"${s.lane !== 'instant' ? ' selected' : ''}>Custom quote</option>
        <option value="instant"${s.lane === 'instant' ? ' selected' : ''}>Instant licence</option>
      </select></label>
      <div class="rv-acts"><button type="button" class="rv-btn rv-ok rv-savedecl">Save changes</button>
        <span class="rv-stat"></span></div>`;

    const bind = () => box.querySelectorAll('.rv-x').forEach((x) =>
      x.addEventListener('click', () => { x.parentElement.remove(); }));
    bind();
    box.querySelectorAll('.rv-add').forEach((b) => b.addEventListener('click', () => {
      const which = b.dataset.add;
      const host = box.querySelector(which === 'collab' ? '.rv-collabs' : '.rv-ctrls');
      host.insertAdjacentHTML('beforeend', which === 'collab' ? cRow() : kRow());
      bind();
    }));

    box.querySelector('.rv-savedecl').addEventListener('click', async () => {
      const stat = box.querySelector('.rv-stat');
      stat.textContent = 'Saving…';
      const read = (sel, fields) => [...box.querySelectorAll(sel)].map((r) => {
        const o = {};
        fields.forEach((f) => { o[f] = r.querySelector(`[data-f="${f}"]`).value.trim(); });
        return o;
      });
      const body = {
        id,
        title: box.querySelector('.rv-title').value,
        acum: box.querySelector('.rv-acumbox').checked,
        lane: box.querySelector('.rv-lanesel').value,
        collaborators: read('.rv-crow', ['name', 'email', 'pct'])
          .filter((c) => c.name || c.email).map((c) => ({ name: c.name, email: c.email, share_pct: parseFloat(c.pct) || 0 })),
        controllers: read('.rv-krow', ['name', 'scope', 'territory']).filter((c) => c.name),
      };
      try {
        const r = await fetch('/api/submissions/amend', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'failed');
        stat.textContent = 'Saved.';
        setTimeout(load, 500);
      } catch (e) {
        stat.textContent = e.message === 'shares_exceed_100'
          ? 'Those shares add up to more than 100%.' : 'Couldn’t save that.';
      }
    });
  }


  /* ── upload: the same two-step flow artists.html uses (file to R2 first,
        declaration on submit), for uploading as yourself or on behalf of a
        managed artist who will countersign later. ── */
  let upStaged = [];
  let upNextId = 1;

  async function paintUpload() {
    let managed = [];
    try { managed = (await get('/artistreg')).artists || []; } catch {}
    paint(`
      <section class="db-card">
        <h3>Upload tracks</h3>
        <label class="up-field"><span>Official artist name</span>
          <select id="upAs">
            <option value="">Myself</option>
            ${managed.map((a) => `<option value="${a.id}">${esc(a.name)}${a.claimed_user_id ? ' ✓ claimed' : ''}${a.email ? '' : ' · no profile yet'}</option>`).join('')}
            <option value="new">＋ New artist…</option>
          </select></label>
        <div class="up-field"><span>Also credit</span>
          <div id="upAlsoRows"></div>
          <button type="button" class="rv-add" id="upAlsoAdd">＋ Add another artist</button>
          <p class="rv-hint">Anyone added here gets a record in your roster, so you can build their
            profile and assign more tracks to them later.</p>
        </div>
        <div id="upNew" hidden class="up-2col">
          <label class="up-field"><span>Their name</span><input id="upNewName" maxlength="80"></label>
          <label class="up-field"><span>Their email</span><input id="upNewEmail" type="email" maxlength="254"></label>
        </div>
        <label class="up-drop" id="upDrop">
          <b>Drop audio here</b> or click to choose — wav, mp3, aiff, flac, m4a, ogg
          <input type="file" id="upFile" multiple accept=".wav,.mp3,.aif,.aiff,.flac,.m4a,.ogg" hidden>
        </label>
        <ul class="up-list" id="upList" hidden></ul>

        <div id="upRights" hidden>
          <div class="up-field"><span>Ownership &amp; control</span>
            <label class="up-chk"><input type="checkbox" id="upShared"> <span>Shared ownership with someone else</span></label>
            <label class="up-chk"><input type="checkbox" id="upControlled"> <span>Someone else has a say in commercial use</span></label>
          </div>
          <div id="upCollabs" hidden><div id="upCollabRows"></div>
            <button type="button" class="rv-add" id="upAddCollab">＋ Add co-owner</button>
            <p class="rv-hint" id="upShareLeft"></p></div>
          <div id="upCtrls" hidden><div id="upCtrlRows"></div>
            <button type="button" class="rv-add" id="upAddCtrl">＋ Add whoever has a say</button></div>
          <label class="up-chk"><input type="checkbox" id="upAcum"> <span>Registered with ACUM or another society</span></label>
          <blockquote class="up-decl" id="upDecl"></blockquote>
          <label class="up-chk"><input type="checkbox" id="upAgree"> <span>I confirm the above</span></label>
          <label class="up-field"><span>Type your full legal name to sign</span><input id="upSign" maxlength="120"></label>
          <p class="up-lane" id="upLane"></p>
          <button class="rv-btn rv-ok" id="upSubmit" disabled>Submit</button>
          <span class="rv-stat" id="upStat"></span>
        </div>
      </section>`);

    const $$ = (x) => document.getElementById(x);
    $$('upAs').addEventListener('change', () => { $$('upNew').hidden = $$('upAs').value !== 'new'; upSync(); });
    $$('upDrop').addEventListener('click', () => $$('upFile').click());
    ['dragover', 'dragenter'].forEach((e) => $$('upDrop').addEventListener(e, (ev) => { ev.preventDefault(); $$('upDrop').classList.add('over'); }));
    ['dragleave', 'drop'].forEach((e) => $$('upDrop').addEventListener(e, (ev) => { ev.preventDefault(); $$('upDrop').classList.remove('over'); }));
    $$('upDrop').addEventListener('drop', (ev) => upStage([...ev.dataTransfer.files]));
    $$('upFile').addEventListener('change', () => { upStage([...$$('upFile').files]); $$('upFile').value = ''; });
    ['upShared', 'upControlled', 'upAcum', 'upAgree'].forEach((id) => $$(id).addEventListener('change', upSync));
    $$('upSign').addEventListener('input', upSync);
    $$('upAddCollab').addEventListener('click', () => { upRow('upCollabRows', 'collab'); upSync(); });
    $$('upAddCtrl').addEventListener('click', () => { upRow('upCtrlRows', 'ctrl'); upSync(); });
    $$('upAlsoAdd').addEventListener('click', () => {
      const host = $$('upAlsoRows');
      host.insertAdjacentHTML('beforeend',
        `<div class="up-also"><input data-f="name" list="up-roster" placeholder="Artist or stage name" maxlength="120">
         <button type="button" class="rv-x">✕</button></div>
         <datalist id="up-roster">${managed.map((a) => `<option value="${esc(a.name)}">`).join('')}</datalist>`);
      host.querySelectorAll('.rv-x').forEach((x) => { x.onclick = () => { x.parentElement.remove(); }; });
    });
    $$('upSubmit').addEventListener('click', upSubmit);
    upStaged = [];
    upPaint();
  }

  function upRow(host, kind) {
    const el = document.getElementById(host);
    el.insertAdjacentHTML('beforeend', kind === 'collab'
      ? `<div class="rv-crow"><input placeholder="Name" data-f="name"><input placeholder="their@email.com" data-f="email"><input placeholder="%" data-f="pct"><button type="button" class="rv-x">✕</button></div>`
      : `<div class="rv-krow"><input placeholder="Label, publisher or agent" data-f="name"><select data-f="scope"><option>recording</option><option>song</option><option>both</option></select><input placeholder="Territory" data-f="territory"><button type="button" class="rv-x">✕</button></div>`);
    el.querySelectorAll('.rv-x').forEach((x) => { x.onclick = () => { x.parentElement.remove(); upSync(); }; });
    el.querySelectorAll('input,select').forEach((i) => { i.oninput = upSync; });
  }

  function upStage(files) {
    const ok = files.filter((f) => /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i.test(f.name));
    for (const f of ok) {
      if (f.size > 95 * 1024 * 1024) continue;
      const item = { _id: upNextId++, file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), key: null, pct: 0, error: null };
      upStaged.push(item);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/artist/upload?filename=' + encodeURIComponent(f.name));
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { item.pct = Math.round(e.loaded / e.total * 100); upPaint(); } };
      xhr.onload = () => {
        try { const d = JSON.parse(xhr.responseText); xhr.status === 200 ? (item.key = d.key) : (item.error = d.error || 'failed'); }
        catch { item.error = 'failed'; }
        upPaint();
      };
      xhr.onerror = () => { item.error = 'network'; upPaint(); };
      xhr.send(f);
    }
    upPaint();
  }

  function upPaint() {
    const list = document.getElementById('upList');
    if (!list) return;
    list.hidden = !upStaged.length;
    document.getElementById('upRights').hidden = !upStaged.length;
    list.innerHTML = upStaged.map((s, i) => `<li><b>${esc(s.title)}</b>
      <span>${s.error ? '⚠ ' + esc(s.error) : s.key ? 'uploaded ✓' : 'uploading… ' + s.pct + '%'}</span>
      <button type="button" data-i="${i}" class="rv-x">✕</button></li>`).join('');
    list.querySelectorAll('.rv-x').forEach((b) => { b.onclick = () => { upStaged.splice(Number(b.dataset.i), 1); upPaint(); }; });
    upSync();
  }

  const UP_DECL = {
    solo: 'This track is entirely mine. I made it and own all rights to it — the composition and the recording. Any samples, loops or presets are licensed for commercial use. Mutra may license it to clients worldwide.',
    shared: 'I share ownership of this track. The list of co-owners and their shares is complete and correct. Every co-owner has given me permission to submit it and let Mutra license it to clients worldwide.',
    behalf: 'Submitted by Snowstar on behalf of the credited artist, who has confirmed the ownership details above are correct and authorises Mutra to license this track to clients worldwide.',
  };

  function upSync() {
    const $$ = (x) => document.getElementById(x);
    if (!$$('upRights')) return;
    const behalf = $$('upAs').value !== '';
    const shared = !behalf && $$('upShared').checked;
    const controlled = !behalf && $$('upControlled').checked;
    const kind = behalf ? 'behalf' : (shared ? 'shared' : 'solo');
    $$('upDecl').textContent = UP_DECL[kind];
    $$('upCollabs').hidden = !(shared || behalf);
    $$('upCtrls').hidden = !controlled;
    if ((shared || behalf) && !$$('upCollabRows').children.length && shared) upRow('upCollabRows', 'collab');
    if (controlled && !$$('upCtrlRows').children.length) upRow('upCtrlRows', 'ctrl');

    const collabs = upRead('upCollabRows', ['name', 'email', 'pct']);
    let sharesOk = true;
    if (shared) {
      const bps = collabs.map((c) => Math.round(parseFloat(c.pct || 0) * 100));
      const left = 10000 - bps.reduce((a, b) => a + b, 0);
      $$('upShareLeft').textContent = left >= 1
        ? `That leaves you with ${Number((left / 100).toFixed(2))}%.`
        : 'Shares total more than 100% — you must keep a share.';
      sharesOk = left >= 1 && collabs.length > 0 && collabs.every((c, i) =>
        c.name.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) && bps[i] >= 1);
    } else { $$('upShareLeft').textContent = ''; }
    const ctrls = upRead('upCtrlRows', ['name', 'scope', 'territory']).filter((c) => c.name);
    const ctrlOk = !controlled || ctrls.length > 0;

    const lane = (shared || controlled || (behalf && collabs.length)) ? 'quote' : 'instant';
    const laneEl = $$('upLane');
    laneEl.className = 'up-lane ' + lane;
    laneEl.textContent = lane === 'instant'
      ? 'Clear to license — instant lane.'
      : 'Custom quote — every licence comes through you first.';

    const ready = upStaged.length && upStaged.every((s) => s.key || s.error) && upStaged.some((s) => s.key);
    const signed = $$('upAgree').checked && $$('upSign').value.trim().length >= 2;
    $$('upSubmit').disabled = !(ready && signed && sharesOk && ctrlOk);
    const n = upStaged.filter((s) => s.key).length;
    $$('upSubmit').textContent = n ? `Submit ${n} track${n === 1 ? '' : 's'}` : 'Submit';
  }

  function upRead(host, fields) {
    return [...document.getElementById(host).children].map((r) => {
      const o = {}; fields.forEach((f) => { o[f] = r.querySelector(`[data-f="${f}"]`).value.trim(); }); return o;
    }).filter((o) => o.name || o.email);
  }

  async function upSubmit() {
    const $$ = (x) => document.getElementById(x);
    const stat = $$('upStat');
    $$('upSubmit').disabled = true;
    stat.textContent = 'Submitting…';
    try {
      let managedId = null;
      const as = $$('upAs').value;
      if (as === 'new') {
        const r = await post('/managed-artists', { name: $$('upNewName').value.trim(), email: $$('upNewEmail').value.trim() });
        if (r.error) throw new Error(r.error);
        managedId = r.id;
      } else if (as) managedId = Number(as);

      // every extra credited name becomes a real roster record
      const also = [...document.querySelectorAll('#upAlsoRows [data-f="name"]')]
        .map((i) => i.value.trim()).filter((v) => v.length >= 2);
      if (also.length) { try { await post('/artistreg/ensure', { names: also }); } catch {} }

      const behalf = !!managedId;
      const shared = !behalf && $$('upShared').checked;
      const controlled = !behalf && $$('upControlled').checked;
      const declaration = {
        kind: behalf ? 'behalf' : (shared ? 'shared' : 'solo'),
        signed_name: $$('upSign').value.trim(),
        acum: $$('upAcum').checked,
        collaborators: (shared || behalf)
          ? upRead('upCollabRows', ['name', 'email', 'pct']).map((c) => ({ name: c.name, email: c.email, share_pct: parseFloat(c.pct) || 0 }))
          : [],
        controllers: controlled ? upRead('upCtrlRows', ['name', 'scope', 'territory']).filter((c) => c.name) : [],
      };
      let done = 0;
      for (const s of upStaged.filter((x) => x.key && !x.done)) {
        const r = await post('/artist/submissions', { title: s.title, key: s.key, declaration, managed_artist_id: managedId || undefined });
        if (r.error) throw new Error(r.error);
        s.done = true; done++;
      }
      upStaged = upStaged.filter((s) => !s.done);
      stat.textContent = `${done} submitted — they're in the review queue.`;
      upPaint();
    } catch (e) {
      stat.textContent = 'Couldn’t submit: ' + e.message;
      upSync();
    }
  }


  /* ── clearlist: channels licensees have asked us to whitelist ── */
  async function paintClearlistAdmin() {
    const d = await get('/channels/all');
    const P = d.platforms || {};
    const rows = d.channels || [];
    const pending = rows.filter((c) => c.status === 'pending');
    paint(`
      <div class="pl-intro">
        <h2>Clearlist</h2>
        <p>Channels licensees have asked us to whitelist. A licence doesn't stop Content ID —
        it matches audio, not paperwork — so a properly licensed track can still collect an
        automated claim unless the channel is whitelisted in advance.
        <b>${pending.length} waiting.</b></p>
      </div>
      ${rows.length ? `<table class="pl-tbl cl-admin">
        <thead><tr><th>Who</th><th>Platform</th><th>Channel</th><th>Added</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((c) => `
          <tr data-id="${c.id}">
            <td>${esc(c.name || c.email)}</td>
            <td>${esc((P[c.platform] || {}).label || c.platform)}</td>
            <td class="cl-a-val">${esc(c.value)}</td>
            <td>${fmt(c.created_at)}</td>
            <td><span class="cl-status ${esc(c.status)}">${c.status === 'cleared' ? 'cleared'
              : c.status === 'rejected' ? 'not cleared' : 'pending'}</span></td>
            <td class="cl-a-acts">
              ${c.status !== 'cleared' ? '<button class="rv-btn rv-ok" data-s="cleared">Mark cleared</button>' : ''}
              ${c.status !== 'rejected' ? '<button class="rv-btn" data-s="rejected">Can’t clear</button>' : ''}
              ${c.status !== 'pending' ? '<button class="rv-btn" data-s="pending">Back to pending</button>' : ''}
            </td>
          </tr>`).join('')}</tbody></table>`
        : '<p class="db-empty">No channels submitted yet.</p>'}`);

    app.querySelectorAll('.cl-a-acts .rv-btn').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.closest('tr').dataset.id);
      b.disabled = true;
      try { await post('/channels/status', { id, status: b.dataset.s }); await paintClearlistAdmin(); }
      catch { b.disabled = false; }
    }));
  }

  /* ── pipeline: how a track and a licence actually move through the system,
        which addresses exist and what each is for. Reference, not live data —
        it changes when the architecture changes, not minute to minute. ── */
  function paintPipeline() {
    const stage = (n, title, body, who) => `
      <li class="pl-step">
        <span class="pl-n">${n}</span>
        <div><b>${title}</b><p>${body}</p>${who ? `<span class="pl-who">${who}</span>` : ''}</div>
      </li>`;

    paint(`
      <div class="pl-intro">
        <h2>How a track gets from an artist to a licensed client</h2>
        <p>Two pipelines run side by side: the legal one decides <em>whether</em> a track
        can be licensed and on what terms, the technical one moves the bytes. They meet
        at review, and again at the point of licence.</p>
      </div>

      <div class="pl-cols">
        <section class="db-card pl-col">
          <h3>Legal pipeline</h3>
          <ol class="pl-list">
            ${stage(1, 'Artist declares', 'Ownership and control are asked separately. Owning a track outright and controlling its commercial use are different things — a label, distributor, sub-publisher or sync agent can hold the second without the first.', 'artist')}
            ${stage(2, 'Lane is set by the server', 'Wholly owned and wholly controlled → instant. Anything else → custom quote. The browser proposes; the worker decides and stores it on the submission.', 'automatic')}
            ${stage(3, 'Co-owners recorded, not contacted', 'Splits are stored in whole basis points and must leave the uploader a share. Invitations are queued unsent.', 'automatic')}
            ${stage(4, 'You review', 'Approve or reject in Submissions. Nothing reaches a co-owner or a controlling party until you release it from Notifications.', 'you')}
            ${stage(5, 'Licence issued', 'Instant-lane tracks self-serve. Quote-lane tracks route to you, and only then do you approach whoever else has a say.', 'you / client')}
          </ol>
          <p class="pl-note"><b>Not promised anywhere:</b> collecting or accounting for PRO
          royalties, and no cue-sheet commitment. Public performance stays between the
          licensee and their society.</p>
        </section>

        <section class="db-card pl-col">
          <h3>Technical pipeline</h3>
          <ol class="pl-list">
            ${stage(1, 'Upload', 'Audio streams straight to R2 the moment it is dropped — never gated on paperwork. The signed declaration attaches on submit.', 'artists.html')}
            ${stage(2, 'Stored', 'Originals in the snowstar-mutra R2 bucket; rows in the snowstar-members D1 database. Served over cdn.snowstar.company.', 'Cloudflare')}
            ${stage(3, 'Catalog', 'js/mutra-data.js ships as a static file. Your edits live server-side as per-slug patches and merge over it at load, so regenerating the file never wipes an edit.', 'D1 track_overrides')}
            ${stage(4, 'Site', 'GitHub Pages serves the static site. /api/* is a Cloudflare Worker on the same origin, so the session cookie stays first-party and HttpOnly.', 'Pages + Worker')}
            ${stage(5, 'Mail out', 'Resend sends. Cloudflare Email Routing receives and forwards. They live on different hostnames and do not conflict.', 'Resend')}
          </ol>
          <p class="pl-note"><b>Pending:</b> snowstar.company is not yet verified in Resend, so
          outbound still uses the sandbox sender and only reaches you. The branded addresses
          below switch on by themselves once it is.</p>
        </section>
      </div>

      <section class="db-card">
        <h3>Addresses</h3>
        <table class="pl-tbl">
          <thead><tr><th>Address</th><th>Direction</th><th>What it is for</th></tr></thead>
          <tbody>
            <tr><td><code>submissions@</code></td><td>in</td><td>Artist signups and new uploads land here. Internal.</td></tr>
            <tr><td><code>artists@</code></td><td>out</td><td>Us contacting signed-up artists.</td></tr>
            <tr><td><code>legal@</code></td><td>out</td><td>Co-owner and rights-holder contact on a new submission. Reply-to matches.</td></tr>
            <tr><td><code>hello@</code></td><td>in / out</td><td>General enquiries. Reply-to on everything transactional.</td></tr>
            <tr><td><code>licensing@</code>, <code>info@</code>, <code>ori@</code></td><td>in</td><td>Existing aliases, all forwarding to you.</td></tr>
            <tr><td>catch-all</td><td>in</td><td>Anything else at the domain, so a misspelling never bounces.</td></tr>
          </tbody>
        </table>
        <p class="pl-note">Cloudflare Email Routing, 8 of 200 rules used, free with no forwarding
        cap. It receives and forwards only — sending as these addresses is Resend's job.</p>
      </section>

      <section class="db-card">
        <h3>Where mail can actually originate</h3>
        <ul class="pl-flat">
          <li><b>Password resets</b> — sent immediately to whoever asked. Not gated, by design.</li>
          <li><b>New-submission alerts</b> — to you only.</li>
          <li><b>Daily digest</b> — to you only, 07:00 UTC via cron.</li>
          <li><b>Co-owner invitations</b> — <b>queued unsent</b>. They wait in Notifications until you approve each one.</li>
          <li><b>Managed artists you upload for</b> — receive nothing at all, ever.</li>
        </ul>
      </section>`);
  }

  /* ── overview ── */
  async function paintOverview() {
    const [stats, subs, mail, artists] = await Promise.all([
      get('/stats?days=30'), get('/submissions?status=pending'),
      get('/mailbox'), get('/artists'),
    ]);
    const t = stats.totals || {};
    const pendingMail = (mail.outbox || []).filter((m) => !m.sent_at).length;
    const card = (n, label, to) => `<div class="db-card" data-go="${to}"><b class="grad-text">${n}</b><span>${label}</span></div>`;
    paint(`
      <div class="db-cards">
        ${card(t.visits || 0, 'Visits · 30d', 'stats')}
        ${card(t.plays || 0, 'Plays · 30d', 'stats')}
        ${card((stats.members || []).length, 'Members', 'members')}
        ${card((artists.artists || []).length, 'Artists', 'artists')}
        ${card((subs.submissions || []).length, 'Pending tracks', 'submissions')}
        ${card(pendingMail, 'Mail to approve', 'notifications')}
      </div>
      <div class="db-grid">
        <div class="db-panel"><h2>Most played · 30d</h2>
          ${table((stats.topTracks || []).slice(0, 8), [
            { label: 'Track', get: (r) => esc(r.slug) },
            { label: 'Plays', num: true, bar: true, get: (r) => r.plays },
          ], { barKey: 'plays' })}</div>
        <div class="db-panel"><h2>Quick actions</h2>
          <p class="db-empty" style="padding-top:4px">
            <a href="index.html#work" style="text-decoration:underline">Edit works</a> ·
            <a href="index.html#clients" style="text-decoration:underline">Edit client logos</a> ·
            <a href="artists.html" style="text-decoration:underline">Upload as artist</a> ·
            <a href="mutra.html" style="text-decoration:underline">Open the catalog</a></p>
          <p class="db-empty">Site texts, sections and note pins are edited on the pages themselves — sign in and use the floating pill.</p></div>
      </div>`);
    app.querySelectorAll('[data-go]').forEach((c) => c.addEventListener('click', () => {
      tab = c.dataset.go; history.replaceState(null, '', '#' + tab); load();
    }));
  }

  /* ── stats (ported from stats.html) ── */
  async function paintStats() {
    const d = await get('/stats?days=' + days);
    const t = d.totals || {};
    paint(`
      <div style="display:flex;gap:8px;margin-bottom:16px">${[7, 30, 90].map((n) =>
        `<button class="chip ${n === days ? 'active' : ''}" data-days="${n}">${n} days</button>`).join('')}</div>
      <div class="db-cards">
        <div class="db-card"><b class="grad-text">${t.visits || 0}</b><span>Visits</span></div>
        <div class="db-card"><b class="grad-text">${t.plays || 0}</b><span>Track plays</span></div>
        <div class="db-card"><b class="grad-text">${t.licenses || 0}</b><span>License clicks</span></div>
        <div class="db-card"><b class="grad-text">${t.views || 0}</b><span>Page views</span></div>
      </div>
      <div class="db-grid">
        <div class="db-panel"><h2>Most played tracks</h2>${table(d.topTracks || [], [
          { label: 'Track', get: (r) => esc(r.slug) },
          { label: 'Plays', num: true, bar: true, get: (r) => r.plays },
          { label: 'People', num: true, get: (r) => r.listeners },
        ], { barKey: 'plays' })}</div>
        <div class="db-panel"><h2>License clicks</h2>${table(d.licenses || [], [
          { label: 'Track', get: (r) => esc(r.slug) },
          { label: 'Clicks', num: true, bar: true, get: (r) => r.clicks },
        ], { barKey: 'clicks' })}</div>
        <div class="db-panel"><h2>Where they came from</h2>${table(d.referrers || [], [
          { label: 'Source', get: (r) => esc(r.src) },
          { label: 'Visits', num: true, bar: true, get: (r) => r.visits },
        ], { barKey: 'visits' })}</div>
        <div class="db-panel"><h2>Countries</h2>${table(d.countries || [], [
          { label: 'Country', get: (r) => esc(r.country) },
          { label: 'Visits', num: true, bar: true, get: (r) => r.visits },
        ], { barKey: 'visits' })}</div>
        <div class="db-panel" style="grid-column:1/-1"><h2>Track engagement <span class="pill">order tried vs. time spent</span></h2>
          <p class="db-empty" style="padding-top:0">Avg. position is which try in a session a track usually is (1st, 2nd…) —
            low position + short avg. listen means people reach it early and bail; that's your optimization signal.</p>
          ${table(d.engagement || [], [
            { label: 'Track', get: (r) => esc(r.slug) },
            { label: 'Tried by', num: true, get: (r) => r.sessions },
            { label: 'Avg. position', num: true, get: (r) => r.avg_position ? Number(r.avg_position).toFixed(1) : '—' },
            { label: 'Listens (timed)', num: true, get: (r) => r.listens || '—' },
            { label: 'Avg. listened', num: true, get: (r) => r.avg_duration ? fmtDur(r.avg_duration) : '—' },
          ])}</div>
        <div class="db-panel" style="grid-column:1/-1"><h2>Recent visits <span class="pill">click a row for the journey</span></h2>
          ${table(d.recent || [], [
            { label: 'When', get: (r) => fmt(r.last_ts) },
            { label: 'Who', get: (r) => r.member_email ? `<b>${esc(r.member_name || r.member_email)}</b>` : '<span style="color:var(--dim,var(--muted))">anonymous</span>' },
            { label: 'From', get: (r) => esc((r.country || '—') + (r.referrer ? ' · ' + r.referrer : '')) },
            { label: 'Views', num: true, get: (r) => r.views },
            { label: 'Plays', num: true, get: (r) => r.plays },
            { label: 'License', num: true, get: (r) => r.licenses || '' },
          ], { rowAttr: (r) => ` class="click" data-sid="${esc(r.session_id)}"` })}
          <div id="jrn"></div></div>
        <div class="db-panel" style="grid-column:1/-1"><h2>By day</h2>${table(d.daily || [], [
          { label: 'Day', get: (r) => esc(r.day) },
          { label: 'Visits', num: true, bar: true, get: (r) => r.visits },
          { label: 'Plays', num: true, get: (r) => r.plays },
        ], { barKey: 'visits' })}</div>
      </div>`);
    app.querySelectorAll('[data-days]').forEach((b) =>
      b.addEventListener('click', () => { days = +b.dataset.days; load(); }));
    app.querySelectorAll('tr.click').forEach((tr) =>
      tr.addEventListener('click', async () => {
        const box = document.getElementById('jrn');
        box.innerHTML = '<p class="db-empty">Loading journey…</p>';
        const j = await get('/journey?sid=' + encodeURIComponent(tr.dataset.sid)).catch(() => null);
        if (!j) { box.innerHTML = '<p class="db-empty">Couldn’t load that journey.</p>'; return; }
        const verb = { view: 'opened', play: 'played', play_end: 'stopped listening to', license: 'clicked License on', search: 'searched for', favorite: 'favorited', download: 'downloaded' };
        const who = j.member ? `<p class="db-empty" style="padding:0 0 8px"><b style="color:var(--text)">${esc(j.member.name || j.member.email)}</b> was signed in during this visit</p>` : '';
        box.innerHTML = who + `<ul class="jrn">${(j.events || []).map((e) =>
          `<li>${new Date(e.ts * 1000).toLocaleTimeString()} — ${verb[e.type] || esc(e.type)} <b>${esc(e.detail || e.page || '')}</b>${e.duration ? ` <span style="color:var(--dim,var(--muted))">(${fmtDur(e.duration)})</span>` : ''}</li>`).join('')}</ul>`;
      }));
  }

  /* ── members ── */
  async function paintMembers() {
    const d = await get('/stats?days=30');
    const members = d.members || [];
    paint(`<div class="db-panel"><h2>Members <span class="pill">${members.length} signed up</span>
      <button class="chip" id="copyEmails" style="float:right">Copy emails</button></h2>
      <p class="db-empty" id="memberErr" hidden style="color:#f87171;padding:0 4px 12px"></p>
      <table><thead><tr>
        <th>Email</th><th>Name</th><th>Joined via</th><th>Newsletter</th>
        <th style="text-align:right">Favorites</th><th>Joined</th><th>Last seen</th><th></th>
      </tr></thead><tbody>${members.map((r) => `
        <tr data-id="${esc(r.id)}">
          <td><button class="mem-open" type="button">${esc(r.email)}</button></td>
          <td class="mem-name">${esc(r.name || '—')}</td>
          <td>${esc(r.signup_source || 'password')}</td>
          <td class="mem-news">${r.newsletter ? 'yes' : '—'}</td>
          <td class="num">${r.favs}</td>
          <td>${fmt(r.created_at)}</td>
          <td>${r.last_login_at ? fmt(r.last_login_at) : '—'}</td>
          <td style="white-space:nowrap">
            <button class="chip mem-edit" title="Edit">✎</button>
            <button class="chip mem-del" title="Remove">✕</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`);

    app.querySelectorAll('.mem-open').forEach((b) =>
      b.addEventListener('click', () => openMember(b.closest('tr').dataset.id)));

    const copy = document.getElementById('copyEmails');
    if (copy) copy.addEventListener('click', () => {
      const list = members.filter((m) => m.newsletter).map((m) => m.email);
      navigator.clipboard.writeText(list.join(', '));
      copy.textContent = list.length ? `Copied ${list.length} opted-in` : 'Nobody opted in yet';
      setTimeout(() => { copy.textContent = 'Copy emails'; }, 2500);
    });

    const errEl = document.getElementById('memberErr');
    const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

    app.querySelectorAll('.mem-edit').forEach((btn) => btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
      const member = members.find((m) => String(m.id) === id);
      if (tr.querySelector('.mem-editrow')) return; // already editing
      const nameCell = tr.querySelector('.mem-name');
      const newsCell = tr.querySelector('.mem-news');
      nameCell.innerHTML = `<input class="mem-editrow" style="width:100%;background:var(--panel-2,rgba(0,0,0,.2));
        border:1px solid var(--line);border-radius:8px;color:var(--text);font:inherit;padding:5px 8px"
        value="${esc(member.name || '')}">`;
      newsCell.innerHTML = `<label style="cursor:pointer"><input type="checkbox" ${member.newsletter ? 'checked' : ''}> yes</label>`;

      // swap in a fresh button (cloning drops the "open the editor" listener
      // above) so exactly one handler — Save — is ever attached at a time
      const saveBtn = btn.cloneNode(true);
      saveBtn.textContent = '✓'; saveBtn.title = 'Save';
      btn.replaceWith(saveBtn);
      saveBtn.addEventListener('click', async () => {
        errEl.hidden = true;
        const name = nameCell.querySelector('input').value.trim();
        const newsletter = newsCell.querySelector('input').checked;
        saveBtn.disabled = true;
        try {
          const r = await post('/members/update', { id, name, newsletter });
          if (r.error) { showErr('Couldn’t save that — try again.'); saveBtn.disabled = false; return; }
          member.name = name; member.newsletter = newsletter;
          await paintMembers();
        } catch { showErr('Couldn’t save that — try again.'); saveBtn.disabled = false; }
      });
    }));

    app.querySelectorAll('.mem-del').forEach((btn) => btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
      const member = members.find((m) => String(m.id) === id);
      if (!confirm(`Remove ${member.email}? This can’t be undone.`)) return;
      errEl.hidden = true;
      btn.disabled = true;
      try {
        const r = await post('/members/delete', { id });
        if (r.error) {
          const msg = { has_rights_history: `${member.email} has submissions or signed rights records and can’t be deleted — edit them instead.`,
            cannot_delete_self: 'You can’t remove your own account.' }[r.error]
            || 'Couldn’t remove that — try again.';
          showErr(msg); btn.disabled = false;
          return;
        }
        await paintMembers();
      } catch { showErr('Couldn’t remove that — try again.'); btn.disabled = false; }
    }));
  }

  /* ── artists ── */
  /* ── artists: a profile you can actually edit ─────────────────────────────
     This was a read-only table of six columns. The write endpoint existed and
     nothing called it, and the list query returned no id, so a row on screen
     could not even be addressed. Both are fixed server-side; this is the card
     that uses it. Photo, name, bio, links and supporting videos, for account
     artists and for the ones you upload on behalf of alike. */
  let openArtists = new Set();

  async function paintArtists() {
    const d = await get('/artists/profiles');
    const artists = d.artists || [];
    const members = d.members || [];
    const kindWord = { ghost: 'awaiting signup', claimed: 'claimed', account: 'has account' };

    const rowsHtml = artists.map((a) => `
      <div class="ar-card${openArtists.has(a.pid) ? ' open' : ''}" data-pid="${esc(a.pid)}">
        <div class="ar-head" role="button" tabindex="0">
          <span class="rv-caret">▸</span>
          ${a.avatar ? `<img class="ar-av" src="${esc(a.avatar)}" alt="">`
                     : '<span class="ar-av ar-none"></span>'}
          <b>${esc(a.name || '(no name)')}</b>
          <span class="who">${esc(a.email || '—')}</span>
          <span class="meta">${a.uploads} uploaded · ${a.approved} accepted</span>
          <span class="pill">${kindWord[a.kind] || a.kind}</span>
          ${a.waiting ? '<span class="pill ar-wait">signed up — link them</span>' : ''}
        </div>
        <div class="ar-body">
          <div class="ar-grid">
            <label class="ar-f"><span>Name</span><input name="name" value="${esc(a.name)}" maxlength="120"></label>
            <label class="ar-f"><span>Email</span><input name="email" value="${esc(a.email)}" maxlength="254"
              ${a.kind === 'account' ? 'disabled title="This is the address they sign in with — change it in Members"' : ''}></label>
          </div>
          <label class="ar-f"><span>About</span><textarea name="bio" rows="4" maxlength="4000">${esc(a.bio)}</textarea></label>
          <div class="ar-grid">
            <label class="ar-f"><span>Profile photo</span>
              <input type="file" class="ar-photo" accept="image/jpeg,image/png,image/webp,image/avif"></label>
            <div class="ar-f"><span>Current</span>
              ${a.avatar ? `<a href="${esc(a.avatar)}" target="_blank" rel="noopener">view</a>` : '<i>none</i>'}</div>
          </div>
          <div class="ar-sub"><span>Links</span>
            <div class="ar-list ar-links">${(a.links.length ? a.links : [{ platform: '', url: '' }]).map((l) => `
              <div class="ar-row"><input placeholder="Spotify" value="${esc(l.platform)}" data-k="platform" maxlength="80">
                <input placeholder="https://…" value="${esc(l.url)}" data-k="url" maxlength="400">
                <button class="ar-x" type="button" title="Remove">×</button></div>`).join('')}</div>
            <button class="rv-btn ar-add" data-for="links" type="button">+ link</button></div>
          <div class="ar-sub"><span>Supporting videos</span>
            <div class="ar-list ar-videos">${(a.videos.length ? a.videos : [{ title: '', url: '' }]).map((v) => `
              <div class="ar-row"><input placeholder="What it is" value="${esc(v.title)}" data-k="title" maxlength="80">
                <input placeholder="YouTube / Vimeo URL" value="${esc(v.url)}" data-k="url" maxlength="400">
                <button class="ar-x" type="button" title="Remove">×</button></div>`).join('')}</div>
            <button class="rv-btn ar-add" data-for="videos" type="button">+ video</button></div>
          ${a.waiting ? `
          <div class="ar-claim">
            <b>${esc(a.waiting.email)} has signed up with this artist's email.</b>
            <p>Linking gives them their tracks, their earnings and anything waiting for their
              signature. It is not automatic because typing an address is not proof of owning
              one — you confirming it is.</p>
            <button class="rv-btn rv-ok ar-link" type="button">Link to their account</button>
          </div>` : ''}
          ${a.managers ? `
          <div class="ar-sub"><span>Managed by</span>
            <p class="db-empty" style="padding:0 0 7px;font-size:.8rem">Members who upload for this
              artist. More than one is fine — a manager and a label, or two halves of a duo.</p>
            <div class="ar-mans">${a.managers.length ? a.managers.map((mn) => `
              <span class="ar-man" data-email="${esc(mn.email)}">${esc(mn.name || mn.email)}
                <button class="ar-mx" type="button" title="Take this member off">×</button></span>`).join('')
              : '<i class="ar-nomans">Nobody yet — uploads for this artist are unattributed.</i>'}</div>
            <div class="ar-row" style="grid-template-columns:1fr auto;margin-top:8px">
              <input class="ar-mnew" list="dl-members" placeholder="member@email.com">
              <button class="rv-btn ar-madd" type="button">Assign</button></div>
          </div>` : ''}
          <div class="rv-acts"><button class="rv-btn rv-ok ar-save" type="button">Save profile</button>
            ${a.managers ? `<button class="rv-btn rv-no ar-del" type="button"
              ${a.uploads ? `disabled title="Still has ${a.uploads} upload${a.uploads === 1 ? '' : 's'} — reassign or delete those first"` : ''}
              >Delete artist</button>` : ''}
            <span class="ar-said"></span></div>
        </div>
      </div>`).join('');

    paint(`<div class="db-panel"><h2>Artists <span class="pill">${artists.length}</span></h2>
      <p class="db-empty" style="padding-top:0">Click a name to edit their profile. “Awaiting signup”
        artists are ones you upload for — they claim the profile, and countersign their declarations,
        when they create an account with that email. Everything here is what shows on their public page.</p>
      ${rowsHtml || '<p class="db-empty">No artists yet.</p>'}
      <datalist id="dl-members">${members.map((mm) =>
        `<option value="${esc(mm.email)}">${esc(mm.name || '')}</option>`).join('')}</datalist>
      </div>`);

    app.querySelectorAll('.ar-head').forEach((h) => {
      const card = h.closest('.ar-card'), pid = card.dataset.pid;
      const toggle = () => {
        const open = card.classList.toggle('open');
        if (open) openArtists.add(pid); else openArtists.delete(pid);
      };
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    const rowHtml = (kind) => kind === 'links'
      ? `<div class="ar-row"><input placeholder="Spotify" data-k="platform" maxlength="80">
           <input placeholder="https://…" data-k="url" maxlength="400">
           <button class="ar-x" type="button" title="Remove">×</button></div>`
      : `<div class="ar-row"><input placeholder="What it is" data-k="title" maxlength="80">
           <input placeholder="YouTube / Vimeo URL" data-k="url" maxlength="400">
           <button class="ar-x" type="button" title="Remove">×</button></div>`;

    app.querySelectorAll('.ar-add').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.for;
      b.closest('.ar-sub').querySelector('.ar-list').insertAdjacentHTML('beforeend', rowHtml(kind));
    }));
    app.addEventListener('click', (e) => {
      const x = e.target.closest('.ar-x');
      if (x) x.closest('.ar-row').remove();
    });

    /* Photo goes up on its own the moment it is chosen, and the server writes
       the URL — a file input that only takes effect on Save is the one everyone
       forgets to press. */
    app.querySelectorAll('.ar-photo').forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const card = inp.closest('.ar-card');
      const said = card.querySelector('.ar-said');
      said.textContent = 'Uploading photo…';
      const r = await fetch('/api/artists/photo?pid=' + encodeURIComponent(card.dataset.pid), {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'content-type': f.type }, body: f,
      }).then((x) => x.json()).catch(() => null);
      said.textContent = r && r.ok ? 'Photo saved.' : 'Photo failed.';
      if (r && r.ok) {
        const av = card.querySelector('.ar-av');
        if (av) { const img = document.createElement('img'); img.className = 'ar-av';
                  img.src = r.url; av.replaceWith(img); }
      }
    }));

    /* Assigning and de-assigning both reload, because a manager list that
       disagrees with the server is worse than a moment's flicker — this is who
       gets paid and who gets told. */
    app.querySelectorAll('.ar-link').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.ar-card');
      const r = await post('/artists/claim', { pid: card.dataset.pid });
      if (r && r.ok) load();
      else card.querySelector('.ar-said').textContent = (r && r.detail) || 'Could not link that account.';
    }));

    app.querySelectorAll('.ar-madd').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.ar-card');
      const inp = card.querySelector('.ar-mnew');
      const said = card.querySelector('.ar-said');
      const email = (inp.value || '').trim();
      if (!email) return;
      const r = await post('/artists/managers', { pid: card.dataset.pid, email });
      if (r && r.ok) load();
      else said.textContent = (r && r.detail) || (r && r.error) || 'Could not assign that member.';
    }));
    app.querySelectorAll('.ar-mx').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.ar-card');
      const email = b.closest('.ar-man').dataset.email;
      if (!confirm(`Take ${email} off this artist?\n\nTheir uploads stay where they are — this only removes the link.`)) return;
      const r = await post('/artists/managers', { pid: card.dataset.pid, email, remove: true });
      if (r && r.ok) load();
    }));

    app.querySelectorAll('.ar-del').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.ar-card');
      const name = card.querySelector('b').textContent;
      if (!confirm(`Delete ${name}?\n\nThis removes the artist and who manages them. It cannot be undone.`)) return;
      const r = await fetch('/api/artists/profiles?pid=' + encodeURIComponent(card.dataset.pid),
        { method: 'DELETE', credentials: 'same-origin' }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) load();
      else card.querySelector('.ar-said').textContent = (r && r.detail) || 'Could not delete that artist.';
    }));

    app.querySelectorAll('.ar-save').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.ar-card');
      const said = card.querySelector('.ar-said');
      const val = (n) => (card.querySelector(`[name="${n}"]`) || {}).value;
      const listOf = (sel, keys) => [...card.querySelectorAll(sel + ' .ar-row')].map((r) => {
        const o = {};
        keys.forEach((k) => { o[k] = (r.querySelector(`[data-k="${k}"]`) || {}).value || ''; });
        return o;
      }).filter((o) => keys.every((k) => o[k].trim()));

      const body = { pid: card.dataset.pid, name: val('name'), bio: val('bio'),
        links: listOf('.ar-links', ['platform', 'url']),
        videos: listOf('.ar-videos', ['title', 'url']) };
      if (card.querySelector('[name="email"]') && !card.querySelector('[name="email"]').disabled) {
        body.email = val('email');
      }
      b.disabled = true; said.textContent = 'Saving…';
      const r = await post('/artists/profiles', body);
      b.disabled = false;
      said.textContent = r && r.ok ? 'Saved.' : (r && r.error) || 'Could not save.';
    }));
  }

/* ── submissions (ported from review.html) ── */
  async function paintSubmissions() {
    const d = await get('/submissions?status=' + subTab);
    const items = d.submissions || [];
    const declBlock = (s) => {
      if (!s.decl_kind) return '';
      let splits = [];
      try { splits = JSON.parse(s.splits_snapshot || '[]'); } catch {}
      const kindWord = { solo: 'Owns 100%', shared: 'Shared ownership', behalf: 'Uploaded by you on behalf' }[s.decl_kind] || s.decl_kind;
      return `<div class="rv-decl"><b>${kindWord}</b> — signed “${esc(s.signed_name)}”
        ${s.acum ? ' · <span class="rv-acum">⚠ ACUM/royalty-society registered</span>' : ''}
        ${splits.length ? '<br>Splits: ' + splits.map((c) =>
          `${esc(c.name)} (${esc(c.email)}) ${(c.share_bp / 100).toFixed(c.share_bp % 100 ? 2 : 0)}%`).join(' · ') : ''}
        ${s.decl_kind === 'behalf' ? '<br>Evidence: ' + (s.evidence_kind
          ? esc(s.evidence_kind) + (s.evidence_note ? ' — ' + esc(s.evidence_note) : '')
          : '<i>none on file — get a “reply YES” from the artist</i>') : ''}
        ${ctrlLine(s)}</div>`;
    };
    /** Whoever has a say in commercial use without owning a share. */
    const ctrlLine = (s) => {
      let c = {};
      try { c = JSON.parse(s.controllers || '{}'); } catch {}
      const list = c.controllers || [];
      const bits = [];
      if (list.length) bits.push('Controlled by: ' + list.map((x) =>
        `${esc(x.name)} (${esc(x.scope)}${x.territory ? ', ' + esc(x.territory) : ''})`).join(' · '));
      if (c.approval) bits.push(c.approval === 'all' ? 'all co-owners must agree' : 'any co-owner can approve');
      return bits.length ? '<br>' + bits.join(' — ') : '';
    };
    const laneChip = (s) => s.lane
      ? `<span class="rv-lane ${s.lane}">${s.lane === 'instant' ? 'instant licence' : 'custom quote'}</span>` : '';
    paint(`
      <div style="display:flex;gap:8px;margin-bottom:16px">${['pending', 'approved', 'rejected'].map((t) =>
        `<button class="chip ${t === subTab ? 'active' : ''}" data-st="${t}">${t}</button>`).join('')}</div>
      ${items.length ? items.map((s) => `
        <div class="rv-item${openSubs.has(s.id) ? ' open' : ''}" data-id="${s.id}">
          <div class="rv-top rv-head" role="button" tabindex="0"
               aria-expanded="${openSubs.has(s.id)}"><span class="rv-caret">▸</span><b>${esc(s.title)}</b>
            <span class="who">${esc(s.artist_name || s.email)}</span>
            <span class="meta">${(s.size / 1048576).toFixed(1)}MB · ${esc(s.ext)} · ${fmt(s.created_at)}</span>
            ${laneChip(s)}${s.status === 'approved' ? (s.published_slug
              ? `<span class="rv-pub live">in catalog</span>`
              : `<span class="rv-pub">not in catalog yet</span>`) : ''}</div>
          <div class="rv-body">
          ${declBlock(s)}
          ${s.artist_note ? `<p class="rv-note">Artist: “${esc(s.artist_note)}”</p>` : ''}
          ${s.review_note ? `<p class="rv-note">You: “${esc(s.review_note)}”</p>` : ''}
          <audio controls preload="none" src="/api/artist/file?id=${s.id}"></audio>
          <div class="rv-acts">
            ${subTab !== 'approved' ? '<button class="rv-btn rv-ok" data-a="approved">Approve</button>' : ''}
            ${subTab !== 'rejected' ? '<button class="rv-btn rv-no" data-a="rejected">Reject</button>' : ''}
            ${subTab !== 'pending' ? '<button class="rv-btn" data-a="pending">Back to pending</button>' : ''}
            <button class="rv-btn rv-edit" type="button">Edit details</button>
          </div>
          <div class="rv-review" hidden></div>
          <div class="rv-editor" hidden></div>
          </div></div>`).join('')
      : `<p class="db-empty">${subTab === 'pending' ? 'Nothing waiting — inbox zero.' : 'Nothing here yet.'}</p>`}
      <p class="db-empty">Approving marks a track for the catalog — it does <b>not</b> publish it.
        The audio stays in the private submissions area until it is analysed, given a waveform and
        artwork, and added to the catalog file. Ask Claude to “process approved uploads” to take
        them live.</p>`);
    /* Click the header to open a row. Not the whole row: the body holds the
       player, the approve buttons and the editor, and a click anywhere in it
       collapsing the thing you were working in would be maddening. */
    app.querySelectorAll('.rv-head').forEach((h) => {
      const item = h.closest('.rv-item');
      const id = Number(item.dataset.id);
      const toggle = () => {
        const open = item.classList.toggle('open');
        h.setAttribute('aria-expanded', String(open));
        if (open) openSubs.add(id); else openSubs.delete(id);
      };
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    app.querySelectorAll('[data-st]').forEach((b) =>
      b.addEventListener('click', () => { subTab = b.dataset.st; load(); }));
    app.querySelectorAll('.rv-edit').forEach((b) =>
      b.addEventListener('click', () => openDeclEditor(b.closest('.rv-item'), items)));
    /* [data-a], not .rv-btn. "Edit details" also carries .rv-btn, so the old
       selector bound the status handler to it as well: one click opened the
       editor AND fired a native prompt, and whichever way you answered, the
       review POST re-rendered the list and threw the editor away. That is the
       "snowstar.company says" box that made editing impossible. */
    app.querySelectorAll('.rv-item .rv-btn[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = b.closest('.rv-item');
        const status = b.dataset.a;
        // Back-to-pending is a filing action with nothing to say about it.
        if (status === 'pending') return commitReview(item, status, '');
        openReviewNote(item, status);
      }));
  }

  /* ── pricing classes ────────────────────────────────────────────────────
     A multiplier is not a price. "1.8x" tells nobody whether the result is
     sane, so every change previews the actual shekels it produces across every
     band before it is saved. */
  async function paintPricing() {
    const d = await get('/pricing/classes');
    const cls = d.classes || {};
    const pv = d.preview || {};
    const buyers = d.buyers || {};
    const bandIds = Object.keys(buyers);

    paint(`
      <div class="db-panel">
        <h2>Price classes</h2>
        <p class="db-empty" style="padding-top:0">Each class multiplies the WHOLE ladder —
          every buyer band and every term together — so the relationships between them stay
          as they were solved. <b>C is the catalogue as it stands</b>; nothing moves at 100%.
          All three sell self-serve — whether a track needs a quote is a rights question,
          set per track, not a price tier.</p>

        <table class="pc-table">
          <tr><th></th><th>Of the baseline</th>
            ${bandIds.filter((b) => buyers[b].base != null).map((b) =>
              `<th>${esc(buyers[b].short)}</th>`).join('')}</tr>
          ${['A', 'B', 'C', 'D'].map((c) => `
            <tr data-c="${c}">
              <td class="pc-name"><b>${c}</b></td>
              <td><input class="pc-pct" type="number" min="10" max="2000" step="5"
                    value="${Math.round((cls[c]?.mult ?? 1) * 100)}"> %</td>
              ${bandIds.filter((b) => buyers[b].base != null).map((b) =>
                `<td class="pc-cell" data-b="${b}">₪${(pv[c]?.[b] ?? '')}</td>`).join('')}
            </tr>`).join('')}
        </table>
        <p class="db-empty">Prices shown are the twelve-month Standard figure per band.
          Terms multiply on top, unchanged.</p>
        <div class="rv-acts">
          <button class="rv-btn rv-ok" id="pcSave">Save</button>
          <span class="pc-msg"></span>
        </div>
      </div>`);

    // live preview: type a percentage, see the shekels move before saving
    const repaint = () => {
      app.querySelectorAll('.pc-table tr[data-c]').forEach((row) => {
        const pct = Number(row.querySelector('.pc-pct').value) / 100;
        row.querySelectorAll('.pc-cell').forEach((td) => {
          const base = buyers[td.dataset.b].base;
          td.textContent = '₪' + Math.max(0, Math.round(base * pct / 10) * 10 - 1).toLocaleString();
        });
      });
    };
    app.querySelectorAll('.pc-pct').forEach((i) =>
      i.addEventListener('input', repaint));

    document.getElementById('pcSave').addEventListener('click', async () => {
      const body = {};
      app.querySelectorAll('.pc-table tr[data-c]').forEach((row) => {
        body[row.dataset.c] = { pct: Number(row.querySelector('.pc-pct').value) };
      });
      const msg = app.querySelector('.pc-msg');
      msg.textContent = 'Saving…';
      const r = await post('/pricing/classes', body);
      msg.textContent = r && r.ok ? 'Saved — live now.' : 'Could not save.';
    });
  }

  /* ── inbox: what came in through Get in touch ──────────────────────────
     Sorted by urgency, not by time. A Content ID claim is blocking somebody's
     launch and a rights dispute has a clock on it; a pre-sales question does
     not. Newest-first would bury both under whatever arrived since. */
  let inboxTab = 'new';
  const BRANCH_LABEL = {
    'a2-quote': 'Quote', 'a3-question': 'Pre-sales', 'b1-claim': 'CLAIM',
    'b2-account': 'Licence/invoice', 'b3-renew': 'Renewal',
    'c2-artist': 'Artist', 'd1-rights': 'RIGHTS', 'd3-other': 'General',
  };

  async function paintInbox() {
    const d = await get('/messages?status=' + encodeURIComponent(inboxTab));
    const msgs = d.messages || [];
    const c = d.counts || {};
    paint(`
      <div class="db-panel">
        <h2>Inbox <span class="pill">${c.new || 0} new</span></h2>
        <p class="db-empty" style="padding-top:0">Claims and rights disputes first — those
          have a clock on them. Everything else by arrival.</p>
        <div style="display:flex;gap:8px;margin:12px 0 14px">
          ${[['new', 'New'], ['open', 'Open'], ['done', 'Done']].map(([v, t]) =>
            `<button class="chip ${v === inboxTab ? 'active' : ''}" data-ib="${v}">${t}${
              c[v] ? ` (${c[v]})` : ''}</button>`).join('')}
        </div>
        ${msgs.length ? msgs.map((m) => `
          <div class="rv-item ib-msg" data-id="${m.id}">
            <div class="rv-top">
              <b class="${m.priority === 'claim' || m.priority === 'rights' ? 'ib-urgent' : ''}">${
                esc(BRANCH_LABEL[m.branch] || m.branch)}</b>
              <span class="who">${esc(m.name || m.email)}</span>
              <span class="meta">${esc(m.ref)} · ${fmt(m.created_at)}</span>
            </div>
            ${m.track ? `<p class="rv-note">Track: <b>${esc(m.track)}</b></p>` : ''}
            ${m.video_url ? `<p class="rv-note">Video:
              <a href="${esc(m.video_url)}" target="_blank" rel="noopener noreferrer">${esc(m.video_url)}</a>
              ${m.platform ? ' · ' + esc(m.platform) : ''}</p>` : ''}
            ${m.order_ref ? `<p class="rv-note">Ref: ${esc(m.order_ref)}</p>` : ''}
            <p class="rv-note ib-body">${esc(m.message)}</p>
            <div class="rv-acts">
              <a class="rv-btn" href="mailto:${esc(m.email)}?subject=${
                encodeURIComponent('Re: ' + m.ref)}">Reply</a>
              ${inboxTab !== 'open' ? `<button class="rv-btn ib-set" data-s="open">Working on it</button>` : ''}
              ${inboxTab !== 'done' ? `<button class="rv-btn rv-ok ib-set" data-s="done">Done</button>` : ''}
              ${inboxTab !== 'new' ? `<button class="rv-btn ib-set" data-s="new">Back to new</button>` : ''}
            </div>
          </div>`).join('')
        : '<p class="db-empty">Nothing here.</p>'}
      </div>`);

    app.querySelectorAll('[data-ib]').forEach((b) =>
      b.addEventListener('click', () => { inboxTab = b.dataset.ib; load(); }));
    app.querySelectorAll('.ib-set').forEach((b) =>
      b.addEventListener('click', async () => {
        await post('/messages/status',
          { id: Number(b.closest('.ib-msg').dataset.id), status: b.dataset.s });
        load();
      }));
  }

  /* ── notifications (ported from review.html) ── */
  async function paintMail() {
    const mail = await get('/mailbox');
    const pending = (mail.outbox || []).filter((m) => !m.sent_at);
    const sent = (mail.outbox || []).filter((m) => m.sent_at).slice(0, 12);
    paint(`
      <p class="db-empty" style="padding-top:0">Nothing is emailed without you. ${mail.mail_live
        ? 'Sending goes straight to the recipient.'
        : 'Until the send domain is verified, “Approve &amp; send” delivers the email to YOUR inbox with a forward-to banner — you forward it yourself.'}</p>
      ${pending.length ? pending.map((m) => `
        <details class="rv-mrow" data-id="${m.id}">
          <summary><b>${esc(m.to_name || m.to_email)}</b>
            <span style="color:var(--muted)">${esc(m.to_email)}${m.title ? ' · re “' + esc(m.title) + '”' : ''}</span>
            ${m.last_error ? `<span class="rv-err">last try failed: ${esc(m.last_error)}</span>` : ''}
            <button class="rv-btn rv-ok rv-send" style="margin-left:auto">Approve &amp; send</button></summary>
          <pre>${esc(m.body)}</pre></details>`).join('')
      : '<p class="db-empty">No notifications waiting.</p>'}
      ${sent.length ? '<p class="db-empty">Recently sent:</p>' + sent.map((m) => `
        <div class="rv-mrow"><b>${esc(m.to_email)}</b>
          ${m.sent_at ? `<span class="rv-sent">${m.sent_how === 'direct' ? 'sent' : 'delivered to you for forwarding'} · ${fmt(m.sent_at)}</span>`
            : `<span class="rv-err">failed: ${esc(m.last_error)}</span>`}</div>`).join('') : ''}`);
    app.querySelectorAll('.rv-send').forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        b.disabled = true; b.textContent = 'Sending…';
        await post('/mailbox/send', { ids: [Number(b.closest('.rv-mrow').dataset.id)] });
        load();
      }));
  }

  /* ── licensing: the approval queue ── */
  /* Granting is the one operation here that gives away the product, so the
     sheet is deliberately obstructive: you pick the payment, you TYPE the
     amount that arrived, and you read back what you are about to permit. None
     of those can be satisfied by a mis-click. */
  const ILS = (agorot) => '₪' + (Number(agorot || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 });

  let licTab = 'new';
  async function paintLicensing() {
    const d = await get('/licence/queue?status=' + encodeURIComponent(licTab));
    const reqs = d.requests || [];
    const pays = (d.payments || []).filter((p) => p.unapplied > 0);
    const c = d.counts || {};

    paint(`
      <div class="db-panel">
        <h2>Licensing
          <span class="pill">${c.new || 0} waiting</span>
          <span class="pill">${c.granted || 0} granted</span>
          ${c.declined ? `<span class="pill">${c.declined} declined</span>` : ''}
        </h2>
        <p class="db-empty" style="padding-top:0">Oldest first. Money and permission are recorded
          separately — record a payment when it lands, then release the track against it.</p>

        <h4 style="margin-top:6px">Money received, not yet applied
          <span class="pill">${pays.length}</span>
          <button class="chip" id="lcAddPay" style="float:right">Record a payment</button></h4>
        ${pays.length ? `<div class="mem-list">${pays.map((p) => `
          <div class="mem-row"><b>${ILS(p.unapplied)}</b>
            <span>${esc(p.method)}</span>${p.reference ? `<span>ref ${esc(p.reference)}</span>` : ''}
            ${p.email ? `<span>${esc(p.email)}</span>` : ''}
            <span class="mem-when">${fmt(p.ts)}</span></div>`).join('')}</div>`
          : '<p class="db-empty" style="padding:4px 0 10px">Nothing unassigned.</p>'}

        <div style="display:flex;gap:8px;margin:14px 0 12px">
          ${[['new', 'Waiting'], ['granted', 'Granted'], ['declined', 'Declined']].map(([v, t]) =>
            `<button class="chip ${v === licTab ? 'active' : ''}" data-lt="${v}">${t}${
              c[v] ? ` (${c[v]})` : v === 'granted' && c.granted ? ` (${c.granted})` : ''}</button>`).join('')}
        </div>

        <h4>${licTab === 'granted' ? 'Granted licences' : licTab === 'declined' ? 'Declined' : 'Requests'}</h4>
        ${licTab === 'granted' ? (reqs.length ? `<div class="mem-list">${reqs.map((l) => {
            const now = Math.floor(Date.now() / 1000);
            const gone = l.revoked_at ? 'revoked' : (l.expires_at && l.expires_at < now ? 'expired' : null);
            return `<div class="mem-row${gone ? ' is-off' : ''}">
              <b>${esc(l.slug)}</b>
              <span>${esc(l.licensee_name || l.email || '')}</span>
              ${l.project_name ? `<span>${esc(l.project_name)}</span>` : ''}
              <span>${ILS(l.amount)}</span>
              <span class="pill">${gone || (l.expires_at ? fmt(l.expires_at) : 'no end date')}</span>
              <span class="mem-when">${esc(l.ref)}</span>
              <a class="chip" href="/api/licence/certificate?ref=${encodeURIComponent(l.ref)}"
                 target="_blank" rel="noopener">Certificate</a>
              ${gone ? '' : `<button class="chip lc-revoke" data-ref="${esc(l.ref)}">Revoke</button>`}
            </div>`; }).join('')}</div>`
          : '<p class="db-empty">Nothing granted yet.</p>')
        : reqs.length ? reqs.map((r) => `
          <div class="rv-item lc-req" data-id="${r.id}">
            <div class="rv-top">
              <b>${esc(r.slug)}</b>
              <span class="who">${esc(d.tiers[r.tier] ? d.tiers[r.tier].label : r.tier)}</span>
              <span class="meta">${esc(r.ref)} · ${esc(r.user_name || r.email)} · ${fmt(r.created_at)}</span>
              ${r.lane === 'quote'
                ? '<span class="lc-quote">quote lane — someone else has a say</span>'
                : `<span class="rv-sent">list ${ILS(r.list_amount)}</span>`}
            </div>
            ${r.licensee_name ? `<p class="rv-note">For: ${esc(r.licensee_name)}${r.licensee_tax_id ? ' · ' + esc(r.licensee_tax_id) : ''}</p>` : ''}
            ${(r.use_where || r.use_territory || r.use_duration) ? `<p class="rv-note">
              ${r.use_where ? 'Where: ' + esc(r.use_where) + '. ' : ''}
              ${r.use_territory ? 'Territory: ' + esc(r.use_territory) + '. ' : ''}
              ${r.use_duration ? 'For: ' + esc(r.use_duration) + '.' : ''}</p>` : ''}
            ${r.note ? `<p class="rv-note">“${esc(r.note)}”</p>` : ''}
            <div class="rv-acts">
              <button class="rv-btn rv-ok lc-open">Grant licence…</button>
              <button class="rv-btn lc-decline">Decline</button>
            </div>
            <div class="lc-sheet" hidden></div>
          </div>`).join('')
        : `<p class="db-empty">${licTab === 'declined' ? 'Nothing declined.' : 'Nothing waiting.'}</p>`}
      </div>`);

    app.querySelectorAll('[data-lt]').forEach((b) =>
      b.addEventListener('click', () => { licTab = b.dataset.lt; load(); }));

    // Revoking is the one destructive act on this screen, so it asks for a
    // reason in the row rather than firing on the click.
    app.querySelectorAll('.lc-revoke').forEach((b) => b.addEventListener('click', async () => {
      const row = b.closest('.mem-row');
      if (row.querySelector('.lc-rv')) return;
      const wrap = document.createElement('span');
      wrap.className = 'lc-rv';
      wrap.innerHTML = `<input placeholder="Why is this being revoked?" maxlength="200">
        <button class="chip lc-rvgo">Revoke</button>`;
      row.appendChild(wrap);
      const inp = wrap.querySelector('input');
      inp.focus();
      wrap.querySelector('.lc-rvgo').addEventListener('click', async () => {
        if (!inp.value.trim()) { inp.focus(); return; }
        await post('/licence/revoke', { ref: b.dataset.ref, reason: inp.value.trim() });
        load();
      });
    }));

    const payOpts = pays.map((p) =>
      `<option value="${p.id}" data-amt="${p.unapplied}">${ILS(p.unapplied)} · ${esc(p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</option>`).join('');

    app.querySelectorAll('.lc-req .lc-open').forEach((btn) => btn.addEventListener('click', () => {
      const item = btn.closest('.lc-req');
      const r = reqs.find((x) => x.id === Number(item.dataset.id));
      const sheet = item.querySelector('.lc-sheet');
      if (!sheet.hidden) { sheet.hidden = true; return; }
      sheet.hidden = false;
      const listShek = (r.list_amount || 0) / 100;
      sheet.innerHTML = `
        <div class="lc-grid">
          <label class="te-f"><span>Payment received</span>
            <select class="lc-pay">
              <option value="">— none (this is a comp) —</option>${payOpts}
            </select></label>
          <label class="te-f"><span>Amount received (₪, ex-VAT)</span>
            <input class="lc-amt" type="number" min="0" step="1" placeholder="${listShek || ''}"></label>
          <label class="te-f"><span>Licensee (business name)</span>
            <input class="lc-name" maxlength="200" value="${esc(r.licensee_name || '')}"></label>
          <label class="te-f"><span>ח.פ / ע.מ</span>
            <input class="lc-tax" maxlength="40" value="${esc(r.licensee_tax_id || '')}"></label>
        </div>
        ${r.lane === 'quote' ? `
          <label class="ar-check lc-ctl"><input type="checkbox" class="lc-cleared">
            <span>I have confirmed with the other rights holder that this use is cleared</span></label>` : ''}
        <p class="lc-readback"></p>
        <div class="rv-acts">
          <button class="rv-btn rv-ok lc-go" disabled>Grant</button>
          <span class="lc-msg"></span>
        </div>`;

      const sel = sheet.querySelector('.lc-pay'), amt = sheet.querySelector('.lc-amt');
      const go = sheet.querySelector('.lc-go'), read = sheet.querySelector('.lc-readback');
      const cleared = sheet.querySelector('.lc-cleared');

      const sync = () => {
        const pid = sel.value;
        const expect = pid ? Number(sel.selectedOptions[0].dataset.amt) : null;
        const typed = Math.round(Number(amt.value) * 100);
        const isComp = !pid;
        // the amount has to be TYPED and has to match the payment. A mis-click
        // cannot produce a number, which is the whole point.
        let ok = Number.isFinite(typed) && amt.value !== '';
        if (!isComp) ok = ok && typed === expect;
        if (r.lane === 'quote') ok = ok && cleared && cleared.checked;
        go.disabled = !ok;
        read.textContent = ok
          ? `${isComp ? 'No payment (comp).' : ILS(typed) + ' received by ' + sel.selectedOptions[0].textContent.split(' · ')[1] + '.'} `
            + `Grant ${sheet.querySelector('.lc-name').value || r.email} a ${d.tiers[r.tier] ? d.tiers[r.tier].label : r.tier} licence for ${r.slug}.`
          : (!isComp && amt.value !== '' && typed !== expect)
            ? `Doesn't match the payment (${ILS(expect)}).`
            : 'Pick a payment and type the amount received.';
      };
      [sel, amt, sheet.querySelector('.lc-name')].forEach((el) => el.addEventListener('input', sync));
      if (cleared) cleared.addEventListener('change', sync);
      sync();

      go.addEventListener('click', async () => {
        go.disabled = true;
        const msg = sheet.querySelector('.lc-msg');
        msg.textContent = 'Granting…';
        const res = await post('/licence/grant', {
          request_id: r.id,
          payment_id: sel.value ? Number(sel.value) : null,
          amount: Number(amt.value),
          reason: sel.value ? 'paid' : 'comp',
          licensee_name: sheet.querySelector('.lc-name').value,
          licensee_tax_id: sheet.querySelector('.lc-tax').value,
          scope_text: read.textContent,
          controller_cleared: cleared ? cleared.checked : false,
        }).catch((e) => ({ error: e.message }));
        if (res && res.ok) load();
        else { msg.textContent = 'Failed: ' + ((res && res.error) || 'unknown'); go.disabled = false; }
      });
    }));

    app.querySelectorAll('.lc-decline').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.closest('.lc-req').dataset.id);
      const note = prompt('Why? (the requester sees this)') || '';
      await post('/licence/decline', { id, note });
      load();
    }));

    const addPay = document.getElementById('lcAddPay');
    if (addPay) addPay.addEventListener('click', async () => {
      const amount = prompt('Amount received in ₪ (including VAT):');
      if (!amount) return;
      const method = prompt('How? bank / bit / paybox / cash / card', 'bit');
      if (!method) return;
      const reference = prompt('Reference they quoted (the MU-… code), if any:') || '';
      const res = await post('/licence/payment', { amount: Number(amount), method, reference })
        .catch((e) => ({ error: e.message }));
      if (res && res.error) alert('Could not record: ' + res.error);
      load();
    });
  }

  /* ── one member, everything about them ── */
  /* Opened from the members table. Sections that have no data are OMITTED
     rather than rendered empty — a drawer of eight "none yet" headings tells
     you nothing and buries the two facts that matter. */
  async function openMember(id) {
    const host = document.createElement('div');
    host.className = 'mem-drawer';
    host.innerHTML = '<div class="mem-sheet"><p class="db-empty">Loading…</p></div>';
    document.body.appendChild(host);
    const close = () => host.remove();
    host.addEventListener('click', (e) => { if (e.target === host) close(); });
    addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); removeEventListener('keydown', esc); }
    });

    let d;
    try { d = await get('/members/detail?id=' + encodeURIComponent(id)); }
    catch (e) { host.querySelector('.mem-sheet').innerHTML =
      `<p class="db-empty" style="color:#f87171">Could not load: ${esc(e.message)}</p>`; return; }

    const m = d.member, t = d.totals;
    const money = (a, c) => (c === 'ILS' || !c ? '\u20aa' : c + ' ') + Number(a || 0).toLocaleString();
    const section = (title, rows, render) => rows && rows.length
      ? `<h4>${title} <span class="pill">${rows.length}</span></h4><div class="mem-list">${rows.map(render).join('')}</div>` : '';
    const field = (k, v) => v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';

    host.querySelector('.mem-sheet').innerHTML = `
      <button class="mem-x" aria-label="Close">&times;</button>
      <h3>${esc(m.name || m.email)}</h3>
      <p class="mem-sub">${esc(m.email)}${m.admin ? ' · owner' : ''}${m.artist ? ' · artist' : ''}
        ${m.email_verified ? '' : ' · <span style="color:#f59e0b">email unverified</span>'}</p>

      <dl class="mem-fields">
        ${field('Name', [m.first_name, m.last_name].filter(Boolean).join(' ') || m.name)}
        ${field('Company', m.company)}
        ${field('Role', m.role)}
        ${field('Country', m.country)}
        ${field('Phone', m.phone)}
        ${field('Artist name', m.artist_name)}
        ${field('Signed up via', m.signup_source || 'password')}
        ${field('Sign-in providers', (d.providers || []).join(', '))}
        ${field('Newsletter', m.newsletter ? 'opted in' : 'no')}
        ${field('Joined', fmt(m.created_at))}
        ${field('Last seen', m.last_login_at ? fmt(m.last_login_at) : 'never')}
      </dl>

      <div class="mem-tallies">
        <span>${t.downloads} downloads</span><span>${t.favorites} favorites</span>
        <span>${t.payments} payments</span><span>${t.invoices} invoices</span>
        ${t.submissions ? `<span>${t.submissions} uploads</span>` : ''}
      </div>

      ${!d.payments.length && !d.invoices.length
        ? '<p class="db-empty" style="padding:10px 0 0">No payments or invoices recorded. Those arrive with the checkout work \u2014 nothing is missing here yet.</p>' : ''}

      ${section('Payments', d.payments, (p) => `<div class="mem-row"><b>${money(p.amount, p.currency)}</b>
        <span>${esc(p.method || '')}</span><span>${esc(p.status || '')}</span>
        <span class="mem-when">${p.ts ? fmt(p.ts) : ''}</span></div>`)}
      ${section('Invoices', d.invoices, (i) => `<div class="mem-row"><b>${esc(i.number || i.id)}</b>
        <span>${money(i.amount, i.currency)}</span><span class="mem-when">${i.ts ? fmt(i.ts) : ''}</span></div>`)}
      ${section('Downloads', d.downloads, (x) => `<div class="mem-row"><b>${esc(x.slug)}</b>
        <span class="mem-when">${fmt(x.ts)}</span></div>`)}
      ${section('Most played', d.plays, (x) => `<div class="mem-row"><b>${esc(x.slug || '\u2014')}</b>
        <span class="mem-when">${x.n} plays</span></div>`)}
      ${section('Favorites', d.favorites, (x) => `<div class="mem-row"><b>${esc(x.slug)}</b>
        <span class="mem-when">${esc(x.product || '')}</span></div>`)}
      ${section('Uploads', d.submissions, (x) => `<div class="mem-row"><b>${esc(x.title)}</b>
        <span>${esc(x.status)}</span><span class="mem-when">${x.published_slug ? 'in catalog' : ''}</span></div>`)}
      ${section('Channels to clear', d.channels, (c) => `<div class="mem-row"><b>${esc(c.value)}</b>
        <span>${esc(c.platform)}</span><span class="mem-when">${esc(c.status)}</span></div>`)}`;

    host.querySelector('.mem-x').addEventListener('click', close);
  }

  /* ── alerts: what the site emailed YOU, and the switch that stops it ── */
  /* These used to exist only in an inbox — sent and forgotten, with no way to
     see from here what had gone out or to stop it without a redeploy. The log
     records suppressed alerts too, so muting is reversible and you can read
     what you would have received while it was off. */
  async function paintAlerts() {
    const d = await get('/alerts');
    const rows = d.alerts || [];
    const badge = { sent: 'rv-sent', failed: 'rv-err', suppressed: 'rv-mut' };
    const counts = rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
    const kinds = d.kinds || {};
    const labels = d.labels || {};
    paint(`
      <div class="al-switch ${d.muted ? 'off' : 'on'}">
        <div>
          <b>Automated email is ${d.muted ? 'OFF' : 'ON'}</b>
          <p>${d.muted
            ? 'Nothing is being emailed to you. Alerts are still recorded below, so you can turn this back on and lose nothing in between.'
            : 'Each kind can be silenced on its own below. Suppressed alerts are still logged, so turning one back on loses nothing in between.'}</p>
        </div>
        <button class="rv-btn ${d.muted ? 'rv-ok' : ''}" id="alMute">${d.muted ? 'Turn all on' : 'Stop everything'}</button>
      </div>

      <div class="al-kinds">
        ${Object.entries(labels).map(([k, meta]) => `
          <label class="al-kind${kinds[k] ? ' off' : ''}">
            <input type="checkbox" data-kind="${k}"${kinds[k] ? '' : ' checked'}>
            <span><b>${esc(meta.label)}</b><i>${esc(meta.note)}</i></span>
          </label>`).join('')}
        <p class="rv-hint">Claims and rights disputes always send, even with messages
          switched off — muting “a message came in” should not silence a legal notice.</p>
      </div>
      <p class="db-empty" style="padding-top:0">
        ${rows.length ? `${rows.length} logged · ${counts.sent || 0} sent, ${counts.suppressed || 0} suppressed, ${counts.failed || 0} failed`
                      : 'Nothing logged yet. Alerts sent before this log existed are only in your inbox.'}</p>
      ${rows.map((r) => `
        <details class="rv-mrow">
          <summary>
            <b>${esc(r.subject)}</b>
            <span style="color:var(--muted)">${r.kind === 'digest' ? 'daily digest' : 'visitor'}</span>
            <span class="${badge[r.status] || ''}">${r.status}${r.note ? ' · ' + esc(r.note) : ''}</span>
            <span style="margin-left:auto;color:var(--muted)">${fmt(r.ts)}</span>
          </summary>
          <pre>${esc(r.body)}</pre></details>`).join('')}`);

    app.querySelectorAll('.al-kind input[data-kind]').forEach((cb) =>
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        await post('/alerts/mute', { kind: cb.dataset.kind, muted: !cb.checked });
        load();
      }));

    const btn = document.getElementById('alMute');
    if (btn) btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      await post('/alerts/mute', { muted: !d.muted });
      load();
    });
  }

  /* ── storage: R2 + D1 (worker) and the Pages repo (GitHub public API) ── */
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const human = (b) => b == null ? '—' : b >= GB ? (b / GB).toFixed(2) + ' GB' : b >= MB ? (b / MB).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  const PREFIX_NAMES = { audio: 'Mutra — audio', covers: 'Mutra — cover art', waves: 'Mutra — waveforms',
    work: 'Snowstar — work films', 'work-thumbs': 'Snowstar — work thumbs', clients: 'Client logos',
    submissions: 'Artist submissions', '(root)': 'Other' };

  function gauge(label, used, limit, note) {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    const warn = pct > 80;
    return `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:6px">
        <b>${label}</b><span style="color:${warn ? '#f87171' : 'var(--muted)'}">
          ${human(used)} of ${human(limit)} · ${pct.toFixed(pct < 10 ? 1 : 0)}%</span></div>
      <div style="height:8px;border-radius:4px;background:var(--tint,rgba(128,128,128,.12));overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${warn ? '#f87171' : 'var(--grad)'};border-radius:4px"></div></div>
      ${note ? `<p class="db-empty" style="padding:6px 0 0">${note}</p>` : ''}</div>`;
  }

  async function paintStorage() {
    const s = await get('/storage');
    const trash = await get('/storage/trash').catch(() => ({ count: 0, bytes: 0, items: [] }));
    let gh = null;
    try {
      const repo = await fetch('https://api.github.com/repos/oritoledano/snowstar').then((r) => r.ok ? r.json() : null);
      if (repo && repo.size != null) gh = repo.size * 1024; // API reports KB
    } catch {}
    const rows = Object.entries(s.r2.prefixes || {}).sort((a, b) => b[1] - a[1]);
    paint(`
      <div class="db-panel"><h2>Cloudflare R2 <span class="pill">${s.r2.count} files</span></h2>
        ${gauge('Bucket total', s.r2.total, s.r2.limit, 'Free tier: 10 GB storage, zero egress fees.')}
        ${table(rows, [
          { label: 'What', get: (r) => PREFIX_NAMES[r[0]] || esc(r[0]) },
          { label: 'Size', num: true, get: (r) => human(r[1]) },
          { label: 'Share', num: true, bar: true, get: (r) => (r[1] / s.r2.total * 100).toFixed(1) + '%' },
        ], { barKey: 1 })}</div>
      <div class="db-panel"><h2>Trash <span class="pill">${trash.count || 0} file${
          trash.count === 1 ? '' : 's'}</span></h2>
        <p class="db-empty" style="padding-top:0">A rejected upload used to stay in the live
          bucket forever — off the catalogue, still stored, still billed. Rejecting now moves
          the audio here instead of deleting it, because rejections get reversed. Emptying is
          the one thing on this page that cannot be undone.</p>
        ${trash.count
          ? `${table((trash.items || []).slice(0, 12), [
               { label: 'File', get: (r) => esc(String(r.key).replace(/^trash\//, '')) },
               { label: 'Size', num: true, get: (r) => human(r.size) },
               { label: 'Binned', num: true, get: (r) => r.at ? fmtD(r.at) : '—' },
             ])}
             <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
               <button class="rv-btn rv-no" id="tr-empty">Empty trash — ${human(trash.bytes)}</button>
               <span class="db-empty" style="padding:0">${trash.count} file${
                 trash.count === 1 ? '' : 's'} deleted for good.</span>
             </div>`
          : '<p class="db-empty">Empty. Nothing rejected is taking up space.</p>'}
      </div>
      <div class="db-grid">
        <div class="db-panel"><h2>Cloudflare D1 — accounts &amp; data</h2>
          ${table(Object.entries(s.d1.tables || {}).sort((a, b) => b[1] - a[1]).slice(0, 12), [
            { label: 'Table', get: (r) => esc(r[0]) },
            { label: 'Rows', num: true, bar: true, get: (r) => r[1] },
          ], { barKey: 1 })}
          <p class="db-empty">Everything editable lives here — members, works, submissions, rights records, notes.
          The database is a few MB; the free-tier ceiling is ${esc(s.d1.limit_note || '500MB')}.</p></div>
        <div class="db-panel"><h2>GitHub — the site itself</h2>
          ${gh != null
            ? gauge('Pages repository', gh, GB, 'GitHub Pages soft limit is 1 GB. The big videos moved to R2, so this stays lean.')
            : '<p class="db-empty">Couldn’t reach the GitHub API just now (rate limit) — try again in a minute.</p>'}</div>
      </div>`);

    const emptyBtn = document.getElementById('tr-empty');
    if (emptyBtn) emptyBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${trash.count} rejected file${trash.count === 1 ? '' : 's'} for good?\n\n`
                 + `This frees ${human(trash.bytes)} and cannot be undone.`)) return;
      emptyBtn.disabled = true;
      emptyBtn.textContent = 'Emptying…';
      // The count goes with the request: a page left open since before three
      // more rejections must not be able to delete files it never listed.
      const r = await fetch(`/api/storage/trash?confirm=${trash.count}`,
        { method: 'DELETE', credentials: 'same-origin' }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { alert(`Deleted ${r.deleted} file${r.deleted === 1 ? '' : 's'}.`); load(); }
      else {
        alert(r && r.error === 'confirm_mismatch'
          ? 'The trash changed since this page loaded. Refreshing.'
          : 'Could not empty the trash.');
        load();
      }
    });
  }

  /* ── jobs: the ledger of work sold ──────────────────────────────────────
     Every row is editable in place. There is no "edit" mode and no save
     button, because the reason ledgers like this go stale is that updating
     one cell costs four clicks; here it costs one, and the save happens when
     the field loses focus.

     Edits are merged into the stored row object rather than assembled from
     the inputs alone. The server rewrites every column on update, so a field
     the table does not show — work_id, source, the original filename this
     row was parsed out of — would be blanked by anything that only sent what
     was on screen. */
  let jobsAll = [], jobsMeta = {}, jobQ = '', jobYear = '', jobLic = '';

  const jobYears = () => [...new Set(jobsAll.map((j) => (j.job_date || '').slice(0, 4))
    .filter(Boolean))].sort().reverse();

  function jobsShown() {
    const q = jobQ.trim().toLowerCase();
    return jobsAll.filter((j) => {
      if (jobYear && (j.job_date || '').slice(0, 4) !== jobYear) return false;
      // Three-way, so "no licence" means an established no rather than
      // sweeping in every row nobody has looked at yet.
      if (jobLic === 'y' && j.licensed !== 1) return false;
      if (jobLic === 'n' && j.licensed !== 0) return false;
      if (jobLic === '?' && j.licensed != null) return false;
      if (!q) return true;
      return [j.project, j.client, j.agency, j.service, j.lic_media,
        j.lic_territory, j.note, j.source].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }

  const dl = (id, list) => `<datalist id="${id}">${
    list.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

  async function paintJobs() {
    const d = await get('/jobs');
    jobsAll = d.jobs || [];
    jobsMeta = d;

    paint(`
      <div class="db-panel jb-panel">
        <h2>Jobs <span class="pill" id="jb-count"></span></h2>
        <p class="db-empty" style="padding-top:0">Every piece of work sold, and — the part
          that is nowhere else — exactly what licence went with it. Read out of the price-offer
          archive twice over, by two readers who never saw each other’s answers: a cell is
          filled only where both read it off the page and agreed. Where they didn’t, it is
          blank and the ● says why. Type in any cell; it saves when you click away.</p>

        <div class="jb-bar">
          <input id="jb-q" class="jb-search" type="search" placeholder="Search project, client, anything…" value="${esc(jobQ)}">
          <select id="jb-year"><option value="">All years</option>${
            jobYears().map((y) => `<option value="${y}"${y === jobYear ? ' selected' : ''}>${y}</option>`).join('')}</select>
          <select id="jb-lic"><option value="">Any licence state</option>
            <option value="y"${jobLic === 'y' ? ' selected' : ''}>Licensed</option>
            <option value="n"${jobLic === 'n' ? ' selected' : ''}>No licence</option>
            <option value="?"${jobLic === '?' ? ' selected' : ''}>Licence unknown</option></select>
          <button class="rv-btn rv-ok" id="jb-new">+ New job</button>
          <a class="rv-btn" id="jb-csv" href="/api/jobs/export">Export CSV</a>
        </div>

        ${dl('dl-service', jobsMeta.services || [])}
        ${dl('dl-media', jobsMeta.media || [])}
        ${dl('dl-terr', jobsMeta.territories || [])}
        ${dl('dl-period', ['6 months', '1 year', '2 years', '3 years', 'Perpetual', 'Campaign only', 'Unlimited'])}
        ${dl('dl-client', [...new Set(jobsAll.map((j) => j.client).filter(Boolean))].sort())}

        <div class="jb-scroll">
          <table class="jb-table"><thead><tr>
            <th style="width:118px">Date</th><th>Project</th><th>Client</th><th style="width:150px">Service</th>
            <th style="width:44px" title="Was a licence granted?">Lic</th>
            <th style="width:130px">Media</th><th style="width:110px">Period</th>
            <th style="width:110px">Territory</th><th style="width:56px" title="Cuts, derivatives, versions">Cuts</th>
            <th style="width:28px"></th>
          </tr></thead><tbody id="jb-body"></tbody></table>
        </div>
      </div>`);

    const body = document.getElementById('jb-body');

    function fill() {
      const rows = jobsShown();
      document.getElementById('jb-count').textContent =
        rows.length === jobsAll.length ? `${jobsAll.length} jobs`
                                       : `${rows.length} of ${jobsAll.length}`;
      body.innerHTML = rows.length ? rows.map((j) => {
        const t = (n, v, extra = '') =>
          `<input name="${n}" value="${esc(v == null ? '' : v)}"${extra}>`;
        // Three states: granted, not granted, and nobody has checked. Only an
        // explicit "no" dims the licence columns — an unknown row must not look
        // like a settled answer.
        const L = j.licensed == null ? '?' : (j.licensed ? 'y' : 'n');
        return `<tr data-id="${j.id}" class="${L === 'n' ? 'jb-nolic' : L === '?' ? 'jb-unk' : ''}">
          <td>${t('job_date', j.job_date, ' type="date"')}</td>
          <td class="jb-proj">${t('project', j.project, j.work_title ? ` title="Portfolio: ${esc(j.work_title)}"` : '')}${
            j.work_id ? '<span class="jb-link" title="Linked to a portfolio work">◆</span>' : ''}</td>
          <td>${t('client', j.client, ' list="dl-client"')}</td>
          <td>${t('service', j.service, ' list="dl-service"')}</td>
          <td class="jb-c"><button class="jb-lic jb-lic-${L}" data-l="${L}" title="${
            L === 'y' ? 'A licence was granted' : L === 'n' ? 'No licence — click to cycle'
                      : 'Not known — the document does not say. Click to set.'}">${
            L === 'y' ? '✓' : L === 'n' ? '✕' : '–'}</button></td>
          <td>${t('lic_media', j.lic_media, ' list="dl-media"')}</td>
          <td>${t('lic_period', j.lic_period, ' list="dl-period"')}</td>
          <td>${t('lic_territory', j.lic_territory, ' list="dl-terr"')}</td>
          <td>${t('versions', j.versions, ' type="number" min="0" class="jb-n"')}</td>
          <td class="jb-c jb-acts">
            <button class="jb-note${j.note ? ' has' : ''}" title="${
              j.note ? esc(j.note) : 'Add a note'}">${j.note ? '●' : '○'}</button>
            <button class="jb-del" title="Delete this row">×</button></td>
        </tr>`;
      }).join('')
        : `<tr><td colspan="10"><p class="db-empty">Nothing matches.</p></td></tr>`;
    }

    /* Notes matter more here than in most tables: most of this ledger was read
       off scanned offers by two independent readers, and a blank licence cell
       means one of two very different things — the document did not say, or the
       readers did not agree. The note is where that distinction lives, so it
       needs to be one click away rather than CSV-only. */
    function toggleNote(tr) {
      const open = tr.nextElementSibling;
      if (open && open.classList.contains('jb-noterow')) { open.remove(); return; }
      body.querySelectorAll('.jb-noterow').forEach((r) => r.remove());
      const j = jobsAll.find((x) => x.id === Number(tr.dataset.id));
      const row = document.createElement('tr');
      row.className = 'jb-noterow';
      row.innerHTML = `<td colspan="10"><textarea placeholder="Why this row looks the way it does — what the document said, what it didn’t.">${
        esc(j && j.note ? j.note : '')}</textarea></td>`;
      tr.after(row);
      const ta = row.querySelector('textarea');
      ta.focus();
      ta.addEventListener('change', async () => {
        if (!j) return;
        j.note = ta.value;
        await post('/jobs', j);
        const b = tr.querySelector('.jb-note');
        b.classList.toggle('has', !!j.note);
        b.textContent = j.note ? '●' : '○';
        b.title = j.note || 'Add a note';
      });
    }

    async function save(tr) {
      const id = Number(tr.dataset.id);
      const j = jobsAll.find((x) => x.id === id);
      if (!j) return;
      tr.querySelectorAll('input[name]').forEach((el) => { j[el.name] = el.value; });
      const L = tr.querySelector('.jb-lic').dataset.l;
      j.licensed = L === 'y' ? 1 : L === 'n' ? 0 : null;
      tr.classList.toggle('jb-nolic', L === 'n');
      tr.classList.toggle('jb-unk', L === '?');
      tr.classList.add('jb-saving');
      const r = await post('/jobs', j);
      tr.classList.remove('jb-saving');
      // A row that failed to save must not look saved — the whole value of a
      // ledger is that what is on screen is what is stored.
      tr.classList.toggle('jb-bad', !r.ok);
    }

    body.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr && e.target.name) save(tr);
    });
    body.addEventListener('click', async (e) => {
      const lb = e.target.closest('.jb-lic');
      if (lb) {                                   // unknown -> yes -> no -> unknown
        const next = { '?': 'y', y: 'n', n: '?' }[lb.dataset.l];
        lb.dataset.l = next;
        lb.className = 'jb-lic jb-lic-' + next;
        lb.textContent = next === 'y' ? '✓' : next === 'n' ? '✕' : '–';
        return save(lb.closest('tr'));
      }
      const nb = e.target.closest('.jb-note');
      if (nb) return toggleNote(nb.closest('tr'));
      const b = e.target.closest('.jb-del');
      if (!b) return;
      const tr = b.closest('tr'), id = Number(tr.dataset.id);
      const j = jobsAll.find((x) => x.id === id);
      if (!confirm(`Delete “${j ? j.project : id}”? This can’t be undone.`)) return;
      await post('/jobs', { remove: id });
      jobsAll = jobsAll.filter((x) => x.id !== id);
      fill();
    });

    document.getElementById('jb-q').addEventListener('input', (e) => { jobQ = e.target.value; fill(); });
    document.getElementById('jb-year').addEventListener('change', (e) => { jobYear = e.target.value; fill(); });
    document.getElementById('jb-lic').addEventListener('change', (e) => { jobLic = e.target.value; fill(); });

    document.getElementById('jb-new').addEventListener('click', async () => {
      const r = await post('/jobs', { project: 'Untitled job', job_date: new Date().toISOString().slice(0, 10) });
      if (!r.ok) return;
      // Clear the filters, or the new row is created into a view that hides it.
      jobQ = ''; jobYear = ''; jobLic = '';
      document.getElementById('jb-q').value = '';
      document.getElementById('jb-year').value = '';
      document.getElementById('jb-lic').value = '';
      jobsAll.unshift({ id: r.id, project: 'Untitled job', licensed: 0,
        job_date: new Date().toISOString().slice(0, 10) });
      fill();
      const el = body.querySelector('tr [name="project"]');
      if (el) { el.focus(); el.select(); }
    });

    fill();
  }

  /* ── invoices ─────────────────────────────────────────────────────────────
     Every paid licence is listed with the document it WOULD produce, and
     nothing is sent until you press the button. A tax invoice cannot be
     deleted once issued — only cancelled with a credit note — so the one-click
     gate is deliberate, not a stepping stone to automatic. */
  async function paintInvoices() {
    // The connection check runs on open rather than on a button. Which business
    // your invoices come from is the first thing you need to know here, so it
    // should not be something you have to think to ask for.
    const [d, who] = await Promise.all([
      get('/invoices'),
      get('/invoices/whoami').catch((e) => ({ ok: false, detail: String(e) })),
    ]);
    const ils = (n) => '₪' + (n / 100).toFixed(2);
    const when = (t) => (t ? new Date(t * 1000).toLocaleDateString() : '—');

    const setup = d.configured ? '' : `<div class="db-warn">
      <b>Not connected yet.</b> Green Invoice needs two Worker secrets. In
      <code>worker/</code> run <code>npx wrangler secret put GREENINVOICE_ID</code> and then
      <code>npx wrangler secret put GREENINVOICE_SECRET</code>, pasting the key and secret from
      morning → Settings → API. Regenerate the key first if it has ever been on screen.
      Until then this page lists what is waiting but cannot send it.</div>`;

    /* The business bar, always on screen. Locking is the safety catch that stops
       a document going into the wrong company's books, so it lives here in the
       open rather than behind a button somebody has to know to press. */
    const b = who.business;
    const list = who.businesses || (b ? [b] : []);
    const bar = !who.ok
      ? `<div class="db-warn"><b>Not connected.</b> ${esc(who.detail || who.error || '')}</div>`
      : `<div class="db-warn${who.drifted || !who.pinned ? ' warn' : ' good'}">
          ${who.drifted
            ? '<b>The business changed since you locked it. Issuing is blocked.</b><br>'
            : who.pinned ? '' : '<b>Nothing is locked yet — issuing is blocked until you pick one.</b><br>'}
          Issuing from <b><bdi>${esc((b && (b.name || b.nameEn)) || '—')}</bdi></b>${
            b && b.taxId ? ` · ${esc(b.taxId)}` : ''}.
          ${list.length > 1 ? `This login owns ${list.length} businesses and morning always uses whichever
            is default — a setting that can be changed on their website. Lock one so a change stops
            issuing instead of quietly switching your books.` : ''}
          <div class="inv-locks">${list.map((x) => `
            <button class="rv-btn${x.id === who.pinned ? ' rv-ok' : ''}" data-pin="${esc(x.id)}"
              data-pinname="${esc(x.name || x.id)}">${x.id === who.pinned ? '✓ Locked — ' : 'Lock to '}<bdi>${
              esc(x.nameEn || x.name || x.id)}</bdi></button>`).join('')}
            <button class="rv-btn" id="inv-who">Re-check</button></div>
          <details style="margin-top:8px"><summary style="cursor:pointer">Raw reply</summary>
            <pre style="white-space:pre-wrap;font-size:.72rem;margin-top:8px">${
              esc(JSON.stringify(who.raw || who.tried, null, 1))}</pre></details></div>`;

    paint(`<div class="db-panel">
      <h2>Invoices <span class="pill">${d.pending.length} to issue</span></h2>
      ${bar}
      <p class="db-empty" style="padding-top:0">Paid licences that have no tax document yet.
        Check the name and the amount, then issue — it goes straight to your morning account as a
        חשבונית מס/קבלה and the customer gets the PDF link.</p>
      ${setup}

      ${d.pending.length ? `<label class="inv-mail">
          <input type="checkbox" id="inv-email"> Email the customer their invoice
          <span class="inv-sub" style="display:inline">— morning sends it automatically when this is on.
            Leave it off while testing.</span>
        </label>
        <div class="inv-list">${d.pending.map((p) => `
        <div class="inv-row">
          <div class="inv-main">
            <b>${esc(p.licensee_name || p.email || '—')}</b>
            <span class="inv-sub">${esc(p.ref)} · ${esc(p.slug)}${p.project_name ? ' · ' + esc(p.project_name) : ''}</span>
          </div>
          <div class="inv-money">
            <b>${ils(Math.round(p.amount * 1.18))}</b>
            <span class="inv-sub">${ils(p.amount)} + VAT · ${when(p.granted_at)}</span>
          </div>
          <button class="rv-btn" data-preview="${p.id}"${d.configured ? '' : ' disabled'}>Preview</button>
          <button class="rv-btn rv-ok" data-issue="${p.id}"${d.configured ? '' : ' disabled'}>Issue</button>
        </div>`).join('')}</div>`
        : '<p class="db-empty">Nothing waiting. Every paid licence has its document.</p>'}

      ${d.issued.length ? `<h3 style="margin-top:26px">Issued</h3>
        <div class="inv-list">${d.issued.map((i) => `
          <div class="inv-row${i.status === 'failed' ? ' bad' : ''}">
            <div class="inv-main">
              <b>${esc(i.number || i.status)}</b>
              <span class="inv-sub">${esc(i.licence_ref || '')}${i.last_error ? ' · ' + esc(i.last_error) : ''}</span>
            </div>
            <div class="inv-money"><b>${ils(i.amount || 0)}</b>
              <span class="inv-sub">${when(i.issued_at || i.ts)}</span></div>
            ${i.url ? `<a class="rv-btn" href="${esc(i.url)}" target="_blank" rel="noopener">PDF</a>`
              : `<button class="rv-btn" data-retry="${i.licence_id}">Retry</button>`}
          </div>`).join('')}</div>` : ''}
    </div>`);

    /* Locking, and re-checking. Both just reload the panel, which re-reads the
       business — one render path, so the bar can never disagree with itself. */
    app.querySelectorAll('[data-pin]').forEach((pb) => pb.onclick = async () => {
      await post('/invoices/pin', { business_id: pb.dataset.pin, name: pb.dataset.pinname });
      load();
    });
    const recheck = app.querySelector('#inv-who');
    if (recheck) recheck.onclick = () => { recheck.textContent = 'Checking…'; load(); };


    /* Preview renders the exact document morning would produce, without creating
       one. It is the closest thing to a draft the API has — there is no draft for
       outgoing documents, and issuing is final the moment it returns. */
    app.querySelectorAll('[data-preview]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Rendering…';
      const r = await post('/invoices/preview', { licence_id: Number(b.dataset.preview) });
      b.disabled = false; b.textContent = 'Preview';
      if (!r.ok) { alert(r.detail || JSON.stringify(r.body || r.error)); return; }
      const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
    });

    app.querySelectorAll('[data-issue]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Issuing…';
      const sendMail = !!(app.querySelector('#inv-email') || {}).checked;
      const r = await post('/invoices/issue',
        { licence_id: Number(b.dataset.issue), email: sendMail });
      if (r.error) { b.textContent = 'Failed'; alert(r.detail || r.error); }
      load();
    });
    app.querySelectorAll('[data-retry]').forEach((b) => b.onclick = async () => {
      await post('/invoices/retry', { licence_id: Number(b.dataset.retry) }); load();
    });
  }

  /* ── coupons ──────────────────────────────────────────────────────────────
     Codes are generated here and redeemed in the licence funnel. The discount
     itself is applied server-side at the moment the price is snapshotted — the
     browser never gets to decide what something costs. */
  async function paintCoupons() {
    const d = await get('/coupons');
    const cs = d.coupons || [];
    const ils = (n) => '₪' + (n / 100).toFixed(0);
    const when = (t) => (t ? new Date(t * 1000).toLocaleDateString() : '—');

    paint(`<div class="db-panel">
      <h2>Discount codes <span class="pill">${cs.filter((c) => c.active).length} live</span></h2>
      <p class="db-empty" style="padding-top:0">A code cuts the price at checkout. It is applied on the
        server after the price is worked out, so what somebody is charged is exactly the discount you
        set — and a code cannot be faked from the browser.</p>

      <div class="cp-new">
        <label class="ar-f"><span>Discount</span>
          <div class="cp-row2">
            <input id="cp-val" type="number" min="1" value="20">
            <select id="cp-kind"><option value="percent">% off</option><option value="amount">₪ off</option></select>
          </div></label>
        <label class="ar-f"><span>Code (blank = generate)</span>
          <input id="cp-code" placeholder="e.g. SUMMER25" maxlength="40"></label>
        <label class="ar-f"><span>Prefix for generated</span><input id="cp-prefix" placeholder="MUTRA" maxlength="12"></label>
        <label class="ar-f"><span>Max uses (0 = unlimited)</span><input id="cp-max" type="number" min="0" value="0"></label>
        <label class="ar-f"><span>Minimum spend ₪</span><input id="cp-min" type="number" min="0" value="0"></label>
        <label class="ar-f"><span>Classes it applies to</span>
          <input id="cp-cls" placeholder="blank = all, e.g. CD" maxlength="4"></label>
        <label class="ar-f"><span>Expires</span><input id="cp-exp" type="date"></label>
        <label class="ar-f"><span>Note to self</span><input id="cp-note" maxlength="200" placeholder="Black Friday"></label>
        <div class="ar-f"><span>&nbsp;</span><button class="rv-btn rv-ok" id="cp-make">Create code</button></div>
      </div>
      <p class="cp-said"></p>

      ${cs.length ? table(cs, [
        { label: 'Code', get: (c) => `<code class="cp-code">${esc(c.code)}</code>` },
        { label: 'Worth', get: (c) => c.kind === 'percent' ? c.value + '%' : ils(c.value) },
        { label: 'Applies to', get: (c) => esc(c.classes || 'all classes') },
        { label: 'Min', get: (c) => (c.min_amount ? ils(c.min_amount) : '—') },
        { label: 'Used', num: true, get: (c) => c.max_uses ? `${c.used}/${c.max_uses}` : String(c.used) },
        { label: 'Expires', get: (c) => when(c.expires_at) },
        { label: 'Note', get: (c) => esc(c.note || '') },
        { label: '', get: (c) => `<button class="rv-btn cp-tog" data-id="${c.id}">${
            c.active ? 'On' : 'Off'}</button> <button class="rv-btn cp-del" data-id="${c.id}">×</button>` },
      ], { rowAttr: (c) => c.active ? '' : ' style="opacity:.45"' })
      : '<p class="db-empty">No codes yet.</p>'}</div>`);

    const said = document.querySelector('.cp-said');
    document.getElementById('cp-make').addEventListener('click', async () => {
      const exp = document.getElementById('cp-exp').value;
      const r = await post('/coupons', {
        kind: document.getElementById('cp-kind').value,
        value: Number(document.getElementById('cp-val').value),
        code: document.getElementById('cp-code').value,
        prefix: document.getElementById('cp-prefix').value,
        max_uses: Number(document.getElementById('cp-max').value),
        min_amount: Number(document.getElementById('cp-min').value),
        classes: document.getElementById('cp-cls').value,
        note: document.getElementById('cp-note').value,
        expires_at: exp ? Math.floor(new Date(exp + 'T23:59:59').getTime() / 1000) : null,
      });
      if (r && r.ok) { said.textContent = `Created ${r.code}`; load(); }
      else said.textContent = r && r.error === 'code_taken' ? 'That code already exists.'
        : (r && r.error) || 'Could not create that code.';
    });
    app.querySelectorAll('.cp-tog').forEach((b) => b.addEventListener('click', async () => {
      await post('/coupons', { toggle: Number(b.dataset.id) }); load();
    }));
    app.querySelectorAll('.cp-del').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this code? Anyone holding it will get "no such code".')) return;
      await post('/coupons', { remove: Number(b.dataset.id) }); load();
    }));
  }

  /* ── packs ────────────────────────────────────────────────────────────────
     Named groups of tracks, with two switches: one per pack, and one for the
     whole dropdown. A new pack starts hidden, because an empty pack is not
     something a visitor should meet and creating-then-filling is otherwise a
     race the visitor can lose. */
  let openPacks = new Set();

  const COLL = {
    pack: { title: 'Packs', one: 'pack',
      blurb: 'Named groups of tracks — the “Packs” dropdown on the catalogue.',
      newPh: 'New pack name — e.g. Advertising Essentials' },
    character: { title: 'Characters', one: 'character',
      blurb: 'A character stands for a sound. A suited agent with a pistol says spy thriller before '
           + 'a single tag is read; a fairy-tale creature says children’s film. Each one groups the '
           + 'tracks that fit it, and gets its own package artwork.',
      newPh: 'New character — e.g. The Secret Agent' },
  };

  async function paintCollections(kind) {
    const W = COLL[kind];
    const d = await get('/collections?kind=' + kind);
    const packs = d.collections || [];
    paint(`<div class="db-panel">
      <h2>${W.title} <span class="pill">${packs.length}</span></h2>
      <p class="db-empty" style="padding-top:0">${W.blurb} Each one has its own show/hide, and the
        switch below hides the whole dropdown while you are still building them.</p>

      <label class="pk-shelf"><input type="checkbox" id="pk-shelf" ${d.shelfHidden ? 'checked' : ''}>
        <span>Hide the entire ${W.title} dropdown from visitors</span></label>

      <div class="ar-row" style="grid-template-columns:1fr auto;margin:14px 0 18px">
        <input id="pk-new" placeholder="${W.newPh}" maxlength="120">
        <button class="rv-btn rv-ok" id="pk-add">Create ${W.one}</button>
      </div>
      <p class="cp-said" id="pk-said"></p>

      ${packs.length ? packs.map((c) => `
        <div class="pk-card${openPacks.has(c.id) ? ' open' : ''}" data-id="${c.id}">
          <div class="pk-head" role="button" tabindex="0">
            <span class="rv-caret">▸</span>
            <b>${esc(c.name)}</b>
            <span class="meta">${c.count} track${c.count === 1 ? '' : 's'}</span>
            <span class="pill ${c.hidden ? 'pk-off' : 'pk-on'}">${c.hidden ? 'hidden' : 'live'}</span>
          </div>
          <div class="pk-body">
            <div class="ar-grid">
              <label class="ar-f"><span>Name</span><input class="pk-name" value="${esc(c.name)}" maxlength="120"></label>
              ${kind === 'pack' ? `<label class="ar-f"><span>Blurb</span>
                <input class="pk-blurb" value="${esc(c.blurb)}" maxlength="400"
                  placeholder="One line, shown on the pack"></label>` : ''}
            </div>
            <label class="pk-vis"><input type="checkbox" class="pk-hide" ${c.hidden ? 'checked' : ''}>
              <span>Hidden from visitors</span></label>
            ${kind === 'character' ? `
            <label class="ar-f"><span>How they look — used to draw the package</span>
              <textarea class="pk-look" rows="2" maxlength="400"
                placeholder="A suited secret agent in a doorway, pistol low, neon behind him">${esc(c.blurb)}</textarea></label>
            <div class="pk-art">
              ${c.art ? `<img src="${esc(c.art)}" alt="">` : ''}
              <label class="rv-btn pk-artbtn">${c.art ? 'Replace artwork' : 'Upload artwork'}
                <input type="file" class="pk-artfile" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label>
              <span class="db-empty" style="padding:0;font-size:.78rem">A tall portrait works best —
                the package crops to a case shape and the lower third is covered by the title.</span>
            </div>` : ''}
            <label class="ar-f"><span>Tracks in this ${W.one}</span>
              <textarea class="pk-slugs" rows="3" placeholder="One slug per line, or comma separated">${
                esc((c.tracks || []).join(', '))}</textarea></label>
            <p class="db-empty" style="padding:4px 0 8px;font-size:.78rem">Paste slugs, or tick tracks
              in the catalogue’s Edit mode and use bulk edit. Removing a slug here takes it out of the pack;
              the track itself is untouched.</p>
            <div class="rv-acts">
              <button class="rv-btn rv-ok pk-save">Save</button>
              <button class="rv-btn rv-no pk-del">Delete pack</button>
              <span class="pk-msg"></span>
            </div>
          </div>
        </div>`).join('')
      : '<p class="db-empty">No packs yet.</p>'}</div>`);

    document.getElementById('pk-shelf').addEventListener('change', async (e) => {
      await post('/collections', { kind, shelf_hidden: e.target.checked });
      document.getElementById('pk-said').textContent = e.target.checked
        ? 'The Packs dropdown is hidden from visitors.' : 'The Packs dropdown is visible.';
    });

    document.getElementById('pk-add').addEventListener('click', async () => {
      const name = document.getElementById('pk-new').value.trim();
      if (name.length < 2) return;
      const r = await post('/collections', { kind, name });
      const said = document.getElementById('pk-said');
      if (r && r.ok) { said.textContent = `Created “${r.name}” — hidden until you show it.`; load(); }
      else said.textContent = r && r.error === 'name_taken' ? 'There is already a pack with that name.'
        : (r && r.error) || 'Could not create that pack.';
    });

    app.querySelectorAll('.pk-head').forEach((h) => {
      const card = h.closest('.pk-card'), id = Number(card.dataset.id);
      const toggle = () => {
        const open = card.classList.toggle('open');
        if (open) openPacks.add(id); else openPacks.delete(id);
      };
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    /* Art uploads on choosing, like the artist photo — a file input that only
       takes effect on Save is the one everyone forgets to press. */
    app.querySelectorAll('.pk-artfile').forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const card = inp.closest('.pk-card');
      const msg = card.querySelector('.pk-msg');
      msg.textContent = 'Uploading artwork…';
      const r = await fetch('/api/collections/art?id=' + card.dataset.id, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'content-type': f.type }, body: f,
      }).then((x) => x.json()).catch(() => null);
      msg.textContent = r && r.ok ? 'Artwork saved.' : 'Artwork failed.';
      if (r && r.ok) load();
    }));

    app.querySelectorAll('.pk-save').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.pk-card'), id = Number(card.dataset.id);
      const msg = card.querySelector('.pk-msg');
      msg.textContent = 'Saving…';
      const look = card.querySelector('.pk-look');
      const r1 = await post('/collections', { id, kind,
        name: card.querySelector('.pk-name').value,
        blurb: look ? look.value : card.querySelector('.pk-blurb').value,
        hidden: card.querySelector('.pk-hide').checked });
      /* Membership is replaced, not merged: the box shows what is in the pack,
         so what it says after an edit has to be what the pack contains. */
      const want = card.querySelector('.pk-slugs').value
        .split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
      const had = (packs.find((c) => c.id === id) || {}).tracks || [];
      const add = want.filter((x) => !had.includes(x));
      const gone = had.filter((x) => !want.includes(x));
      if (gone.length) await post('/collections/tracks', { id, slugs: gone, remove: true });
      if (add.length) await post('/collections/tracks', { id, slugs: add });
      msg.textContent = r1 && r1.ok ? `Saved · +${add.length} −${gone.length}` : 'Could not save.';
      if (r1 && r1.ok) load();
    }));

    app.querySelectorAll('.pk-del').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.pk-card');
      const name = card.querySelector('b').textContent;
      if (!confirm(`Delete the ${W.one} “${name}”?\n\nThe tracks stay in the catalogue — only the grouping goes.`)) return;
      const r = await post('/collections', { remove: Number(card.dataset.id) });
      if (r && r.ok) load();
    }));
  }

  addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#', '');
    if (TABS.includes(h) && h !== tab) { tab = h; load(); }
  });

  (function boot(n) {
    if (window.SnowstarAccount && SnowstarAccount.ready) return load();
    if (n > 40) return load();
    setTimeout(() => boot(n + 1), 100);
  })(0);
})();
