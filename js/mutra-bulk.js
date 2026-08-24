/* ═══════════ Mutra — bulk catalogue editing ═══════════

   374 tracks, one person, every tag and price to check. One-at-a-time editing
   is not slow so much as unfinishable, so this exists to make a pass over the
   whole catalogue a session's work rather than a project.

   It lives inside curate mode: turn on "Edit catalog" and every row grows a
   checkbox. Nothing here is reachable, or even built, for anyone else.

   The three decisions that shape it, all of them about the same fear — that one
   click quietly wrecks the catalogue:

     NOTHING APPLIES UNTIL YOU HAVE SEEN THE DIFF. Every operation runs as a dry
     run first and shows exactly which tracks change and how. The second press
     is the one that writes. "Set lane to quote on 312 tracks" should not be a
     single click.

     ADD, REMOVE, REPLACE AND RENAME ARE SEPARATE. The classic bulk-tag disaster
     is meaning "also tag these cinematic" and getting "these are cinematic and
     nothing else". Replace is its own control, labelled as destructive.

     UNDO IS ALWAYS THERE. The server snapshots every affected track before
     writing, so the bar keeps an Undo for the last batch and the panel lists
     earlier ones.

   Selection deliberately SURVIVES a filter change. Losing 40 hand-picked
   tracks because you typed in the search box is infuriating; silently editing
   tracks you cannot see is dangerous. So it survives, and the bar says how many
   of the selected are currently off screen. */
