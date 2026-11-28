/* Audioctor > Map 3D: the operation as a model you can turn.
 *
 * Ori, 2026-11-27: "as little text as possible, a 3D illustration that helps me understand
 * our architecture". So: four platform cubes in a row. Behind each, its lane of small
 * cubes, one per step of the chain in the order the sound goes through them, then the
 * newer features; a gap in a lane is a step that platform does not have. Above, the teams
 * (a wire cube is an empty seat), piped to what they touch. In front, the money: one cube
 * per place that sells, a small one per plan. Click a cube for what it is built from.
 *
 * The data is the same document the Owed page reads (/api/ops/ledger): the ledger's
 * tables and ledger/map/*.md, sent by contracts/push.sh. Nothing is edited from here.
 *
 * Ori, 2026-11-28: "each cube can be a shape, a figure or an icon, so it is plain who it is
 * and what it does", and "what goes to GitHub and what goes to Cloudflare, and where". So a
 * thing with a role is an icon standing on a tile (the tile's colour is its state), only the
 * ordered steps stay small cubes, and a fourth layer on the left is the servers
 * (ledger/map/servers.md) with what travels between them (wires.md) as dots moving along
 * the pipes: bone to GitHub, orange to Cloudflare, blue to Apple. The chips at the top
 * switch a layer off.
 *
 * No library: cubes are eight points turned and projected onto a 2D canvas, drawn far to
 * near. That is all this picture needs, and the dashboard stays without a dependency.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const stateOf = (c) => (/^done/.test(c) ? 'done' : /^todo/.test(c) ? 'todo' : /^n\/a/.test(c) ? 'na' : 'ask');
  const noteOf = (c) => String(c || '').replace(/^(done|todo|n\/a|\?)\s*/, '');
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const LIME = [200, 242, 58], PINK = [255, 92, 138], BONE = [243, 237, 220], BLUE = [110, 200, 255], GOLD = [255, 200, 87], ORANGE = [246, 130, 31];
  const ICON = { mac: 'laptop', win: 'monitor', ios: 'phone', android: 'android', creem: 'card', 'app store': 'bag', 'google play': 'play', plan: 'coin',
    'product and code': 'code', design: 'pen', marketing: 'horn', sales: 'tag', users: 'people', legal: 'scales', finance: 'dollar' };
  const OWNER = { github: BONE, cloudflare: ORANGE, ori: LIME, apple: BLUE };
  const LAYERS = [['product', 'Product'], ['people', 'People'], ['money', 'Money'], ['servers', 'Servers']];
  const PKEY = { mac: 'mac', windows: 'win', iphone: 'ios', android: 'android' };
  const PNAME = { mac: 'macOS', win: 'Windows', ios: 'iPhone', android: 'Android' };
  const WORD = { done: 'there', todo: 'missing', ask: 'not checked', na: 'not needed' };
  const KIND = { model: PINK, own: LIME, system: BLUE, runtime: BONE, service: GOLD };

  const CSS = `<style>
    .sm{position:relative;background:#0b0a08;border-radius:16px;overflow:hidden;height:min(78vh,760px);min-height:520px;color:#f3eddc}
    .sm canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
    .sm canvas.drag{cursor:grabbing}
    .sm-key{position:absolute;left:16px;bottom:14px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:rgba(243,237,220,.6);pointer-events:none}
    .sm-key i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px;box-sizing:border-box}
    .sm-layers{position:absolute;left:14px;top:14px;display:flex;gap:6px;flex-wrap:wrap}
    .sm-layers button{background:#c8f23a;color:#1d2a00;border:0;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer}
    .sm-layers button.off{background:#181713;color:rgba(243,237,220,.55);box-shadow:inset 0 0 0 1px rgba(243,237,220,.2)}
    .sm-tip{position:absolute;pointer-events:none;background:#181713;border:1px solid rgba(243,237,220,.25);border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;white-space:nowrap;display:none}
    .sm-panel{position:absolute;top:14px;right:14px;width:270px;max-height:calc(100% - 28px);overflow:auto;background:rgba(24,23,19,.94);border:1px solid rgba(243,237,220,.14);border-radius:14px;padding:16px;display:none}
    .sm-panel h3{margin:0 0 4px;font-size:17px;color:#f3eddc}
    .sm-panel .sm-sub{font-size:12px;color:rgba(243,237,220,.55);margin:0 0 12px}
    .sm-x{position:absolute;top:8px;right:10px;background:none;border:0;color:rgba(243,237,220,.6);font-size:20px;cursor:pointer;line-height:1}
    .sm-flow{display:flex;flex-direction:column;gap:0}
    .sm-part{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#0b0a08;border:1px solid rgba(243,237,220,.12);border-radius:10px;font-size:13px}
    .sm-part b{flex:none;width:14px;height:14px;border-radius:3px}
    .sm-part em{margin-left:auto;font-style:normal;font-size:12px;color:rgba(243,237,220,.6);white-space:nowrap}
    .sm-part u{flex:none;width:8px;height:8px;border-radius:50%;text-decoration:none}
    .sm-arrow{align-self:center;width:2px;height:12px;background:rgba(243,237,220,.3)}
    .sm-plats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0 0 14px}
    .sm-plats span{text-align:center;font-size:12px;padding:6px 2px;border-radius:8px;border:1px solid rgba(243,237,220,.12);color:rgba(243,237,220,.7)}
    .sm-plats span.done{background:#c8f23a;color:#1d2a00;border-color:transparent;font-weight:700}
    .sm-plats span.todo{background:#ff5c8a;color:#2a0010;border-color:transparent;font-weight:700}
    .sm-plats span.ask{border-color:#ff5c8a;color:#ff5c8a}
    .sm-plats span.na{opacity:.35}
    .sm-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 0;border-bottom:1px solid rgba(243,237,220,.08)}
    .sm-row em{font-style:normal;color:rgba(243,237,220,.6)}
    .sm-what{font-size:13px;line-height:1.45;color:#f3eddc;background:rgba(200,242,58,.08);border-left:3px solid #c8f23a;border-radius:6px;padding:9px 11px;margin:0 0 12px}
    .sm-note{font-size:12px;color:rgba(243,237,220,.55);margin:10px 0 0}
    .sm-kinds{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:rgba(243,237,220,.55);margin-top:12px}
    .sm-kinds i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
    @media (max-width:760px){.sm-panel{left:14px;right:14px;width:auto;top:auto;bottom:44px;max-height:50%}}
  </style>`;
  const rgb = (c, k) => `rgb(${c.map((x) => Math.round(Math.min(255, x * k))).join(',')})`;
  const rgba = (c, a) => `rgba(${c.join(',')},${a})`;

  function html(d) {
    if (!d || !d.ledger) {
      return CSS + `<div class="sm" style="height:auto;min-height:0;padding:22px">Nothing has been sent yet. Run <code>contracts/push.sh</code> from the SNOWSTAR folder.</div>`;
    }
    return CSS + `<div class="sm" id="sm-root"><canvas></canvas><div class="sm-layers">${LAYERS.map(([k, l]) => `<button data-layer="${k}">${l}</button>`).join('')}</div><div class="sm-tip"></div><div class="sm-panel"></div>
      <div class="sm-key"><span><i style="background:#c8f23a"></i>there</span><span><i style="background:#ff5c8a"></i>missing</span>
      <span><i style="border:2px solid #ff5c8a"></i>not checked</span><span><i style="border:2px dashed rgba(243,237,220,.7)"></i>empty seat</span>
      <span><i style="background:#f3eddc"></i>GitHub</span><span><i style="background:#f6821f"></i>Cloudflare</span><span><i style="background:#6ec8ff"></i>Apple</span>
      <span>drag to turn · scroll to zoom · click anything</span></div></div>`;
  }

  /* ── the scene: a flat list of cubes and pipes in world units ─────────────── */
  function build(v) {
    const cubes = [], pipes = [], m = v.map || {};
    let S_wires = [];
    const teamTouch = [], named = {};
    const parts = Object.fromEntries((m.parts || []).map((p) => [p.id, p]));
    const add = (c) => { cubes.push(c); return c; };
    const pipe = (a, b, col, w, layer, flow) => pipes.push({ a, b, col: col || BONE, w: w || 1, layer: layer || 'product', flow });
    const col = (st) => (st === 'done' ? LIME : PINK);

    /* platforms, in a row */
    const plats = (v.packages || []).map((p, i, all) => {
      const key = PKEY[String(p.platform).toLowerCase()] || String(p.platform).toLowerCase();
      const live = stateOf(p.site) === 'done' ? noteOf(p.site).split(/\s/)[0] : '';
      const open = (live && live !== p.built) || ['todo', 'ask'].includes(stateOf(p.site)) || ['todo', 'ask'].includes(stateOf(p.store));
      return add({ kind: 'platform', key, name: PNAME[key] || p.platform, sub: String(p.built).split(/[\s,]/)[0], x: (i - (all.length - 1) / 2) * 4.2, y: 0, z: 0, s: 2,
        c: open ? PINK : LIME, label: true, data: p, icon: ICON[key] || 'box', layer: 'product' });
    });
    const byKey = Object.fromEntries(plats.map((p) => [p.key, p]));

    /* the lane behind each platform: the chain's steps in order, then the newer features */
    const steps = (m.chain || []).map((r) => ({ id: 'step:' + r.step, name: r.step, cell: (k) => r[k] || '?', from: list(r.from), chain: true }))
      .concat((v.features || []).map((f) => ({ id: 'feat:' + f.feature, name: f.feature, since: f.since, cell: (k) => f.cells[k] || '?', from: [], chain: false })));
    for (const p of plats) {
      let prev = p;
      steps.forEach((s, j) => {
        const st = stateOf(s.cell(p.key));
        if (st === 'na') return;                       /* a gap: this platform does not have the step */
        const cube = add({ kind: 'step', key: s.id, name: s.name, x: p.x, y: -0.45, z: 2.2 + j * 0.86 + (s.chain ? 0 : 0.8), s: 0.56,
          c: col(st), wire: st === 'ask', data: { step: s, platform: p.key, cell: s.cell(p.key) }, layer: 'product' });
        pipe(prev, cube, cube.c, 1.2);
        prev = cube;
      });
    }

    /* money, in front: a cube per place that sells, a small one per plan */
    const chans = [];
    for (const r of m.money || []) {
      let ch = chans.find((c) => c.name === r.channel);
      if (!ch) chans.push(ch = { name: r.channel, rows: [] });
      ch.rows.push(r);
    }
    const chanCube = {};
    chans.forEach((ch, i) => {
      const live = ch.rows.some((r) => stateOf(r.status) === 'done'), ask = ch.rows.some((r) => stateOf(r.status) === 'ask');
      const cube = chanCube[ch.name.toLowerCase()] = add({ kind: 'money', key: 'money:' + ch.name, name: ch.name, x: (i - (chans.length - 1) / 2) * 5.2, y: -0.2, z: -6.5, s: 1.6,
        c: live ? GOLD : PINK, wire: !live && ask, label: true, data: ch, icon: ICON[ch.name.toLowerCase()] || 'coin', layer: 'money' });
      const sells = new Set(ch.rows.flatMap((r) => list(r.sells)));
      for (const k of sells) if (byKey[k]) pipe(cube, byKey[k], cube.c, 1.6, 'money');
      ch.rows.forEach((r, j) => {
        const st = stateOf(r.status);
        const pc = add({ kind: 'plan', key: 'plan:' + ch.name + r.plan, name: r.plan + (r.price ? ' ' + r.price : ''), x: cube.x + (j - (ch.rows.length - 1) / 2) * 1.5, y: -0.55, z: -8.6, s: 0.75,
          c: st === 'done' ? GOLD : PINK, wire: st === 'ask', data: { plan: r, channel: ch.name }, icon: ICON.plan, layer: 'money' });
        pipe(pc, cube, pc.c, 1, 'money');
      });
    });

    /* teams, above: a wire cube is a seat nobody but Ori fills */
    (m.teams || []).forEach((t, i, all) => {
      const open = /^open$/i.test(t.seat);
      const cube = add({ kind: 'team', key: 'team:' + t.team, name: String(t.team).split(' ')[0], x: (i - (all.length - 1) / 2) * 3.3, y: 5.2, z: 7, s: 1.5,
        c: BONE, wire: open, label: true, data: t, icon: ICON[String(t.team).toLowerCase()] || 'person', layer: 'people' });
      for (const k of list(t.touches)) {
        teamTouch.push([cube, k]);
      }
    });

    /* servers, on the left: a column per owner (Ori's Mac, GitHub, Cloudflare), and what
       travels between them. A wire may also end at a platform or at a place that sells. */
    const srv = {}, tiers = {};
    for (const r of m.servers || []) (tiers[r.tier] = tiers[r.tier] || []).push(r);
    for (const [tier, rows] of Object.entries(tiers)) {
      rows.forEach((r, i) => {
        srv[r.id] = add({ kind: 'server', key: 'srv:' + r.id, name: r.name, x: -22 + Number(tier) * 4, y: 0, z: 3 + (i - (rows.length - 1) / 2) * 4, s: 1.5,
          c: OWNER[String(r.owner).toLowerCase()] || BONE, label: true, data: r, icon: r.icon || 'box', layer: 'servers' });
      });
    }
    const end = (k) => srv[k] || byKey[k] || chanCube[String(k).toLowerCase()];
    const wires = [];
    for (const w of m.wires || []) {
      const a = end(w.from), b = end(w.to);
      if (!a || !b) continue;
      const st = stateOf(w.status);
      const colr = st !== 'done' ? PINK : b.kind === 'server' ? b.c : b.kind === 'money' ? BLUE : a.kind === 'server' ? a.c : BONE;
      pipe(a, b, colr, 1.5, 'servers', st === 'done');
      wires.push({ w, a, b });
    }
    S_wires = wires;

    /* the pages, in front of GitHub: one token per group of pages.md, fed by Pages */
    const PGROUP = { Main: 'Product pages', Search: 'Search pages', Audiences: 'Audience pages' };
    const groups = [];
    for (const r of v.pages || []) { let g = groups.find((x) => x.id === r.group); if (!g) groups.push(g = { id: r.group, rows: [] }); g.rows.push(r); }
    groups.forEach((g, i) => {
      const open = g.rows.filter((r) => /^(todo|\?)/.test(r.status)).length, name = PGROUP[g.id] || g.id + ' pages';
      const node = named[name.toLowerCase()] = add({ kind: 'pages', key: 'pages:' + g.id, name, sub: (g.rows.length - open) + '/' + g.rows.length, x: -19 + i * 4.2, y: 0, z: -8, s: 1.5,
        c: open ? PINK : LIME, label: true, data: g, icon: 'page', layer: 'servers' });
      if (srv['gh-pages']) pipe(srv['gh-pages'], node, BONE, 1.2, 'servers', true);
    });
    for (const c of cubes) if (c.icon && !named[c.name.toLowerCase()]) named[c.name.toLowerCase()] = c;
    const find = (k) => byKey[k] || srv[k] || chanCube[String(k).toLowerCase()] || named[String(k).toLowerCase()];
    for (const [cube, k] of teamTouch) { const to = find(k); if (to) { pipe(cube, to, BONE, 0.6, 'people'); (cube.touch = cube.touch || []).push(to.name); } }
    const what = Object.fromEntries((m.glossary || []).map((g) => [String(g.name).toLowerCase(), g.what]));
    for (const c of cubes) c.what = what[c.name.toLowerCase()] || '';
    for (const id in parts) parts[id].what = what[String(parts[id].name).toLowerCase()] || '';
    return { cubes, pipes, parts, steps, wires: S_wires };
  }

  /* ── the panel: what the clicked cube is, as chips and dots ───────────────── */
  function panelHtml(c, S, v) {
    const x = '<button class="sm-x" aria-label="Close">×</button>';
    const W = c.what ? `<p class="sm-what">${esc(c.what)}</p>` : '';
    if (c.kind === 'step') {
      const s = c.data.step;
      const plats = ['mac', 'win', 'ios', 'android'].map((k) => {
        const st = stateOf(s.cell(k));
        return `<span class="${st}" title="${esc(WORD[st] + (noteOf(s.cell(k)) ? '. ' + noteOf(s.cell(k)) : ''))}">${PNAME[k]}</span>`;
      }).join('');
      const flow = s.from.map((id) => S.parts[id] || { id, name: id, kind: 'own', licence: '?', risk: '?' }).map((p) =>
        `<div class="sm-part" title="${esc([p.what, p.note].filter(Boolean).join(' '))}"><b style="background:${rgb(KIND[p.kind] || BONE, 1)}"></b>${esc(p.name)}<em>${esc(p.licence || '')}</em>
          <u style="background:${p.risk === 'ok' ? '#c8f23a' : '#ff5c8a'}" title="${p.risk === 'ok' ? 'licence clear' : p.risk === 'watch' ? 'licence to watch' : 'licence not checked'}"></u></div>`).join('<div class="sm-arrow"></div>');
      return `${x}<h3>${esc(s.name)}</h3><p class="sm-sub">${s.chain ? 'step of the chain' : 'feature' + (s.since ? ' since ' + esc(s.since) : '')}</p>
        <div class="sm-plats">${plats}</div>
        ${flow ? `<div class="sm-flow">${flow}</div><div class="sm-kinds">${Object.entries(KIND).map(([k, col]) => `<span><i style="background:${rgb(col, 1)}"></i>${k}</span>`).join('')}</div>`
          : '<p class="sm-note">What it is built from is not written down yet (ledger/map/chain.md).</p>'}`;
    }
    if (c.kind === 'platform') {
      const p = c.data, row = (l, cell) => `<div class="sm-row">${l}<em>${stateOf(cell) === 'done' ? esc(noteOf(cell).split(/\s/)[0]) : WORD[stateOf(cell)]}</em></div>`;
      const mine = S.cubes.filter((k) => k.kind === 'step' && k.data.platform === c.key);
      const n = (st) => mine.filter((k) => stateOf(k.data.cell) === st).length;
      return `${x}<h3>${esc(c.name)}</h3><p class="sm-sub">newest build ${esc(p.built)}</p>${W}${row('On the site', p.site)}${row('In the store', p.store)}
        <div class="sm-row">Steps and features there<em>${n('done')}</em></div><div class="sm-row">Missing<em>${n('todo')}</em></div><div class="sm-row">Not checked<em>${n('ask')}</em></div>
        ${p.note ? `<p class="sm-note">${esc(p.note)}</p>` : ''}`;
    }
    if (c.kind === 'money' || c.kind === 'plan') {
      const ch = c.kind === 'money' ? c.data : { name: c.data.channel, rows: [c.data.plan] };
      return `${x}<h3>${esc(ch.name)}</h3><p class="sm-sub">money in, by plan</p>${c.kind === 'money' ? W : ''}${ch.rows.map((r) =>
        `<div class="sm-row" title="${esc(r.note || '')}">${esc(r.plan)}<em>${esc(r.price || '')} · ${stateOf(r.status) === 'done' ? 'on sale' : WORD[stateOf(r.status)]}</em></div>`).join('')}
        ${ch.rows.map((r) => r.note ? `<p class="sm-note">${esc(r.plan)}: ${esc(r.note)}</p>` : '').join('')}`;
    }
    if (c.kind === 'server') {
      const r = c.data, line = (o, out) => `<div class="sm-row" title="${esc(o.w.note || noteOf(o.w.status))}">${out ? '→ ' + esc(o.b.name) : '← ' + esc(o.a.name)}<em>${esc(o.w.carries)}${stateOf(o.w.status) === 'done' ? '' : ' · ' + WORD[stateOf(o.w.status)]}</em></div>`;
      return `${x}<h3>${esc(r.name)}</h3><p class="sm-sub">${esc(r.owner)}${r.note ? ' · ' + esc(r.note) : ''}</p>${W || `<p class="sm-note" style="margin:0 0 10px">${esc(r.holds)}</p>`}
        ${S.wires.filter((o) => o.a === c).map((o) => line(o, true)).join('')}${S.wires.filter((o) => o.b === c).map((o) => line(o, false)).join('')}`;
    }
    if (c.kind === 'pages') {
      return `${x}<h3>${esc(c.name)}</h3><p class="sm-sub">${esc(c.sub)} live on the site</p>${W}${c.data.rows.map((r) =>
        `<div class="sm-row" title="${esc(r.note || '')}">${esc(r.page)}<em style="color:${/^done/.test(r.status) ? '#c8f23a' : '#ff5c8a'}">${/^done/.test(r.status) ? 'live' : /^todo/.test(r.status) ? 'missing' : 'not checked'}</em></div>`).join('')}`;
    }
    const t = c.data, open = /^open$/i.test(t.seat);
    const pages = (v.pages || []).filter((r) => /^(todo|\?)/.test(r.status)).length, videos = (v.videos || []).filter((r) => /^(todo|\?)/.test(r.status)).length;
    return `${x}<h3>${esc(t.team)}</h3><p class="sm-sub">${open ? 'empty seat: Ori does it today' : esc(t.seat)}</p>${W}
      <div class="sm-row">Touches<em style="text-align:right">${esc((c.touch || []).join(', '))}</em></div>
      ${t.team === 'Marketing' ? `<div class="sm-row">Pages missing<em>${pages}</em></div><div class="sm-row">Videos missing<em>${videos}</em></div>` : ''}
      ${t.note ? `<p class="sm-note">${esc(t.note)}</p>` : ''}`;
  }

  /* ── the canvas: turn, project, draw far to near ──────────────────────────── */
  const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const FACES = [[[0, 1, 2, 3], [0, 0, -1]], [[5, 4, 7, 6], [0, 0, 1]], [[4, 0, 3, 7], [-1, 0, 0]], [[1, 5, 6, 2], [1, 0, 0]], [[3, 2, 6, 7], [0, 1, 0]], [[4, 5, 1, 0], [0, -1, 0]]];
  const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

  function mount(root, d) {
    if (!root || !d || !d.ledger) return;
    const v = (d.ledger.verticals || []).find((x) => x.id === 'audioctor') || (d.ledger.verticals || [])[0];
    if (!v) return;
    const S = build(v), cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    const tip = root.querySelector('.sm-tip'), panel = root.querySelector('.sm-panel');
    let yaw = -0.55, pitch = 0.5, zoom = 1, W = 0, H = 0, sel = null, hover = null, auto = true, raf = 0;
    const CENTER = [-4, 1.6, 4.5];
    const off = {};                                     /* layers switched off */
    let tick = 0;
    const rot = (x, y, z) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp + z1 * sp, -y * sp + z1 * cp];   /* the eye is above: far things rise on the screen */
    };
    const proj = (x, y, z) => {
      const [a, b, c] = rot(x - CENTER[0], y - CENTER[1], z - CENTER[2]);
      const k = (Math.min(W, H * 1.6) / 46) * zoom * (40 / (40 + c));
      return [W / 2 + a * k, H / 2 - b * k, c, k];
    };
    function size() {
      const r = root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /* A glyph is a few strokes in a box from -1 to 1 (y down), drawn at u pixels per unit. */
    function glyph(name, cx, cy, u, ink) {
      const X = (x) => cx + x * u, Y = (y) => cy + y * u;
      const L = (...q) => { ctx.beginPath(); for (let i = 0; i < q.length; i += 2) (i ? ctx.lineTo(X(q[i]), Y(q[i + 1])) : ctx.moveTo(X(q[i]), Y(q[i + 1]))); ctx.stroke(); };
      const P = (...q) => { ctx.beginPath(); for (let i = 0; i < q.length; i += 2) (i ? ctx.lineTo(X(q[i]), Y(q[i + 1])) : ctx.moveTo(X(q[i]), Y(q[i + 1]))); ctx.closePath(); ctx.stroke(); };
      const C = (x, y, r, fill) => { ctx.beginPath(); ctx.arc(X(x), Y(y), r * u, 0, 7); fill ? ctx.fill() : ctx.stroke(); };
      const A = (x, y, r, a, b) => { ctx.beginPath(); ctx.arc(X(x), Y(y), r * u, a, b); ctx.stroke(); };
      const E = (x, y, rx, ry, a, b) => { ctx.beginPath(); ctx.ellipse(X(x), Y(y), rx * u, ry * u, 0, a == null ? 0 : a, b == null ? 7 : b); ctx.stroke(); };
      const T = (t, size) => { ctx.font = `800 ${size * u}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, cx, cy + 0.04 * u); };
      const head = (x, y, k) => { C(x, y - 0.3 * k, 0.26 * k); A(x, y + 0.62 * k, 0.52 * k, Math.PI, 0); };
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1.4, u * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const G = {
        laptop: () => { P(-0.55, -0.5, 0.55, -0.5, 0.55, 0.25, -0.55, 0.25); L(-0.8, 0.5, 0.8, 0.5); },
        monitor: () => { P(-0.7, -0.55, 0.7, -0.55, 0.7, 0.25, -0.7, 0.25); L(0, 0.25, 0, 0.58); L(-0.35, 0.6, 0.35, 0.6); },
        phone: () => { P(-0.36, -0.7, 0.36, -0.7, 0.36, 0.7, -0.36, 0.7); C(0, 0.47, 0.07, true); },
        android: () => { P(-0.36, -0.55, 0.36, -0.55, 0.36, 0.72, -0.36, 0.72); L(-0.18, -0.58, -0.34, -0.85); L(0.18, -0.58, 0.34, -0.85); C(-0.14, -0.3, 0.06, true); C(0.14, -0.3, 0.06, true); },
        card: () => { P(-0.7, -0.45, 0.7, -0.45, 0.7, 0.45, -0.7, 0.45); L(-0.7, -0.15, 0.7, -0.15); L(-0.45, 0.2, -0.1, 0.2); },
        bag: () => { P(-0.52, -0.25, 0.52, -0.25, 0.6, 0.68, -0.6, 0.68); A(0, -0.25, 0.28, Math.PI, 0); },
        play: () => { P(-0.4, -0.6, 0.6, 0, -0.4, 0.6); },
        coin: () => { C(0, 0, 0.55); T('$', 0.8); },
        dollar: () => { T('$', 1.5); },
        code: () => { L(-0.25, -0.45, -0.7, 0, -0.25, 0.45); L(0.25, -0.45, 0.7, 0, 0.25, 0.45); L(0.12, -0.6, -0.12, 0.6); },
        pen: () => { P(-0.62, 0.62, -0.5, 0.25, 0.3, -0.55, 0.6, -0.25, -0.2, 0.55); L(0.1, -0.35, 0.4, -0.05); },
        horn: () => { P(-0.7, -0.18, -0.25, -0.18, 0.5, -0.6, 0.5, 0.6, -0.25, 0.18, -0.7, 0.18); L(-0.45, 0.2, -0.35, 0.65); },
        tag: () => { P(-0.7, 0, -0.15, -0.52, 0.68, -0.52, 0.68, 0.52, -0.15, 0.52); C(0.02, 0, 0.11); },
        person: () => head(0, 0, 1),
        people: () => { head(-0.32, 0.05, 0.75); head(0.36, 0.05, 0.75); },
        scales: () => { L(0, -0.65, 0, 0.6); L(-0.4, 0.62, 0.4, 0.62); L(-0.62, -0.4, 0.62, -0.4); A(-0.55, -0.1, 0.24, 0, Math.PI); A(0.55, -0.1, 0.24, 0, Math.PI); },
        repo: () => { C(-0.32, -0.5, 0.17); C(-0.32, 0.5, 0.17); C(0.4, -0.12, 0.17); L(-0.32, -0.33, -0.32, 0.33); L(-0.32, 0.2, 0.28, 0.02); },
        gear: () => { C(0, 0, 0.36); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(Math.cos(a) * 0.46, Math.sin(a) * 0.46, Math.cos(a) * 0.7, Math.sin(a) * 0.7); } },
        globe: () => { C(0, 0, 0.65); E(0, 0, 0.28, 0.65); L(-0.65, 0, 0.65, 0); },
        fork: () => { L(-0.7, 0, -0.1, 0); L(-0.1, 0, 0.5, -0.45); L(-0.1, 0, 0.5, 0.45); L(0.25, -0.5, 0.55, -0.48, 0.5, -0.18); L(0.25, 0.5, 0.55, 0.48, 0.5, 0.18); },
        cloud: () => { A(-0.3, 0.12, 0.3, Math.PI * 0.5, Math.PI * 1.5); A(0, -0.12, 0.36, Math.PI * 1.05, Math.PI * 1.95); A(0.36, 0.12, 0.3, Math.PI * 1.5, Math.PI * 0.5); L(-0.3, 0.42, 0.36, 0.42); },
        db: () => { E(0, -0.45, 0.52, 0.2); L(-0.52, -0.45, -0.52, 0.45); L(0.52, -0.45, 0.52, 0.45); E(0, 0.45, 0.52, 0.2, 0, Math.PI); E(0, 0, 0.52, 0.2, 0, Math.PI); },
        bucket: () => { E(0, -0.4, 0.58, 0.18); L(-0.58, -0.4, -0.4, 0.55); L(0.58, -0.4, 0.4, 0.55); E(0, 0.55, 0.4, 0.13, 0, Math.PI); },
        page: () => { P(-0.48, -0.68, 0.2, -0.68, 0.5, -0.38, 0.5, 0.68, -0.48, 0.68); L(-0.22, -0.1, 0.24, -0.1); L(-0.22, 0.2, 0.24, 0.2); L(-0.22, 0.48, 0.08, 0.48); },
        box: () => { P(-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5); },
      };
      (G[name] || G.box)();
    }
    /* A thing with a role: a round token standing on its tile, the glyph says who it is,
       the colour says how it stands. An empty seat is a dashed ring. */
    function drawIcon(c) {
      const h = c.s / 2, on = sel && sel.key === c.key, hot = hover === c;
      const tile = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((o) => proj(c.x + o[0] * h * 0.8, c.y - h, c.z + o[1] * h * 0.8));
      ctx.beginPath(); tile.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
      ctx.fillStyle = rgba(c.c, 0.16); ctx.fill();
      const p = proj(c.x, c.y + h * 0.2, c.z), r = Math.max(9, h * p[3] * 0.92), foot = proj(c.x, c.y - h, c.z);
      ctx.strokeStyle = rgba(c.c, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1] + r); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7);
      if (c.wire) {
        ctx.fillStyle = '#0b0a08'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(c.c, 0.9); ctx.lineWidth = hot || on ? 2.6 : 1.6; ctx.stroke(); ctx.setLineDash([]);
        glyph(c.icon, p[0], p[1], r * 0.78, rgba(c.c, 0.75));
      } else {
        ctx.fillStyle = rgb(c.c, hot ? 1.12 : 1); ctx.fill();
        glyph(c.icon, p[0], p[1], r * 0.78, '#0b0a08');
      }
      c.sx = p[0]; c.sy = p[1]; c.sr = r; c.depth = p[2];
      if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 5, 0, 7); ctx.stroke(); }
      c.foot = foot;
    }
    function drawLabel(c) {                              /* names go on last, over everything */
      const foot = c.foot;
      if (c.label && foot) {
        const big = c.kind === 'platform';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(11,10,8,.85)'; ctx.lineJoin = 'round';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f3eddc'; ctx.font = `700 ${big ? 14 : 12}px system-ui,sans-serif`;
        ctx.strokeText(c.name, foot[0], foot[1] + 18); ctx.fillText(c.name, foot[0], foot[1] + 18);
        if (c.sub) { ctx.fillStyle = 'rgba(243,237,220,.6)'; ctx.font = '12px system-ui,sans-serif'; ctx.strokeText(c.sub, foot[0], foot[1] + 33); ctx.fillText(c.sub, foot[0], foot[1] + 33); }
      }
    }
    function drawCube(c) {
      if (c.icon) return drawIcon(c);
      const h = c.s / 2, pts = CORNERS.map((o) => proj(c.x + o[0] * h, c.y + o[1] * h, c.z + o[2] * h));
      const on = sel && sel.key === c.key, hot = hover === c;
      if (c.wire) {
        ctx.fillStyle = rgba(c.c, on ? 0.22 : 0.07);
        for (const [idx] of FACES) { ctx.beginPath(); idx.forEach((i, n) => (n ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]))); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = rgba(c.c, 0.9); ctx.lineWidth = hot || on ? 2.4 : 1.4;
        ctx.beginPath(); for (const [a, b] of EDGES) { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); } ctx.stroke();
      } else {
        for (const [idx, n] of FACES) {
          const r = rot(n[0], n[1], n[2]);
          if (r[2] >= 0) continue;                       /* turned away from the eye */
          const lit = 0.5 + 0.5 * Math.max(0, r[0] * -0.35 + r[1] * 0.75 + r[2] * -0.55);
          ctx.fillStyle = rgb(c.c, (hot ? 1.15 : 1) * lit);
          ctx.beginPath(); idx.forEach((i, k) => (k ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]))); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(11,10,8,.55)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      const p = proj(c.x, c.y, c.z);
      c.sx = p[0]; c.sy = p[1]; c.sr = h * p[3] * 1.15; c.depth = p[2];
      if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], c.sr * 1.25, 0, 7); ctx.stroke(); }
      if (c.label) {
        const below = proj(c.x, c.y - h, c.z);
        ctx.textAlign = 'center'; ctx.fillStyle = '#f3eddc'; ctx.font = `700 ${c.kind === 'platform' ? 14 : 12}px system-ui,sans-serif`;
        ctx.fillText(c.name, below[0], below[1] + 18 + c.sr * 0.25);
        if (c.sub) { ctx.fillStyle = 'rgba(243,237,220,.6)'; ctx.font = '12px system-ui,sans-serif'; ctx.fillText(c.sub, below[0], below[1] + 33 + c.sr * 0.25); }
      }
    }
    function frame() {
      if (!document.body.contains(cv)) return;           /* the dashboard painted another page */
      if (auto) yaw += 0.0016;
      ctx.clearRect(0, 0, W, H);
      tick++;
      for (const c of S.cubes) if (off[c.layer]) c.sr = 0;
      const items = S.cubes.filter((c) => !off[c.layer]).map((c) => ({ c, z: proj(c.x, c.y, c.z)[2] }))
        .concat(S.pipes.filter((p) => !off[p.layer] && !off[p.a.layer] && !off[p.b.layer]).map((p) => ({ p, z: (proj(p.a.x, p.a.y, p.a.z)[2] + proj(p.b.x, p.b.y, p.b.z)[2]) / 2 + 0.01 })));
      items.sort((a, b) => b.z - a.z);
      for (const it of items) {
        if (it.c) { drawCube(it.c); continue; }
        const a = proj(it.p.a.x, it.p.a.y, it.p.a.z), b = proj(it.p.b.x, it.p.b.y, it.p.b.z);
        const lit = sel && (sel === it.p.a || sel === it.p.b);
        ctx.strokeStyle = rgba(it.p.col, lit ? 0.95 : sel ? 0.12 : 0.34); ctx.lineWidth = it.p.w * (lit ? 2.2 : 1) * Math.max(0.6, a[3] / 26); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (it.p.flow && (!sel || lit)) {                 /* what travels: a dot going from a to b */
          const t = ((tick * 0.006 + (it.p.a.x + it.p.b.z) * 0.13) % 1 + 1) % 1;
          ctx.fillStyle = rgba(it.p.col, 1); ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.max(2.5, a[3] / 9), 0, 7); ctx.fill();
        }
      }
      for (const it of items) if (it.c && it.c.icon) drawLabel(it.c);
      raf = requestAnimationFrame(frame);
    }
    const pick = (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null;
      for (const c of S.cubes) if (c.sr && !off[c.layer] && Math.hypot(c.sx - x, c.sy - y) < Math.max(9, c.sr) && (!best || c.depth < best.depth)) best = c;
      return best;
    };
    function select(c) {
      sel = c;
      if (!c) { panel.style.display = 'none'; return; }
      panel.innerHTML = panelHtml(c, S, v); panel.style.display = 'block';
      panel.querySelector('.sm-x').onclick = () => select(null);
    }
    let down = null;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); auto = false; });
    cv.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
        yaw = down.yaw + dx * 0.008; pitch = Math.max(0.05, Math.min(1.45, down.pitch + dy * 0.006));
        tip.style.display = 'none'; return;
      }
      hover = pick(e);
      if (hover) {
        const r = root.getBoundingClientRect();
        tip.textContent = hover.name + (hover.kind === 'step' ? ' · ' + PNAME[hover.data.platform] : '');
        tip.style.display = 'block'; tip.style.left = Math.min(r.width - 180, e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
      } else tip.style.display = 'none';
      cv.style.cursor = hover ? 'pointer' : '';
    });
    cv.addEventListener('pointerup', (e) => { cv.classList.remove('drag'); if (down && !down.moved) select(pick(e)); down = null; });
    cv.addEventListener('pointerleave', () => { hover = null; tip.style.display = 'none'; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); auto = false; zoom = Math.max(0.5, Math.min(3.2, zoom * (e.deltaY < 0 ? 1.08 : 0.93))); }, { passive: false });
    root.querySelectorAll('.sm-layers button').forEach((b) => { b.onclick = () => {
      const k = b.dataset.layer; off[k] = !off[k]; b.classList.toggle('off', !!off[k]);
      if (sel && off[sel.layer]) select(null);
    }; });
    window.addEventListener('resize', size);
    size(); cancelAnimationFrame(raf); frame();
    return { select: (key) => select(S.cubes.find((c) => c.key === key) || null), scene: S };
  }
  window.SnowstarMap = { html, mount };
})();
