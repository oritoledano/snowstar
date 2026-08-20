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

  const TABS = ['overview', 'stats', 'members', 'artists', 'upload', 'submissions', 'notifications', 'storage', 'pipeline'];
  let tab = (location.hash || '').replace('#', '');
  if (!TABS.includes(tab)) tab = 'overview';
  let days = 30, subTab = 'pending';

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
      <div class="db-tabs">${TABS.map((t) =>
        `<button class="db-tab ${t === tab ? 'active' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
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
    try {
      if (tab === 'overview') return paintOverview();
      if (tab === 'stats') return paintStats();
      if (tab === 'members') return paintMembers();
      if (tab === 'artists') return paintArtists();
      if (tab === 'submissions') return paintSubmissions();
      if (tab === 'notifications') return paintMail();
      if (tab === 'storage') return paintStorage();
      if (tab === 'upload') return paintUpload();
      if (tab === 'pipeline') return paintPipeline();
    } catch (e) {
      if (e.message === 'forbidden') gate();
      else paint(`<p class="db-empty">Couldn’t load that right now — try a refresh.</p>`);
    }
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
    try { managed = (await get('/managed-artists')).artists || []; } catch {}
    paint(`
      <section class="db-card">
        <h3>Upload tracks</h3>
        <label class="up-field"><span>Credit to</span>
          <select id="upAs">
            <option value="">Myself</option>
            ${managed.map((a) => `<option value="${a.id}">${esc(a.name)}${a.claimed_user_id ? ' ✓ claimed' : ''}</option>`).join('')}
            <option value="new">＋ New managed artist…</option>
          </select></label>
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
          <td>${esc(r.email)}</td>
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
  async function paintArtists() {
    const d = await get('/artists');
    paint(`<div class="db-panel"><h2>Artists <span class="pill">${(d.artists || []).length}</span></h2>
      ${table(d.artists || [], [
        { label: 'Artist', get: (r) => `<b>${esc(r.name || '—')}</b>` },
        { label: 'Email', get: (r) => esc(r.email) },
        { label: 'Status', get: (r) => `<span class="db-badge ${r.kind}">${
            r.kind === 'ghost' ? 'awaiting signup' : r.kind === 'claimed' ? 'claimed' : 'has account'}</span>` },
        { label: 'Uploads', num: true, get: (r) => r.uploads },
        { label: 'Accepted', num: true, get: (r) => r.approved },
        { label: 'Since', get: (r) => fmtD(r.created_at) },
      ])}
      <p class="db-empty">“Awaiting signup” artists are ones you upload for — they claim their profile
      (and countersign their declarations) when they create an account with that email.</p></div>`);
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
        <div class="rv-item" data-id="${s.id}">
          <div class="rv-top"><b>${esc(s.title)}</b>
            <span class="who">${esc(s.artist_name || s.email)}</span>
            <span class="meta">${(s.size / 1048576).toFixed(1)}MB · ${esc(s.ext)} · ${fmt(s.created_at)}</span>
            ${laneChip(s)}${s.status === 'approved' ? (s.published_slug
              ? `<span class="rv-pub live">in catalog</span>`
              : `<span class="rv-pub">not in catalog yet</span>`) : ''}</div>
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
          <div class="rv-editor" hidden></div></div>`).join('')
      : `<p class="db-empty">${subTab === 'pending' ? 'Nothing waiting — inbox zero.' : 'Nothing here yet.'}</p>`}
      <p class="db-empty">Approving marks a track for the catalog — it does <b>not</b> publish it.
        The audio stays in the private submissions area until it is analysed, given a waveform and
        artwork, and added to the catalog file. Ask Claude to “process approved uploads” to take
        them live.</p>`);
    app.querySelectorAll('[data-st]').forEach((b) =>
      b.addEventListener('click', () => { subTab = b.dataset.st; load(); }));
    app.querySelectorAll('.rv-edit').forEach((b) =>
      b.addEventListener('click', () => openDeclEditor(b.closest('.rv-item'), items)));
    app.querySelectorAll('.rv-item .rv-btn').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = Number(b.closest('.rv-item').dataset.id);
        const status = b.dataset.a;
        const note = status === 'pending' ? '' :
          (prompt(status === 'approved' ? 'Note to the artist (optional):' : 'Tell them why (they will see this):') || '');
        await post('/submissions/review', { id, status, note });
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
