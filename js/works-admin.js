/* ═══════════ Work grid editor — owner only ═══════════
   Appears only for an admin account. Add, edit, delete and drag-to-reorder
   the portfolio; files go straight to R2 and the list to D1 via the Worker,
   so every change is live the moment it lands — no build, no deploy. */
(function () {
  const M = window.SnowstarAccount;
  const grid = document.getElementById('workGrid');
  const controls = document.getElementById('workControls');
  if (!M || !grid || !controls) return;

  let editing = false;
  let mounted = false;

  const CDN_MEDIA = [['TV', 'TV'], ['DIGITAL', 'Digital'], ['RADIO', 'Radio'], ['IN_APP', 'In-App']];
  const EXTRA_TAGS = [['PERFORMANCE', 'Performance'], ['KAYMA', 'KAYMA']];

  const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'work';

  async function api(path, body) {
    const res = await fetch('/api' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'request_failed');
    return d;
  }

  /** Upload with progress via XHR (fetch can't report upload progress). */
  function upload(key, file, onPct) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/works/upload?key=' + encodeURIComponent(key));
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round(e.loaded / e.total * 100));
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText);
          xhr.status === 200 ? resolve(d.url) : reject(new Error(d.error || 'upload_failed'));
        } catch { reject(new Error('upload_failed')); }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(file);
    });
  }

  // ── toolbar ──
  const bar = document.createElement('div');
  bar.className = 'wed-bar';
  bar.innerHTML = `
    <button class="work-chip" id="wedToggle">Edit works</button>
    <button class="work-chip" id="wedAdd" hidden>＋ Add work</button>
    <span class="wed-hint" hidden>drag cards to reorder — order saves on drop</span>`;

  function mount() {
    if (mounted) return;
    mounted = true;
    controls.after(bar);
    bar.querySelector('#wedToggle').addEventListener('click', toggle);
    bar.querySelector('#wedAdd').addEventListener('click', () => openForm(null));
    buildModal();
  }

  function toggle() {
    editing = !editing;
    document.body.classList.toggle('work-editing', editing);
    bar.querySelector('#wedToggle').textContent = editing ? 'Done editing' : 'Edit works';
    bar.querySelector('#wedToggle').classList.toggle('active', editing);
    bar.querySelector('#wedAdd').hidden = !editing;
    bar.querySelector('.wed-hint').hidden = !editing;
    decorate();
    // leaving edit mode: rebuild so the pristine 20-card view and filters return
    if (!editing) window.SnowstarWorks.reload();
  }

  /** Cards are rebuilt on every reload — reattach tools and drag handles. */
  function decorate() {
    grid.querySelectorAll('.work-card').forEach((card) => {
      card.draggable = editing;
      let tools = card.querySelector('.wed-tools');
      if (editing && !tools) {
        tools = document.createElement('span');
        tools.className = 'wed-tools';
        tools.innerHTML = `
          <button class="wed-act" data-act="edit" title="Edit" aria-label="Edit">✎</button>
          <button class="wed-act" data-act="del" title="Remove" aria-label="Remove">✕</button>`;
        card.appendChild(tools);
      }
      if (!editing && tools) tools.remove();
      // full cards were capped at 20 for the pristine view; the editor needs all —
      // and cards that were never scrolled to still lack the reveal class
      if (editing) { card.classList.remove('hidden-card'); card.classList.add('in'); }
    });
  }

  // block the lightbox while editing; route tool clicks
  grid.addEventListener('click', (e) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const btn = e.target.closest('.wed-act');
    if (!btn) return;
    const card = btn.closest('.work-card');
    const work = window.SnowstarWorks.list().find((w) => String(w.id) === card.dataset.id);
    if (!work) return;
    if (btn.dataset.act === 'edit') openForm(work);
    if (btn.dataset.act === 'del') removeWork(work, card);
  }, true);

  // ── drag to reorder ──
  let dragged = null;
  grid.addEventListener('dragstart', (e) => {
    if (!editing) return;
    dragged = e.target.closest('.work-card');
    dragged.classList.add('wed-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  grid.addEventListener('dragover', (e) => {
    if (!editing || !dragged) return;
    e.preventDefault();
    const over = e.target.closest('.work-card');
    if (!over || over === dragged) return;
    const r = over.getBoundingClientRect();
    const before = (e.clientX - r.left) < r.width / 2;
    grid.insertBefore(dragged, before ? over : over.nextSibling);
  });
  grid.addEventListener('dragend', async () => {
    if (!dragged) return;
    dragged.classList.remove('wed-dragging');
    dragged = null;
    const ids = [...grid.querySelectorAll('.work-card')].map((c) => Number(c.dataset.id));
    try {
      await api('/works/reorder', { ids });
      say('Order saved');
    } catch { say('Couldn’t save the order — try again'); }
  });

  function say(msg) {
    if (window.mutraToast) return window.mutraToast(msg);
    let t = document.querySelector('.acct-toast');
    if (!t) { t = document.createElement('div'); t.className = 'acct-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(say._t); say._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function removeWork(work, card) {
    if (!confirm(`Remove “${work.title}” from the portfolio? Its uploaded files go with it.`)) return;
    try {
      await api('/works/delete', { id: work.id });
      card.remove();
      say('Removed');
    } catch { say('Couldn’t remove that — try again'); }
  }

  // ── the form ──
  let modal, form;
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'wed-modal';
    modal.hidden = true;
    const chip = ([k, label]) =>
      `<label class="wed-chip"><input type="checkbox" value="${k}"><span>${label}</span></label>`;
    modal.innerHTML = `
    <div class="wed-card" role="dialog" aria-modal="true">
      <button class="wed-close" aria-label="Close">&times;</button>
      <h3 id="wedTitle">Add work</h3>
      <form id="wedForm" novalidate>
        <label class="wed-field"><span>Title</span><input name="title" required maxlength="120"></label>
        <div class="wed-two">
          <label class="wed-field"><span>Work credit (what Snowstar did)</span><input name="work" maxlength="300" placeholder="Original music & sound design"></label>
          <label class="wed-field"><span>Production</span><input name="production" maxlength="300"></label>
          <label class="wed-field"><span>Agency</span><input name="agency" maxlength="300"></label>
          <label class="wed-field"><span>Director</span><input name="director" maxlength="300"></label>
        </div>
        <p class="wed-note">Original Music / Sound Design / Voice Over follow from the work credit text automatically.</p>
        <div class="wed-group"><span>Media type</span><div class="wed-chips" data-set="media">${CDN_MEDIA.map(chip).join('')}</div></div>
        <div class="wed-group"><span>Extra tags</span><div class="wed-chips" data-set="tags">${EXTRA_TAGS.map(chip).join('')}</div></div>
        <div class="wed-two">
          <label class="wed-field wed-file"><span>Thumbnail (image)</span><input type="file" name="thumbFile" accept="image/*"></label>
          <label class="wed-field wed-file"><span>Film (video file)</span><input type="file" name="videoFile" accept="video/mp4,video/webm,video/quicktime"></label>
          <label class="wed-field wed-file"><span>Hover loop (optional, short mp4)</span><input type="file" name="previewFile" accept="video/mp4,video/webm"></label>
          <label class="wed-field"><span>…or Vimeo ID</span><input name="vimeo" inputmode="numeric" pattern="\\d*" placeholder="183543308"></label>
        </div>
        <p class="wed-status" hidden></p>
        <button type="submit" class="mbtn mbtn-solid wed-save">Save</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    form = modal.querySelector('#wedForm');
    modal.querySelector('.wed-close').addEventListener('click', closeForm);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeForm(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeForm(); });
    form.addEventListener('submit', save);
  }

  let current = null;
  function openForm(work) {
    current = work;
    form.reset();
    modal.querySelector('#wedTitle').textContent = work ? 'Edit work' : 'Add work';
    if (work) {
      form.title.value = work.title;
      const c = work.credits || {};
      ['work', 'production', 'agency', 'director'].forEach((k) => { form[k].value = c[k] || ''; });
      form.vimeo.value = work.vimeo || '';
    }
    modal.querySelectorAll('.wed-chips input').forEach((i) => {
      const set = i.closest('.wed-chips').dataset.set;
      i.checked = !!work && (work[set] || []).includes(i.value);
    });
    status('');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => form.title.focus(), 50);
  }
  function closeForm() { modal.hidden = true; document.body.style.overflow = ''; current = null; }
  function status(msg) {
    const el = modal.querySelector('.wed-status');
    el.textContent = msg; el.hidden = !msg;
  }

  async function save(e) {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { status('A title is required.'); return; }
    const isNew = !current;
    if (isNew && !form.videoFile.files[0] && !form.vimeo.value.trim()) {
      status('Add a video file or a Vimeo ID.'); return;
    }
    if (isNew && !form.thumbFile.files[0]) { status('Add a thumbnail.'); return; }

    const btn = form.querySelector('.wed-save');
    btn.disabled = true;
    const s = slug(title), ts = Date.now().toString(36);
    const picks = [
      ['thumbFile', 'thumb', `work-thumbs/${s}-${ts}.`],
      ['videoFile', 'mp4', `work/${s}-${ts}.`],
      ['previewFile', 'preview', `work-thumbs/${s}-${ts}-loop.`],
    ];
    const body = {
      id: current ? current.id : undefined,
      title,
      credits: { work: form.work.value, production: form.production.value,
                 agency: form.agency.value, director: form.director.value },
      vimeo: form.vimeo.value.trim() || undefined,
      thumb: current ? current.thumb : undefined,
      preview: current ? current.preview : undefined,
      mp4: current ? current.mp4 : undefined,
    };
    ['media', 'tags'].forEach((set) => {
      body[set] = [...modal.querySelectorAll(`.wed-chips[data-set="${set}"] input:checked`)].map((i) => i.value);
    });

    try {
      for (const [field, key, prefix] of picks) {
        const file = form[field].files[0];
        if (!file) continue;
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const label = { thumb: 'thumbnail', mp4: 'film', preview: 'hover loop' }[key];
        body[key] = await upload(prefix + ext, file, (pct) => status(`Uploading ${label}… ${pct}%`));
      }
      status('Saving…');
      await api('/works', body);
      await window.SnowstarWorks.reload();
      decorate();
      closeForm();
      say(isNew ? 'Added — it’s live' : 'Saved — it’s live');
    } catch (err) {
      status('Couldn’t save: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // appear the moment the owner's session is known
  function sync() { if (M.user && M.user.admin) mount(); }
  M.onChange(sync);
  sync();
})();
