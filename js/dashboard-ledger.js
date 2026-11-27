/* General > Owed: one board per product, six tiles, one lane open at a time.
 *
 * A pure function from the document /api/ops/ledger returns to HTML, in its own file so
 * dashboard.js only fetches and paints. The document is a copy of files on Ori's Mac
 * (SNOWSTAR/contracts/owed and SNOWSTAR/<product>/ledger), sent by contracts/push.sh;
 * nothing is edited from this page.
 *
 * Ori, 2026-11-26: "a lot of text instead of something easy to follow". So a thing is a
 * dot, not a sentence: lime is there, pink is missing, a pink ring is "nobody has
 * checked", a dim dot does not belong there. The words are in the dot's tooltip. Each
 * tile's number is how many things in its lane still need somebody.
 *
 * The lanes switch with radio inputs and CSS, so the page needs no script of its own
 * after dashboard.js has painted it.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const stateOf = (c) => (/^done/.test(c) ? 'done' : /^todo/.test(c) ? 'todo' : /^n\/a/.test(c) ? 'na' : 'ask');
  const noteOf = (c) => String(c || '').replace(/^(done|todo|n\/a|\?)\s*/, '');
  const isOpen = (c) => { const s = stateOf(c); return s === 'todo' || s === 'ask'; };
  const WORD = { done: 'there', todo: 'missing', ask: 'not checked', na: 'not needed' };
  const dot = (c, label) => {
    const st = stateOf(c || '?'), n = noteOf(c);
    return `<i class="lg-d lg-${st}" title="${esc((label ? label + ': ' : '') + WORD[st] + (n ? '. ' + n : ''))}"></i>`;
  };
  const NAMES = { mac: 'Mac', win: 'Win', ios: 'iPhone', android: 'Android', 'mac-store': 'Mac Store', 'ios-store': 'App Store',
    'play-store': 'Play', site: 'Site', home: 'Home', marketing: 'Ads' };
  const APPS = ['mac', 'win', 'ios', 'android'];
  const LANES = [['packages', 'Packages'], ['features', 'Features'], ['fixes', 'Fixes'], ['pages', 'Pages'], ['videos', 'Videos'], ['owed', 'Put off']];

  /* Audioctor's own palette (apps/audioctor.css), set on this page alone so it reads the
     same under any dashboard skin. */
  const CSS = `<style>
    .lg-page{background:#0b0a08;color:#f3eddc;border-radius:16px;padding:22px}
    .lg-page + .lg-page{margin-top:18px}
    .lg-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}
    .lg-head h2{margin:0;color:#f3eddc;font-size:22px}
    .lg-sent{font-size:12px;color:rgba(243,237,220,.55)}
    .lg-sent.old{color:#ff5c8a}
    .lg-page input.lg-r{position:absolute;opacity:0;pointer-events:none}
    .lg-tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px}
    .lg-tile{background:#181713;border:1px solid rgba(243,237,220,.1);border-radius:14px;padding:14px 12px;text-align:center;cursor:pointer;display:block}
    .lg-tile:hover{border-color:rgba(243,237,220,.3)}
    .lg-tile b{display:block;font-size:34px;line-height:1;font-weight:800;color:#ff5c8a}
    .lg-tile b.ok{color:#c8f23a}
    .lg-tile span{display:block;margin-top:8px;font-size:14px;font-weight:700;color:#f3eddc}
    .lg-tile small{display:block;margin-top:2px;font-size:12px;color:rgba(243,237,220,.5)}
    .lg-lane{display:none}
    .lg-key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:rgba(243,237,220,.6);margin:0 0 14px}
    .lg-key .lg-d{margin-right:6px}
    .lg-d{display:inline-block;width:16px;height:16px;border-radius:50%;vertical-align:middle;box-sizing:border-box}
    .lg-done{background:#c8f23a}
    .lg-todo{background:#ff5c8a}
    .lg-ask{border:2px solid #ff5c8a}
    .lg-na{width:6px;height:6px;margin:0 5px;background:rgba(243,237,220,.2)}
    .lg-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
    .lg-card{background:#181713;border:1px solid rgba(243,237,220,.1);border-radius:14px;padding:16px}
    .lg-card h3{margin:0 0 10px;font-size:14px;color:#f3eddc;display:flex;justify-content:space-between;gap:8px}
    .lg-card h3 em{font-style:normal;font-weight:600;color:rgba(243,237,220,.5)}
    .lg-bar{height:5px;border-radius:3px;background:rgba(255,92,138,.3);overflow:hidden;margin:0 0 12px}
    .lg-bar i{display:block;height:100%;background:#c8f23a}
    .lg-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px;line-height:1.3}
    .lg-row .lg-d{flex:none}
    .lg-row.is-done{color:rgba(243,237,220,.5)}
    .lg-ver{font-size:38px;font-weight:800;line-height:1;margin:2px 0 12px;color:#c8f23a}
    .lg-ver.behind{color:#ff5c8a}
    .lg-flag{font-size:12px;color:#ff5c8a;margin:10px 0 0}
    .lg-row em{font-style:normal;margin-left:auto;color:rgba(243,237,220,.6);font-size:12px}
    .lg-wrap{overflow-x:auto;background:#181713;border:1px solid rgba(243,237,220,.1);border-radius:14px;padding:6px 14px}
    .lg-grid{width:100%;border-collapse:collapse;background:transparent}
    .lg-grid th{font-size:12px;font-weight:600;color:rgba(243,237,220,.6);padding:10px 8px;text-align:center;white-space:nowrap;background:transparent;border-bottom:1px solid rgba(243,237,220,.16)}
    .lg-grid th:first-child,.lg-grid td:first-child{text-align:left}
    .lg-grid td{padding:10px 8px;text-align:center;font-size:13px;color:#f3eddc;background:transparent;border-bottom:1px solid rgba(243,237,220,.07)}
    .lg-grid td:first-child{font-weight:600;white-space:nowrap}
    .lg-grid td small{opacity:.45;font-weight:400;margin-left:6px}
    .lg-grid .lg-gap{border-left:1px solid rgba(243,237,220,.16)}
    .lg-who{flex:none;min-width:76px;text-align:center;font-size:12px;font-weight:700;color:#1d2a00;background:#c8f23a;border-radius:6px;padding:2px 8px}
    .lg-none{color:rgba(243,237,220,.6);font-size:13px;padding:8px 0}
    .lg-page code{color:#c8f23a;background:rgba(200,242,58,.08);padding:1px 5px;border-radius:4px}
    @media (max-width:760px){.lg-tiles{grid-template-columns:repeat(3,1fr)}}
  </style>`;
  const KEY = `<p class="lg-key"><span><i class="lg-d lg-done"></i>there</span><span><i class="lg-d lg-todo"></i>missing</span>
    <span><i class="lg-d lg-ask"></i>not checked</span><span><i class="lg-d lg-na"></i>not needed</span></p>`;
  const ago = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 2 ? 'just now' : m < 90 ? m + ' minutes ago' : m < 2880 ? Math.round(m / 60) + ' hours ago' : Math.round(m / 1440) + ' days ago';
  };
  const first = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').replace(/^Ori, [\d-]+:\s*/, '').split(/(?<=\.)\s/)[0]; return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /* ── the lanes: each returns { open, of, html } ─────────────────────────────── */
  function packages(rows) {
    let open = 0;
    const cards = rows.map((p) => {
      const live = stateOf(p.site) === 'done' ? noteOf(p.site).split(/\s/)[0] : '';
      const behind = live && live !== p.built;
      const needs = behind || isOpen(p.site) || isOpen(p.store);
      if (needs) open++;
      const line = (label, c) => `<div class="lg-row">${dot(c, label)}${label}<em>${
        stateOf(c) === 'done' ? esc(noteOf(c).split(/\s/)[0]) : WORD[stateOf(c)]}</em></div>`;
      return `<div class="lg-card"><h3>${esc(p.platform)}</h3><div class="lg-ver${behind ? ' behind' : ''}">${esc(p.built)}</div>
        ${line('Site', p.site)}${line('Store', p.store)}${behind ? `<p class="lg-flag">${esc(p.built)} is built, the site has ${esc(live)}</p>` : ''}</div>`;
    });
    return { open, of: rows.length, html: rows.length ? `<div class="lg-cards">${cards.join('')}</div>` : '<p class="lg-none">No packages written down yet.</p>' };
  }
  function grid(rows, cols, nameOf, sinceOf, cellOf, gapAt) {
    let open = 0;
    const body = rows.map((r) => {
      if (cols.some((c) => isOpen(cellOf(r, c)))) open++;
      return `<tr><td>${esc(nameOf(r))}${sinceOf(r) ? `<small>${esc(sinceOf(r))}</small>` : ''}</td>${
        cols.map((c, i) => `<td${i === gapAt ? ' class="lg-gap"' : ''}>${dot(cellOf(r, c), NAMES[c] || c)}</td>`).join('')}</tr>`;
    });
    const html = rows.length ? `${KEY}<div class="lg-wrap"><table class="lg-grid"><thead><tr><th></th>${
      cols.map((c, i) => `<th${i === gapAt ? ' class="lg-gap"' : ''}>${esc(NAMES[c] || c)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`
      : '<p class="lg-none">Nothing written down yet.</p>';
    return { open, of: rows.length, html };
  }
  function grouped(rows, titleKey) {
    const groups = [];
    for (const r of rows) {
      let g = groups.find((x) => x.name === r.group);
      if (!g) groups.push(g = { name: r.group, rows: [] });
      g.rows.push(r);
    }
    const open = rows.filter((r) => isOpen(r.status)).length;
    const cards = groups.map((g) => {
      const done = g.rows.filter((r) => !isOpen(r.status)).length;
      return `<div class="lg-card"><h3>${esc(g.name)}<em>${done}/${g.rows.length}</em></h3>
        <div class="lg-bar"><i style="width:${Math.round(100 * done / g.rows.length)}%"></i></div>
        ${g.rows.map((r) => `<div class="lg-row${stateOf(r.status) === 'done' ? ' is-done' : ''}" title="${esc(r.note || '')}">${dot(r.status + (r.note ? ' ' + r.note : ''))}${esc(r[titleKey])}</div>`).join('')}</div>`;
    });
    return { open, of: rows.length, html: rows.length ? `${KEY}<div class="lg-cards">${cards.join('')}</div>` : '<p class="lg-none">Nothing written down yet.</p>' };
  }
  function putOff(owed) {
    return { open: owed.length, of: owed.length, html: owed.length
      ? `<div class="lg-card">${owed.map((o) => `<div class="lg-row" title="${esc(o.text)}"><span class="lg-who">${esc(o.owes)}</span>${esc(first(o.text, 120))}<em>${esc(o.date)}</em></div>`).join('')}</div>`
      : '<p class="lg-none">Nothing is waiting on anybody.</p>' };
  }

  function board(v, owed, sent) {
    const surfaces = v.surfaces || [];
    const cols = APPS.filter((s) => surfaces.includes(s)).concat(surfaces.filter((s) => !APPS.includes(s)));
    const lanes = {
      packages: packages(v.packages || []),
      features: grid(v.features || [], cols, (f) => f.feature, (f) => f.since, (f, c) => f.cells[c] || '?', APPS.filter((s) => surfaces.includes(s)).length),
      fixes: grid(v.fixes || [], APPS, (f) => f.fix, (f) => f.since, (f, c) => f[c] || '?', -1),
      pages: grouped(v.pages || [], 'page'),
      videos: grouped(v.videos || [], 'video'),
      owed: putOff(owed),
    };
    const id = (k) => `lg-${esc(v.id)}-${k}`;
    const pick = LANES.find(([k]) => lanes[k].open) || LANES[0];
    return `<style>${LANES.map(([k]) => `#${id(k)}:checked ~ .lg-tiles label[for="${id(k)}"]{border-color:#c8f23a;background:#1f1e18}
      #${id(k)}:checked ~ .lg-lane-${k}{display:block}`).join('')}</style>
      <div class="lg-page"><div class="lg-head"><h2>${esc(v.label)}</h2>${sent}</div>
      ${LANES.map(([k]) => `<input class="lg-r" type="radio" name="lg-${esc(v.id)}" id="${id(k)}"${k === pick[0] ? ' checked' : ''}>`).join('')}
      <div class="lg-tiles">${LANES.map(([k, label]) => {
        const l = lanes[k];
        return `<label class="lg-tile" for="${id(k)}"><b class="${l.open ? '' : 'ok'}">${l.open || '✓'}</b><span>${label}</span><small>${
          k === 'owed' ? 'waiting' : l.open ? 'of ' + l.of + ' need work' : l.of + ' done'}</small></label>`;
      }).join('')}</div>
      ${LANES.map(([k]) => `<div class="lg-lane lg-lane-${k}">${lanes[k].html}</div>`).join('')}</div>`;
  }

  function html(d) {
    if (!d || !d.ledger) {
      return CSS + `<div class="lg-page"><div class="lg-head"><h2>Owed</h2></div><p class="lg-none">${
        d && d.missing === 'table'
          ? 'The table for this does not exist yet. Run <code>worker/schema-ops-ledger.sql</code> once, then <code>contracts/push.sh</code>.'
          : 'Nothing has been sent yet. Run <code>contracts/push.sh</code> from the SNOWSTAR folder.'}</p></div>`;
    }
    const L = d.ledger;
    const stale = Date.now() - d.pushedAt > 36 * 3600 * 1000;
    const sent = `<span class="lg-sent${stale ? ' old' : ''}">sent ${esc(ago(d.pushedAt))}${stale ? '. Old: run contracts/push.sh' : ''}</span>`;
    const vs = L.verticals || [];
    if (!vs.length) return CSS + `<div class="lg-page"><p class="lg-none">No product keeps a ledger yet.</p></div>`;
    return CSS + vs.map((v, i) => board(v, i === 0 ? (L.owed || []) : [], sent)).join('');
  }
  window.SnowstarLedger = { html };
})();