(function () {
  const api = () => window.mutraCatalog;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TIERS = [
    ['digital', 'Digital'], ['corporate', 'Corporate'], ['paid', 'Paid campaign'],
    ['tvshow', 'TV show'], ['film', 'Film'], ['radio', 'Radio'], ['tvc', 'TV commercial'],
  ];
  const TAG_FIELDS = [['genres', 'Genres'], ['moods', 'Moods'], ['instruments', 'Instruments']];

  const sel = new Set();
  let anchor = null;           // for shift-click ranges
  let bar = null, panel = null;
  let lastBatch = null;

  const toast = (m) => (window.mutraToast ? mutraToast(m) : console.log(m));

  /* ── selection ─────────────────────────────────────────────────────────── */

  function setSelected(slug, on) {
    if (on) sel.add(slug); else sel.delete(slug);
    const cb = document.querySelector(`.trk-pick[data-slug="${CSS.escape(slug)}"]`);
    if (cb) { cb.checked = on; cb.closest('.trk')?.classList.toggle('trk-picked', on); }
  }

  /** Shift-click selects the visible run between the two rows, which is what
   *  every list in every other tool does — and the only fast way to grab a
   *  block of tracks that a filter has already put next to each other. */
  function pickRange(toSlug) {
    const rows = [...document.querySelectorAll('.trk-pick')].map((c) => c.dataset.slug);
    const a = rows.indexOf(anchor), b = rows.indexOf(toSlug);
    if (a < 0 || b < 0) return false;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) setSelected(rows[i], true);
    return true;
  }

  /** Called by mutra-page.js as it builds each row in curate mode. */
  window.mutraBulkRowControl = function (row, track) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'trk-pick';
    cb.dataset.slug = track.slug;
    cb.checked = sel.has(track.slug);
    cb.setAttribute('aria-label', 'Select ' + track.title);
    if (cb.checked) row.classList.add('trk-picked');
    // The row is draggable in curate mode (pick reordering), so a pointerdown
    // that reaches it starts a drag instead of ticking the box.
    ['pointerdown', 'mousedown', 'dragstart'].forEach((ev) =>
      cb.addEventListener(ev, (e) => e.stopPropagation()));
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.shiftKey && anchor && anchor !== track.slug && pickRange(track.slug)) {
        // range wins; the checkbox's own toggle already happened, so make sure
        // the clicked row ends up selected rather than flipped back off
        setSelected(track.slug, true);
      } else {
        setSelected(track.slug, cb.checked);
      }
      anchor = track.slug;
      sync();
    });
    return cb;
  };

  /* ── the bar ───────────────────────────────────────────────────────────── */

  function build() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'bulk-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <div class="bulk-count"><b class="bulk-n">0</b> <span class="bulk-word">selected</span>
        <span class="bulk-off" hidden></span></div>
      <div class="bulk-acts">
        <button type="button" class="bulk-all"></button>
        <button type="button" class="bulk-clear">Clear</button>
        <button type="button" class="bulk-open bulk-primary">Edit selected</button>
        <button type="button" class="bulk-undo" hidden>Undo last</button>
      </div>`;
    document.body.appendChild(bar);
    bar.querySelector('.bulk-clear').addEventListener('click', clearAll);
    bar.querySelector('.bulk-all').addEventListener('click', selectAllMatching);
    bar.querySelector('.bulk-open').addEventListener('click', openPanel);
    bar.querySelector('.bulk-undo').addEventListener('click', undoLast);
    return bar;
  }

  function clearAll() {
    sel.clear(); anchor = null;
    document.querySelectorAll('.trk-pick').forEach((c) => {
      c.checked = false; c.closest('.trk')?.classList.remove('trk-picked');
    });
    sync();
  }

  /** Everything the current filter matches — NOT just the rows drawn so far.
   *  The list is infinite-scrolled, so "select all" meaning "select the 60 you
   *  happen to have scrolled past" would be a trap. */
  function selectAllMatching() {
    const f = api().filtered();
    f.forEach((t) => sel.add(t.slug));
    document.querySelectorAll('.trk-pick').forEach((c) => {
      c.checked = sel.has(c.dataset.slug);
      c.closest('.trk')?.classList.toggle('trk-picked', c.checked);
    });
    sync();
  }

  function sync() {
    if (!bar) return;
    const n = sel.size;
    bar.hidden = n === 0;
    bar.querySelector('.bulk-n').textContent = n;
    bar.querySelector('.bulk-word').textContent = n === 1 ? 'track selected' : 'tracks selected';

    const visible = new Set(api().filtered().map((t) => t.slug));
    const off = [...sel].filter((s) => !visible.has(s)).length;
    const offEl = bar.querySelector('.bulk-off');
    offEl.hidden = off === 0;
    // Say it plainly. Editing tracks you cannot see is the failure mode this
    // whole selection model has to stay honest about.
    offEl.textContent = off ? ` · ${off} not shown by the current filter` : '';

    const all = bar.querySelector('.bulk-all');
    const total = api().filtered().length;
    all.textContent = `Select all ${total}`;
    all.hidden = total === 0 || total === n;
  }
  window.mutraBulkSync = sync;

  /* ── the edit panel ────────────────────────────────────────────────────── */

  function openPanel() {
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.className = 'bulk-modal';
    panel.innerHTML = `
      <div class="bulk-card" role="dialog" aria-modal="true" aria-label="Edit selected tracks">
        <button class="bulk-close" aria-label="Close">&times;</button>
        <h3>Edit <b>${sel.size}</b> track${sel.size === 1 ? '' : 's'}</h3>
        <p class="bulk-lede">Nothing is written until you have seen what changes.</p>

        <section class="bulk-sec">
          <h4>Tags</h4>
          ${TAG_FIELDS.map(([f, label]) => `
            <div class="bulk-tagrow" data-field="${f}">
              <span class="bulk-tagname">${label}</span>
              <select class="bulk-tagop">
                <option value="">— no change —</option>
                <option value="add">Add</option>
                <option value="remove">Remove</option>
                <option value="rename">Rename</option>
                <option value="replace">Replace all</option>
              </select>
              <input class="bulk-tagval" type="text" placeholder="comma, separated"
                     list="bulkvocab-${f}" autocomplete="off" disabled>
              <datalist id="bulkvocab-${f}"></datalist>
              <input class="bulk-tagval2" type="text" placeholder="new name" hidden>
            </div>`).join('')}
          <p class="bulk-warn" hidden>Replace all wipes the existing tags on every selected
            track and puts only what you type here. There is an Undo, but check the preview.</p>
        </section>

        <section class="bulk-sec">
          <h4>Prices</h4>
          <div class="bulk-prow">
            <select class="bulk-ptier">
              <option value="">— set one tier —</option>
              ${TIERS.map(([id, l]) => `<option value="${id}">${l}</option>`).join('')}
            </select>
            <input class="bulk-pval" type="number" min="0" step="1" placeholder="₪ ex VAT" disabled>
          </div>
          <div class="bulk-prow">
            <label class="bulk-inline">Change every price by
              <input class="bulk-pscale" type="number" step="1" placeholder="0"> %</label>
            <label class="bulk-inline">round to
              <select class="bulk-pround">
                <option value="">don't round</option>
                <option value="5">₪5</option>
                <option value="10" selected>₪10</option>
                <option value="50">₪50</option>
              </select></label>
          </div>
        </section>

        <section class="bulk-sec">
          <h4>Lane and visibility</h4>
          <div class="bulk-prow">
            <select class="bulk-lane">
              <option value="">— lane: no change —</option>
              <option value="instant">Instant — buy at the listed price</option>
              <option value="quote">Quote — get in touch</option>
            </select>
            <select class="bulk-hidden">
              <option value="">— visibility: no change —</option>
              <option value="1">Hide from the catalog</option>
              <option value="0">Show in the catalog</option>
            </select>
          </div>
        </section>

        <div class="bulk-preview" hidden></div>
        <p class="bulk-err" hidden></p>
        <div class="bulk-foot">
          <button type="button" class="bulk-dry bulk-primary">Preview changes</button>
          <button type="button" class="bulk-apply" hidden>Apply</button>
          <button type="button" class="bulk-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    // Fill the typeaheads from what the catalogue already uses. Free text still
    // works — the point is that "Cinemtaic" should require ignoring a list of
    // real tags rather than just being typed.
    TAG_FIELDS.forEach(([f]) => {
      const seen = new Set();
      api().all().forEach((t) => (t[f] || []).forEach((v) => v && seen.add(v)));
      const dl = panel.querySelector('#bulkvocab-' + f);
      if (dl) dl.innerHTML = [...seen].sort((a, b) => a.localeCompare(b))
        .map((v) => `<option value="${esc(v)}">`).join('');
    });

    const close = () => { panel.remove(); panel = null; };
    panel.querySelector('.bulk-close').addEventListener('click', close);
    panel.querySelector('.bulk-cancel').addEventListener('click', close);
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });

    // enable the value field only once an operation is chosen, and surface the
    // rename's second box only for rename
    panel.querySelectorAll('.bulk-tagrow').forEach((row) => {
      const op = row.querySelector('.bulk-tagop');
      const v1 = row.querySelector('.bulk-tagval');
      const v2 = row.querySelector('.bulk-tagval2');
      op.addEventListener('change', () => {
        v1.disabled = !op.value;
        v2.hidden = op.value !== 'rename';
        v1.placeholder = op.value === 'rename' ? 'existing tag' : 'comma, separated';
        row.classList.toggle('is-replace', op.value === 'replace');
        panel.querySelector('.bulk-warn').hidden =
          !panel.querySelector('.bulk-tagop[value], .bulk-tagrow.is-replace');
        resetPreview();
      });
    });
    const ptier = panel.querySelector('.bulk-ptier'), pval = panel.querySelector('.bulk-pval');
    ptier.addEventListener('change', () => { pval.disabled = !ptier.value; resetPreview(); });
    panel.querySelectorAll('input, select').forEach((i) =>
      i.addEventListener('input', resetPreview));

    function resetPreview() {
      const pv = panel.querySelector('.bulk-preview');
      pv.hidden = true; pv.innerHTML = '';
      panel.querySelector('.bulk-apply').hidden = true;
      panel.querySelector('.bulk-dry').hidden = false;
    }

    panel.querySelector('.bulk-dry').addEventListener('click', () => run(true));
    panel.querySelector('.bulk-apply').addEventListener('click', () => run(false));

    async function run(dry) {
      const ops = readOps();
      const err = panel.querySelector('.bulk-err');
      err.hidden = true;
      if (!ops) { err.hidden = false; err.textContent = 'Choose at least one change first.'; return; }

      const btn = panel.querySelector(dry ? '.bulk-dry' : '.bulk-apply');
      const was = btn.textContent;
      btn.disabled = true; btn.textContent = dry ? 'Checking…' : 'Applying…';
      try {
        const slugs = [...sel];
        // The shipped record travels with the request because only the browser
        // has mutra-data.js. The server uses it for tag maths and nothing else
        // — never for a price it will charge or a permission it will grant.
        const base = {};
        api().all().forEach((t) => {
          if (sel.has(t.slug)) {
            base[t.slug] = {
              genres: t.genres, moods: t.moods, instruments: t.instruments,
              packages: t.packages, prices: t.prices,
            };
          }
        });
        const r = await fetch('/api/tracks/bulk', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slugs, ops, base, dryRun: dry, note: describe(ops) }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'failed');

        if (dry) {
          renderPreview(d);
        } else {
          lastBatch = d.batch;
          await api().reload();
          clearAll();
          close();
          toast(`${d.written} track${d.written === 1 ? '' : 's'} updated`
            + (d.failed && d.failed.length ? ` — ${d.failed.length} failed` : ''));
          bar.querySelector('.bulk-undo').hidden = false;
        }
      } catch (e) {
        err.hidden = false;
        err.textContent = 'That did not go through: ' + String(e.message || e)
          + '. Nothing was changed.';
      } finally {
        btn.disabled = false; btn.textContent = was;
      }
    }

    function renderPreview(d) {
      const pv = panel.querySelector('.bulk-preview');
      const changing = (d.results || []).filter((r) => r.changed);
      pv.hidden = false;
      if (!changing.length) {
        pv.innerHTML = `<p class="bulk-none">Nothing would change on any of the
          ${d.considered} selected tracks.</p>`;
        panel.querySelector('.bulk-apply').hidden = true;
        return;
      }
      const byField = {};
      changing.forEach((r) => r.changes.forEach((c) => { byField[c.field] = (byField[c.field] || 0) + 1; }));
      pv.innerHTML = `
        <div class="bulk-pvhead"><b>${changing.length}</b> of ${d.considered} would change</div>
        <div class="bulk-pvfields">${Object.entries(byField)
          .map(([f, n]) => `<span>${esc(f)} <b>${n}</b></span>`).join('')}</div>
        <ul class="bulk-pvlist">${changing.slice(0, 40).map((r) => `
          <li><span class="bulk-pvslug">${esc(r.slug)}</span>
            ${r.changes.map((c) => `<span class="bulk-pvch">${esc(c.field)}:
              <i>${esc(fmt(c.from))}</i> → <b>${esc(fmt(c.to))}</b></span>`).join('')}</li>`).join('')}
        </ul>
        ${changing.length > 40 ? `<p class="bulk-more">…and ${changing.length - 40} more</p>` : ''}`;
      panel.querySelector('.bulk-apply').hidden = false;
      panel.querySelector('.bulk-apply').textContent = `Apply to ${changing.length}`;
      panel.querySelector('.bulk-dry').hidden = true;
    }

    /** Plain English, stored with the batch. "b1787…-421" tells you nothing six
     *  weeks later; "add cinematic to genres · prices +20%" tells you everything. */
    function describe(ops) {
      const bits = [];
      if (ops.tags) for (const [f, op] of Object.entries(ops.tags)) {
        if (op.add) bits.push(`add ${op.add.join('/')} to ${f}`);
        if (op.remove) bits.push(`remove ${op.remove.join('/')} from ${f}`);
        if (op.replace) bits.push(`replace ${f} with ${op.replace.join('/')}`);
        if (op.rename) bits.push(`rename ${f} ${op.rename.from}→${op.rename.to}`);
      }
      if (ops.prices) {
        if (ops.prices.set) bits.push('set ' + Object.entries(ops.prices.set)
          .map(([k, v]) => `${k} ${v}`).join(', '));
        if (ops.prices.scalePct) bits.push(`prices ${ops.prices.scalePct > 0 ? '+' : ''}${ops.prices.scalePct}%`);
      }
      if (ops.set) bits.push(Object.entries(ops.set)
        .map(([k, v]) => `${k}=${v === null ? 'clear' : v}`).join(', '));
      return bits.join(' · ').slice(0, 200);
    }

    function fmt(v) {
      if (v == null) return '—';
      if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
      if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ');
      return String(v);
    }

    function readOps() {
      const ops = {};
      const tags = {};
      panel.querySelectorAll('.bulk-tagrow').forEach((row) => {
        const field = row.dataset.field;
        const op = row.querySelector('.bulk-tagop').value;
        const raw = row.querySelector('.bulk-tagval').value.trim();
        if (!op || !raw) return;
        const listOf = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
        if (op === 'rename') {
          const to = row.querySelector('.bulk-tagval2').value.trim();
          if (!to) return;
          tags[field] = { rename: { from: raw, to } };
        } else {
          tags[field] = { [op]: listOf(raw) };
        }
      });
      if (Object.keys(tags).length) ops.tags = tags;

      const prices = {};
      const tier = panel.querySelector('.bulk-ptier').value;
      const pval = panel.querySelector('.bulk-pval').value;
      if (tier && pval !== '') prices.set = { [tier]: Number(pval) };
      const scale = panel.querySelector('.bulk-pscale').value;
      if (scale !== '' && Number(scale) !== 0) prices.scalePct = Number(scale);
      const round = panel.querySelector('.bulk-pround').value;
      if (round && (prices.set || prices.scalePct != null)) prices.roundTo = Number(round);
      if (Object.keys(prices).length) ops.prices = prices;

      const set = {};
      const lane = panel.querySelector('.bulk-lane').value;
      if (lane) set.lane = lane;
      const hid = panel.querySelector('.bulk-hidden').value;
      if (hid !== '') set.hidden = hid === '1' ? true : null;
      if (Object.keys(set).length) ops.set = set;

      return Object.keys(ops).length ? ops : null;
    }
  }

  async function undoLast() {
    if (!lastBatch) return;
    const btn = bar.querySelector('.bulk-undo');
    btn.disabled = true; btn.textContent = 'Undoing…';
    try {
      const r = await fetch('/api/tracks/bulk/undo', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batch: lastBatch }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
      await api().reload();
      toast(`Put ${d.restored} track${d.restored === 1 ? '' : 's'} back`);
      lastBatch = null;
      btn.hidden = true;
    } catch (e) {
      toast('Could not undo that — ' + String(e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = 'Undo last';
    }
  }

  /** Curate mode off: the bar goes, the selection goes with it. Leaving a
   *  selection alive behind a closed editor is how you come back an hour later
   *  and edit 40 tracks you have forgotten you chose. */
  // Escape is the universal "I did not mean that" — with 300 rows ticked it is
  // the fastest way back, and it costs nothing to honour.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sel.size) return;
    if (panel) return;                       // the panel owns Escape while open
    clearAll();
  });

  window.mutraBulkSetMode = function (on) {
    build();
    if (!on) { sel.clear(); anchor = null; if (panel) { panel.remove(); panel = null; } }
    sync();
  };

  build();
})();
