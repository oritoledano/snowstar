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
    <button class="work-chip" id="wedLogos">Edit client logos</button>
    <span class="wed-hint" hidden>drag cards to reorder — order saves on drop</span>`;

  function mount() {
    if (mounted) return;
    mounted = true;
    controls.after(bar);
    bar.querySelector('#wedToggle').addEventListener('click', toggle);
    bar.querySelector('#wedAdd').addEventListener('click', () => openForm(null));
    bar.querySelector('#wedLogos').addEventListener('click', openLogos);
    buildModal();
    buildLogosModal();
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
        <label class="wed-field"><span>Year</span>
          <input name="year" type="number" min="1990" max="2100" placeholder="e.g. 2019">
          <i class="wed-yearsrc"></i></label>
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
      form.year.value = work.year || '';
      // Show HOW the year was arrived at. Most were reconstructed from the
      // price-offer archive or from mail, and a reconstructed year that looks
      // identical to a remembered one is how a wrong date becomes permanent.
      const ys = modal.querySelector('.wed-yearsrc');
      if (ys) ys.textContent = work.year_src ? 'from ' + work.year_src : '';
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
      year: form.year.value.trim() ? Number(form.year.value) : null,
      // typing over it makes it yours, so the provenance note stops applying
      year_src: form.year.value.trim() && form.year.value.trim() !== String((current && current.year) || '')
        ? 'set by hand' : ((current && current.year_src) || null),
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

  /* ═══════════ client logos manager ═══════════
     One shared list drives both marquees (Snowstar + Mutra). New uploads are
     normalised right here in the browser — the same recipe every existing
     logo went through: crop to the mark, centre it in a 860×538 box at 34%
     height (wide wordmarks clamp to 86% width), and turn the ink white.
     "Keeps its own colors" skips the whitening but not the sizing. */

  const BOX_W = 860, BOX_H = 538, FILL = 0.34, MAX_W = 0.86;

  function normalizeLogo(file, mixed) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const x = c.getContext('2d');
          x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height);
          const px = d.data;

          // ink map: how much "mark" each pixel carries (0 on white or transparent)
          const ink = new Uint8Array(c.width * c.height);
          for (let i = 0; i < ink.length; i++) {
            const r = px[i*4], g = px[i*4+1], b = px[i*4+2], a = px[i*4+3];
            if (a < 10) continue;
            const lum = 0.299*r + 0.587*g + 0.114*b;
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            ink[i] = Math.min(255, Math.max(255 - lum, chroma) * (a / 255));
          }
          // bounding box of the mark
          let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
          for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
            if (ink[y*c.width + xx] > 24) {
              if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
          if (x1 < 0) { reject(new Error('no visible mark found in that image')); return; }
          const iw = x1 - x0 + 1, ih = y1 - y0 + 1;

          // recolor onto a cropped canvas first
          const crop = document.createElement('canvas');
          crop.width = iw; crop.height = ih;
          const cx = crop.getContext('2d');
          const cd = cx.createImageData(iw, ih);
          for (let y = 0; y < ih; y++) for (let xx = 0; xx < iw; xx++) {
            const si = (y + y0) * c.width + (xx + x0), di = (y * iw + xx) * 4;
            if (mixed) {
              cd.data[di] = px[si*4]; cd.data[di+1] = px[si*4+1]; cd.data[di+2] = px[si*4+2];
              cd.data[di+3] = Math.max(ink[si], px[si*4+3] < 10 ? 0 : ink[si]);
            } else {
              cd.data[di] = cd.data[di+1] = cd.data[di+2] = 255;
              cd.data[di+3] = ink[si];
            }
          }
          cx.putImageData(cd, 0, 0);

          // scale into the standard box
          let th = Math.round(BOX_H * FILL), tw = Math.round(iw * th / ih);
          if (tw > BOX_W * MAX_W) { tw = Math.round(BOX_W * MAX_W); th = Math.round(ih * tw / iw); }
          const out = document.createElement('canvas');
          out.width = BOX_W; out.height = BOX_H;
          const ox = out.getContext('2d');
          ox.imageSmoothingQuality = 'high';
          ox.drawImage(crop, (BOX_W - tw) / 2, (BOX_H - th) / 2, tw, th);
          out.toBlob((blob) => blob ? resolve(blob) : reject(new Error('convert_failed')), 'image/png');
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('could not read that image'));
      img.src = URL.createObjectURL(file);
    });
  }

  let logosModal;
  function buildLogosModal() {
    logosModal = document.createElement('div');
    logosModal.className = 'wed-modal';
    logosModal.hidden = true;
    logosModal.innerHTML = `
    <div class="wed-card wedl-card" role="dialog" aria-modal="true">
      <button class="wed-close" aria-label="Close">&times;</button>
      <h3>Client logos</h3>
      <p class="wed-note">Drag to reorder (both sites follow this order — best-known first).
        “Colors” marks a logo that keeps its own colors instead of white ink.</p>
      <div class="wedl-grid" id="wedlGrid"><p class="wed-note">Loading…</p></div>
      <div class="wedl-add">
        <label class="wed-field wed-file" style="margin:0;flex:1">
          <span>Add a logo (any image — it gets converted automatically)</span>
          <input type="file" id="wedlFile" accept="image/*"></label>
        <label class="wed-chip" style="align-self:end"><input type="checkbox" id="wedlMixed"><span>Keeps its own colors</span></label>
      </div>
      <p class="wed-status" hidden></p>
    </div>`;
    document.body.appendChild(logosModal);
    logosModal.querySelector('.wed-close').addEventListener('click', () => { logosModal.hidden = true; document.body.style.overflow = ''; });
    logosModal.addEventListener('click', (e) => { if (e.target === logosModal) { logosModal.hidden = true; document.body.style.overflow = ''; } });
    logosModal.querySelector('#wedlFile').addEventListener('change', addLogo);
  }

  const logoStatus = (msg) => {
    const el = logosModal.querySelector('.wed-status');
    el.textContent = msg; el.hidden = !msg;
  };

  async function openLogos() {
    logosModal.hidden = false;
    document.body.style.overflow = 'hidden';
    await paintLogos();
  }

  async function paintLogos() {
    const g = logosModal.querySelector('#wedlGrid');
    const d = await fetch('/api/logos', { credentials: 'same-origin' }).then((r) => r.json());
    g.innerHTML = d.logos.map((l) => `
      <div class="wedl-tile" draggable="true" data-id="${l.id}" data-url="${l.url}" data-tone="${l.tone}">
        <img src="${l.url}" alt="">
        <span class="wedl-acts">
          <button class="wedl-tone ${l.tone === 'mixed' ? 'on' : ''}" title="Keeps its own colors">Colors</button>
          <button class="wedl-del" title="Remove" aria-label="Remove">✕</button>
        </span>
      </div>`).join('');

    let drag = null;
    g.querySelectorAll('.wedl-tile').forEach((tile) => {
      tile.addEventListener('dragstart', () => { drag = tile; tile.classList.add('wed-dragging'); });
      tile.addEventListener('dragend', async () => {
        tile.classList.remove('wed-dragging'); drag = null;
        const ids = [...g.querySelectorAll('.wedl-tile')].map((t) => Number(t.dataset.id));
        try { await api('/logos/reorder', { ids }); marqueeRefresh(); say('Order saved'); }
        catch { logoStatus('Couldn’t save the order — try again'); }
      });
      tile.querySelector('.wedl-del').addEventListener('click', async () => {
        if (!confirm('Remove this logo from both sites?')) return;
        try { await api('/logos/delete', { id: Number(tile.dataset.id) }); tile.remove(); marqueeRefresh(); }
        catch { logoStatus('Couldn’t remove that — try again'); }
      });
      tile.querySelector('.wedl-tone').addEventListener('click', async (e) => {
        const on = !e.target.classList.contains('on');
        try {
          await api('/logos', { id: Number(tile.dataset.id), url: tile.dataset.url, tone: on ? 'mixed' : '' });
          e.target.classList.toggle('on', on);
          tile.dataset.tone = on ? 'mixed' : '';
          marqueeRefresh();
        } catch { logoStatus('Couldn’t save that — try again'); }
      });
    });
    g.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      const over = e.target.closest('.wedl-tile');
      if (!over || over === drag) return;
      const r = over.getBoundingClientRect();
      g.insertBefore(drag, (e.clientX - r.left) < r.width / 2 ? over : over.nextSibling);
    });
  }

  async function addLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const mixed = logosModal.querySelector('#wedlMixed').checked;
    try {
      logoStatus('Converting…');
      const blob = await normalizeLogo(file, mixed);
      logoStatus('Uploading…');
      const key = `clients/${slug(file.name.replace(/\.[^.]+$/, ''))}-${Date.now().toString(36)}.png`;
      const url = await upload(key, blob, (pct) => logoStatus(`Uploading… ${pct}%`));
      await api('/logos', { url, tone: mixed ? 'mixed' : '' });
      logoStatus('');
      await paintLogos();
      marqueeRefresh();
      say('Logo added — it’s live on both sites');
    } catch (err) {
      logoStatus('Couldn’t add that: ' + err.message);
    }
  }

  function marqueeRefresh() { if (window.SnowstarLogos) window.SnowstarLogos.reload(); }

  // appear the moment the owner's session is known
  function sync() { if (M.user && M.user.admin) mount(); }
  M.onChange(sync);
  sync();
})();
