/* ═══════════ Site editor — text overrides, section visibility, markup notes ═══════════
   Loaded by BOTH sites. Two very different jobs share this file:

   1. HYDRATION (every visitor): fetch the owner's saved text overrides and
      apply them to [data-txt] elements; hide sections he switched off.
      Elements without an override keep their built-in copy — zero flicker.

   2. EDITOR (owner only): a floating pill offering
        · Texts — click any outlined text and type straight into the page
        · Draw & note — pencil strokes + numbered note pins, saved with the
          page so Claude can read them ("check my site notes") and do the work
        · Sections — show/hide whole sections
   Styles are injected here so both sites' stylesheets stay untouched. */
(function () {
  const PAGE = location.pathname.replace(/^\/(index.html)?$/, '/') || '/';

  /* A hidden section must also vanish from the menus: a numbered menu link to
     a display:none anchor is a dead click. Any nav link pointing at a hidden
     section's id is hidden with it, and the 01/02 numbering closes ranks so
     the menu never counts ghosts. Runs at hydration and again on every save. */
  function syncMenus(hiddenIds) {
    document.querySelectorAll('nav a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      a.style.display = hiddenIds.includes(id) ? 'none' : '';
    });
    document.querySelectorAll('nav').forEach((nav) => {
      let n = 0;
      nav.querySelectorAll('a').forEach((a) => {
        const num = a.querySelector('i');
        if (!num || a.style.display === 'none') return;
        n += 1;
        num.textContent = String(n).padStart(2, '0');
      });
    });
  }

  // ── 1. hydration — runs for everyone, fails silent ──
  const hydrate = fetch('/api/texts')
    .then((r) => (r.ok ? r.json() : { texts: {} }))
    .then(({ texts }) => {
      for (const [key, html] of Object.entries(texts)) {
        if (key === 'sections.hidden.' + PAGE) {
          try {
            const ids = JSON.parse(html);
            ids.forEach((id) => {
              const el = document.getElementById(id);
              if (el) el.style.display = 'none';
            });
            syncMenus(ids);
          } catch {}
          continue;
        }
        const el = document.querySelector(`[data-txt="${key}"]`);
        if (el) el.innerHTML = html;
      }
      return texts;
    })
    .catch(() => ({}));

  // ── 2. editor — only ever wakes up for the admin ──
  const M = window.SnowstarAccount;
  if (!M) return;
  let built = false;

  function boot() {
    if (!M.user || !M.user.admin || built) return;
    built = true;
    injectCss();
    buildPill();
  }
  M.onChange(boot);
  boot();

  const api = async (path, body) => {
    const res = await fetch('/api' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'request_failed');
    return d;
  };

  function toast(msg) {
    let t = document.querySelector('.se-toast');
    if (!t) { t = document.createElement('div'); t.className = 'se-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ─────────── floating pill ───────────
  let pill, mode = null; // null | 'text' | 'draw'
  function buildPill() {
    pill = document.createElement('div');
    pill.className = 'se-pill';
    pill.innerHTML = `
      <button data-m="text" title="Edit texts">✎ Texts</button>
      <button data-m="draw" title="Pencil + note pins">✏ Draw &amp; note</button>
      <button data-m="notes" title="Show/hide saved notes">◉ Notes</button>
      <button data-m="sections" title="Show/hide sections">▤ Sections</button>`;
    document.body.appendChild(pill);
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'text') mode === 'text' ? exitText() : enterText();
      if (m === 'draw') mode === 'draw' ? exitDraw(true) : enterDraw();
      if (m === 'notes') toggleNotes();
      if (m === 'sections') sectionsPanel();
    });
    loadPins();
  }
  const lit = (m, on) => pill.querySelector(`[data-m="${m}"]`).classList.toggle('on', on);

  // ─────────── text editing ───────────
  let originals = new Map();
  let saveBar;

  function enterText() {
    if (mode === 'draw') exitDraw(false);
    mode = 'text'; lit('text', true);
    originals.clear();
    document.querySelectorAll('[data-txt]').forEach((el) => {
      originals.set(el, el.innerHTML);
      el.classList.add('se-editable');
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('input', markDirty);
    });
    saveBar = document.createElement('div');
    saveBar.className = 'se-savebar';
    saveBar.innerHTML = `<span>Click any outlined text and type</span>
      <button class="se-primary" id="seSave" disabled>Save changes</button>
      <button id="seDiscard">Discard</button>`;
    document.body.appendChild(saveBar);
    saveBar.querySelector('#seSave').addEventListener('click', saveTexts);
    saveBar.querySelector('#seDiscard').addEventListener('click', exitText);
  }

  function markDirty() {
    saveBar.querySelector('#seSave').disabled = false;
    saveBar.querySelector('span').textContent = 'Unsaved changes';
  }

  async function saveTexts() {
    const dirty = [...originals].filter(([el, orig]) => el.innerHTML !== orig);
    const btn = saveBar.querySelector('#seSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      for (const [el] of dirty) {
        await api('/texts', { key: el.dataset.txt, html: el.innerHTML });
      }
      toast(`Saved ${dirty.length} text${dirty.length === 1 ? '' : 's'} — live now`);
      // keep the new text in place; just leave edit mode
      originals.clear();
      teardownText();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Save changes';
      toast('Couldn’t save: ' + e.message);
    }
  }

  function exitText() {
    // revert anything unsaved
    originals.forEach((html, el) => { if (el.innerHTML !== html) el.innerHTML = html; });
    teardownText();
  }
  function teardownText() {
    document.querySelectorAll('[data-txt]').forEach((el) => {
      el.classList.remove('se-editable');
      el.removeAttribute('contenteditable');
      el.removeEventListener('input', markDirty);
    });
    if (saveBar) saveBar.remove();
    mode = null; lit('text', false);
  }

  // ─────────── pencil + note pins ───────────
  let canvas, ctx, strokes = [], stroke = null, overlay;

  const docH = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const relX = (px) => px / document.documentElement.clientWidth;
  const relY = (px) => px / docH();

  function enterDraw() {
    if (mode === 'text') exitText();
    mode = 'draw'; lit('draw', true);
    overlay = document.createElement('div');
    overlay.className = 'se-overlay';
    canvas = document.createElement('canvas');
    canvas.width = document.documentElement.clientWidth;
    canvas.height = docH();
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);
    ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ff5470'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    strokes = [];

    canvas.addEventListener('pointerdown', (e) => {
      stroke = [[e.pageX, e.pageY]];
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      const [px, py] = stroke[stroke.length - 1];
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(e.pageX, e.pageY); ctx.stroke();
      stroke.push([e.pageX, e.pageY]);
    });
    canvas.addEventListener('pointerup', () => {
      if (stroke && stroke.length > 1) strokes.push(stroke);
      else if (stroke) pinAt(stroke[0][0], stroke[0][1]);   // a tap = a pin
      stroke = null;
    });

    saveBar = document.createElement('div');
    saveBar.className = 'se-savebar';
    saveBar.innerHTML = `<span>Draw with the pencil, or tap once to drop a note pin</span>
      <button class="se-primary" id="seDrawSave">Save note</button>
      <button id="seDrawCancel">Cancel</button>`;
    document.body.appendChild(saveBar);
    saveBar.querySelector('#seDrawSave').addEventListener('click', () => finishDrawing());
    saveBar.querySelector('#seDrawCancel').addEventListener('click', () => exitDraw(false));
  }

  function nearestText(x, y) {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x - scrollX, y - scrollY);
    overlay.style.pointerEvents = '';
    const host = el && el.closest('[data-txt], h1, h2, h3, section, article');
    if (!host) return '';
    const key = host.dataset && host.dataset.txt ? host.dataset.txt + ': ' : '';
    return (key + (host.textContent || '').trim().replace(/\s+/g, ' ')).slice(0, 200);
  }

  async function pinAt(x, y) {
    const note = prompt('Note for Claude / yourself:');
    if (!note || !note.trim()) return;
    try {
      await api('/notes', { page: PAGE, x: relX(x), y: relY(y),
        vw: document.documentElement.clientWidth, near: nearestText(x, y), note: note.trim() });
      toast('Note pinned');
      loadPins(true);
    } catch (e) { toast('Couldn’t save the note: ' + e.message); }
  }

  async function finishDrawing() {
    if (!strokes.length) { exitDraw(false); return; }
    const note = prompt('What should happen here? (saved with the drawing)') || '';
    const [fx, fy] = strokes[0][0];
    const drawing = JSON.stringify(strokes.map((s) => s.map(([x, y]) => [relX(x), relY(y)])));
    try {
      await api('/notes', { page: PAGE, x: relX(fx), y: relY(fy),
        vw: document.documentElement.clientWidth, near: nearestText(fx, fy),
        note: note.trim(), drawing });
      toast('Drawing saved');
      exitDraw(false);
      loadPins(true);
    } catch (e) { toast('Couldn’t save: ' + e.message); }
  }

  function exitDraw(save) {
    if (overlay) overlay.remove();
    if (saveBar) saveBar.remove();
    strokes = []; stroke = null;
    mode = null; lit('draw', false);
  }

  // ─────────── viewing saved notes ───────────
  let pinsShown = true, pinLayer;

  async function loadPins(refresh) {
    if (pinLayer) { pinLayer.remove(); pinLayer = null; }
    if (!pinsShown) return;
    let notes;
    try {
      const res = await fetch('/api/notes?page=' + encodeURIComponent(PAGE), { credentials: 'same-origin' });
      const d = await res.json().catch(() => ({}));
      // A 403 or a 500 still parses as JSON, so without this check a broken
      // endpoint produced an empty list and looked exactly like "no notes".
      if (!res.ok || d.error) throw new Error(d.error || ('http_' + res.status));
      notes = d.notes || [];
    } catch (e) { lit('notes', false); toast('Notes unavailable: ' + e.message); return; }
    if (!notes.length) { lit('notes', false); return; }
    lit('notes', true);

    pinLayer = document.createElement('div');
    pinLayer.className = 'se-pinlayer';
    const H = docH(), W = document.documentElement.clientWidth;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    notes.forEach((n) => {
      if (!n.drawing) return;
      try {
        JSON.parse(n.drawing).forEach((s) => {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          p.setAttribute('points', s.map(([x, y]) => `${x * W},${y * H}`).join(' '));
          p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#ff5470');
          p.setAttribute('stroke-width', '3'); p.setAttribute('stroke-linecap', 'round');
          svg.appendChild(p);
        });
      } catch {}
    });
    pinLayer.appendChild(svg);

    notes.forEach((n, i) => {
      const pin = document.createElement('button');
      pin.className = 'se-pin';
      pin.textContent = i + 1;
      pin.style.left = (n.x * W) + 'px';
      pin.style.top = (n.y * H) + 'px';
      pin.title = n.note || '(drawing)';
      pin.addEventListener('click', () => openPin(n, pin));
      pinLayer.appendChild(pin);
    });
    document.body.appendChild(pinLayer);
  }

  function openPin(n, pin) {
    document.querySelectorAll('.se-pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    pop.className = 'se-pop';
    pop.innerHTML = `<p>${(n.note || '(drawing only)').replace(/</g, '&lt;')}</p>
      <div><button class="se-primary" data-a="done">Mark done</button>
      <button data-a="del">Delete</button><button data-a="close">Close</button></div>`;
    pop.style.left = pin.style.left; pop.style.top = pin.style.top;
    pop.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === 'done') { await api('/notes', { id: n.id, status: 'done' }); toast('Done'); }
      if (a === 'del') { await api('/notes/delete', { id: n.id }); toast('Deleted'); }
      pop.remove();
      if (a !== 'close') loadPins(true);
    });
    pinLayer.appendChild(pop);
  }

  /* Pins are already on screen at boot, so this button only ever hides or
     re-shows them — and it used to do that with no feedback whatsoever. On the
     hide press loadPins() returned before reaching lit(), so the lamp never
     went out; with no notes on the page, pressing it changed nothing at all,
     which is why it read as broken rather than as empty. */
  async function toggleNotes() {
    pinsShown = !pinsShown;
    lit('notes', pinsShown);
    if (!pinsShown) { loadPins(); toast('Notes hidden'); return; }
    await loadPins();
    if (!pinLayer) toast('No notes on this page yet — drag on the page to leave one');
  }

  // ─────────── section visibility ───────────
  async function sectionsPanel() {
    document.querySelectorAll('.se-pop').forEach((p) => p.remove());
    const key = 'sections.hidden.' + PAGE;
    const texts = await hydrate;
    let hidden = [];
    try { hidden = JSON.parse((texts && texts[key]) || '[]'); } catch {}
    const sections = [...document.querySelectorAll('main section[id], body > section[id]')];
    if (!sections.length) { toast('No sections found on this page'); return; }

    const pop = document.createElement('div');
    pop.className = 'se-pop se-sections';
    pop.innerHTML = '<p>Sections on this page</p>' + sections.map((s) => {
      const h = s.querySelector('h1,h2,h3');
      const label = (h ? h.textContent : s.id).trim().replace(/\s+/g, ' ').slice(0, 40);
      const off = hidden.includes(s.id) || s.style.display === 'none';
      return `<label><input type="checkbox" data-id="${s.id}" ${off ? '' : 'checked'}> ${label}</label>`;
    }).join('') + '<div><button class="se-primary" data-a="save">Save</button><button data-a="close">Close</button></div>';
    document.body.appendChild(pop);
    pop.style.position = 'fixed'; pop.style.right = '18px'; pop.style.bottom = '74px';
    pop.style.left = 'auto'; pop.style.top = 'auto';

    pop.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close') pop.remove();
      if (a === 'save') {
        const off = [...pop.querySelectorAll('input')].filter((i) => !i.checked).map((i) => i.dataset.id);
        try {
          await api('/texts', { key, html: off.length ? JSON.stringify(off) : '' });
          sections.forEach((s) => { s.style.display = off.includes(s.id) ? 'none' : ''; });
          syncMenus(off);
          toast('Sections saved — live now');
          pop.remove();
        } catch (err) { toast('Couldn’t save: ' + err.message); }
      }
    });
  }

  // ─────────── styles ───────────
  function injectCss() {
    const css = `
    .se-pill{position:fixed;right:18px;bottom:18px;z-index:90;display:flex;gap:6px;padding:6px;
      border-radius:99px;border:1px solid rgba(235,225,210,.25);background:rgba(8,11,20,.92);
      backdrop-filter:blur(8px);box-shadow:0 12px 34px rgba(0,0,0,.5)}
    .se-pill button{border:0;background:none;color:#a8a29a;font:600 .72rem/1 system-ui,sans-serif;
      letter-spacing:.05em;text-transform:uppercase;padding:8px 11px;border-radius:99px;cursor:pointer;white-space:nowrap}
    .se-pill button:hover{color:#fff}
    .se-pill button.on{background:linear-gradient(100deg,#efe7d8,#e0b48b,#d9744a);color:#121110}
    .se-editable{outline:1.5px dashed rgba(224,180,139,.6)!important;outline-offset:3px;cursor:text;min-height:1em}
    .se-editable:hover,.se-editable:focus{outline-style:solid!important;outline-color:#e0b48b!important}
    .se-savebar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:95;display:flex;
      gap:10px;align-items:center;padding:10px 16px;border-radius:14px;border:1px solid rgba(235,225,210,.25);
      background:rgba(8,11,20,.95);color:#a8a29a;font:500 .82rem system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.5)}
    .se-savebar button{border:1px solid rgba(235,225,210,.25);background:none;color:#f2ede4;font:600 .78rem system-ui;
      padding:8px 14px;border-radius:9px;cursor:pointer}
    .se-savebar button:disabled{opacity:.45;cursor:default}
    .se-primary{background:linear-gradient(100deg,#efe7d8,#e0b48b,#d9744a)!important;color:#121110!important;border-color:transparent!important}
    .se-overlay{position:absolute;top:0;left:0;z-index:85;cursor:crosshair}
    .se-overlay canvas{display:block;touch-action:none}
    .se-pinlayer{position:absolute;top:0;left:0;width:100%;z-index:84;pointer-events:none}
    .se-pinlayer svg{position:absolute;top:0;left:0;pointer-events:none}
    .se-pin{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;
      border:2px solid #fff;background:#ff5470;color:#fff;font:700 .72rem system-ui;cursor:pointer;
      pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.45)}
    .se-pop{position:absolute;z-index:96;transform:translate(-50%,12px);max-width:300px;padding:12px 14px;
      border-radius:12px;border:1px solid rgba(235,225,210,.3);background:rgba(8,11,20,.97);color:#f2ede4;
      font:500 .84rem/1.45 system-ui;pointer-events:auto;box-shadow:0 16px 40px rgba(0,0,0,.55)}
    .se-pop p{margin:0 0 10px}
    .se-pop div{display:flex;gap:6px;flex-wrap:wrap}
    .se-pop button{border:1px solid rgba(235,225,210,.3);background:none;color:#f2ede4;font:600 .72rem system-ui;
      padding:6px 10px;border-radius:8px;cursor:pointer}
    .se-sections label{display:block;margin:6px 0;cursor:pointer;color:#c9d4e8}
    .se-sections div{margin-top:10px}
    .se-toast{position:fixed;left:50%;transform:translate(-50%,10px);bottom:64px;z-index:97;opacity:0;
      padding:9px 16px;border-radius:10px;background:rgba(8,11,20,.95);border:1px solid rgba(224,180,139,.4);
      color:#f2ede4;font:500 .82rem system-ui;transition:.25s;pointer-events:none}
    .se-toast.show{opacity:1;transform:translate(-50%,0)}
    @media (max-width:640px){.se-pill{right:10px;bottom:10px}.se-pill button{padding:8px 8px;font-size:.64rem}}`;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }
})();
