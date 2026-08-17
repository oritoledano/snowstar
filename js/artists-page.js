/* ═══════════ Artist dashboard — sign up, upload, track your submissions ═══ */
(function () {
  const M = window.SnowstarAccount;
  if (!M) return;
  const $ = (s) => document.querySelector(s);
  const gate = $('#arGate'), reg = $('#arRegister'), dash = $('#arDash');
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtSize = (b) => (b / 1048576).toFixed(1) + 'MB';
  const STATUS_WORD = { pending: 'In review', approved: 'Accepted', rejected: 'Not this one' };

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

  // ── which of the three states is this visitor in? ──
  let lastUser = null;
  async function render() {
    const u = M.user;
    gate.hidden = !!u;
    if (!u) { reg.hidden = true; dash.hidden = true; lastUser = null; return; }
    if (u === lastUser && !dash.hidden) return;
    lastUser = u;
    try {
      const d = await fetch('/api/artist/uploads', { credentials: 'same-origin' }).then((r) => r.json());
      reg.hidden = !!d.artist;
      dash.hidden = !d.artist;
      if (d.artist) {
        $('#arWho').textContent = d.artist_name || '';
        $('#arName').value = d.artist_name || '';
        paintList(d.uploads || []);
      }
    } catch { /* leave as-is */ }
  }
  M.onChange(render);
  render();

  // ── become an artist (also serves renames — the API call is an update) ──
  $('#arRegBtn').addEventListener('click', async () => {
    const name = $('#arName').value.trim();
    const st = $('#arRegStatus');
    if (name.length < 2) { st.textContent = 'Give us a name to credit.'; st.hidden = false; return; }
    try {
      await api('/artist/register', { artist_name: name });
      st.hidden = true;
      reg.hidden = true; dash.hidden = false;
      $('#arWho').textContent = name;
      const d = await fetch('/api/artist/uploads', { credentials: 'same-origin' }).then((r) => r.json());
      paintList(d.uploads || []);
    } catch (e) { st.textContent = 'Couldn’t save that — try again.'; st.hidden = false; }
  });

  // change the credited name any time
  $('#arRename').addEventListener('click', () => {
    dash.hidden = true;
    reg.hidden = false;
    $('#arName').focus();
  });

  // ── uploads ──
  const drop = $('#arDrop'), fileInput = $('#arFile'), upStatus = $('#arUpStatus');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));
  fileInput.addEventListener('change', () => { handleFiles([...fileInput.files]); fileInput.value = ''; });

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

  async function handleFiles(files) {
    const audio = files.filter((f) => /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i.test(f.name));
    if (!audio.length) { say('Those aren’t audio files we accept.'); return; }
    const note = $('#arNote').value.trim();
    let done = 0;
    for (const f of audio) {
      if (f.size > 95 * 1024 * 1024) { say(`“${f.name}” is over 95MB — export a smaller master.`); continue; }
      try {
        const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        const up = await put('/artist/upload?filename=' + encodeURIComponent(f.name), f,
          (pct) => say(`Uploading “${title}”… ${pct}%  (${done + 1}/${audio.length})`));
        await api('/artist/submissions', { title, key: up.key, note });
        done++;
      } catch (e) {
        say(`“${f.name}” failed: ${e.message} — try that one again.`);
      }
    }
    if (done) {
      say(`${done} track${done === 1 ? '' : 's'} submitted — we listen to everything and you'll see the verdict here.`);
      const d = await fetch('/api/artist/uploads', { credentials: 'same-origin' }).then((r) => r.json());
      paintList(d.uploads || []);
    }
  }

  function say(msg) { upStatus.textContent = msg; upStatus.hidden = false; }

  function paintList(items) {
    const ul = $('#arList');
    if (!items.length) {
      ul.innerHTML = '<li style="color:var(--muted)">Nothing yet — your uploads appear here.</li>';
      return;
    }
    ul.innerHTML = items.map((s) => `
      <li style="flex-wrap:wrap">
        <b>${s.title.replace(/</g, '&lt;')}</b>
        <span style="color:var(--muted);font-size:.8rem">${fmtSize(s.size)} · ${fmtDate(s.created_at)}</span>
        <span class="ar-badge ${s.status}">${STATUS_WORD[s.status] || s.status}</span>
        ${s.review_note ? `<span class="ar-rnote">“${s.review_note.replace(/</g, '&lt;')}”</span>` : ''}
      </li>`).join('');
  }
})();
