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
 * No library: cubes are eight points turned and projected onto a 2D canvas, drawn far to
 * near. That is all this picture needs, and the dashboard stays without a dependency.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const stateOf = (c) => (/^done/.test(c) ? 'done' : /^todo/.test(c) ? 'todo' : /^n\/a/.test(c) ? 'na' : 'ask');
  const noteOf = (c) => String(c || '').replace(/^(done|todo|n\/a|\?)\s*/, '');
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const LIME = [200, 242, 58], PINK = [255, 92, 138], BONE = [243, 237, 220], BLUE = [110, 200, 255], GOLD = [255, 200, 87];
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
    return CSS + `<div class="sm" id="sm-root"><canvas></canvas><div class="sm-tip"></div><div class="sm-panel"></div>
      <div class="sm-key"><span><i style="background:#c8f23a"></i>there</span><span><i style="background:#ff5c8a"></i>missing</span>
      <span><i style="border:2px solid #ff5c8a"></i>not checked</span><span><i style="border:2px solid rgba(243,237,220,.7)"></i>empty seat</span>
      <span>drag to turn · scroll to zoom · click a cube</span></div></div>`;
  }

  /* ── the scene: a flat list of cubes and pipes in world units ─────────────── */
  function build(v) {
    const cubes = [], pipes = [], m = v.map || {};
    const parts = Object.fromEntries((m.parts || []).map((p) => [p.id, p]));
    const add = (c) => { cubes.push(c); return c; };
    const pipe = (a, b, col, w) => pipes.push({ a, b, col: col || BONE, w: w || 1 });
    const col = (st) => (st === 'done' ? LIME : PINK);

    /* platforms, in a row */
    const plats = (v.packages || []).map((p, i, all) => {
      const key = PKEY[String(p.platform).toLowerCase()] || String(p.platform).toLowerCase();
      const live = stateOf(p.site) === 'done' ? noteOf(p.site).split(/\s/)[0] : '';
      const open = (live && live !== p.built) || ['todo', 'ask'].includes(stateOf(p.site)) || ['todo', 'ask'].includes(stateOf(p.store));
      return add({ kind: 'platform', key, name: PNAME[key] || p.platform, sub: p.built, x: (i - (all.length - 1) / 2) * 4.2, y: 0, z: 0, s: 1.7,
        c: open ? PINK : LIME, label: true, data: p });
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
          c: col(st), wire: st === 'ask', data: { step: s, platform: p.key, cell: s.cell(p.key) } });
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
      const cube = chanCube[ch.name.toLowerCase()] = add({ kind: 'money', key: 'money:' + ch.name, name: ch.name, x: (i - (chans.length - 1) / 2) * 5.2, y: -0.2, z: -4.6, s: 1.3,
        c: live ? GOLD : PINK, wire: !live && ask, label: true, data: ch });
      const sells = new Set(ch.rows.flatMap((r) => list(r.sells)));
      for (const k of sells) if (byKey[k]) pipe(cube, byKey[k], cube.c, 1.6);
      ch.rows.forEach((r, j) => {
        const st = stateOf(r.status);
        const pc = add({ kind: 'plan', key: 'plan:' + ch.name + r.plan, name: r.plan + (r.price ? ' ' + r.price : ''), x: cube.x + (j - (ch.rows.length - 1) / 2) * 1.2, y: -0.55, z: -6.4, s: 0.6,
          c: st === 'done' ? GOLD : PINK, wire: st === 'ask', data: { plan: r, channel: ch.name } });
        pipe(pc, cube, pc.c, 1);
      });
    });

    /* teams, above: a wire cube is a seat nobody but Ori fills */
    (m.teams || []).forEach((t, i, all) => {
      const open = /^open$/i.test(t.seat);
      const cube = add({ kind: 'team', key: 'team:' + t.team, name: t.team, x: (i - (all.length - 1) / 2) * 3.1, y: 5.2, z: 7, s: 1.15,
        c: BONE, wire: open, label: true, data: t });
      for (const k of list(t.touches)) {
        const to = byKey[k] || chanCube[k.toLowerCase()];
        if (to) pipe(cube, to, BONE, 0.6);
      }
    });
    return { cubes, pipes, parts, steps };
  }

  /* ── the panel: what the clicked cube is, as chips and dots ───────────────── */
  function panelHtml(c, S, v) {
    const x = '<button class="sm-x" aria-label="Close">×</button>';
    if (c.kind === 'step') {
      const s = c.data.step;
      const plats = ['mac', 'win', 'ios', 'android'].map((k) => {
        const st = stateOf(s.cell(k));
        return `<span class="${st}" title="${esc(WORD[st] + (noteOf(s.cell(k)) ? '. ' + noteOf(s.cell(k)) : ''))}">${PNAME[k]}</span>`;
      }).join('');
      const flow = s.from.map((id) => S.parts[id] || { id, name: id, kind: 'own', licence: '?', risk: '?' }).map((p) =>
        `<div class="sm-part" title="${esc(p.note || '')}"><b style="background:${rgb(KIND[p.kind] || BONE, 1)}"></b>${esc(p.name)}<em>${esc(p.licence || '')}</em>
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
      return `${x}<h3>${esc(c.name)}</h3><p class="sm-sub">newest build ${esc(p.built)}</p>${row('On the site', p.site)}${row('In the store', p.store)}
        <div class="sm-row">Steps and features there<em>${n('done')}</em></div><div class="sm-row">Missing<em>${n('todo')}</em></div><div class="sm-row">Not checked<em>${n('ask')}</em></div>
        ${p.note ? `<p class="sm-note">${esc(p.note)}</p>` : ''}`;
    }
    if (c.kind === 'money' || c.kind === 'plan') {
      const ch = c.kind === 'money' ? c.data : { name: c.data.channel, rows: [c.data.plan] };
      return `${x}<h3>${esc(ch.name)}</h3><p class="sm-sub">money in, by plan</p>${ch.rows.map((r) =>
        `<div class="sm-row" title="${esc(r.note || '')}">${esc(r.plan)}<em>${esc(r.price || '')} · ${stateOf(r.status) === 'done' ? 'on sale' : WORD[stateOf(r.status)]}</em></div>`).join('')}
        ${ch.rows.map((r) => r.note ? `<p class="sm-note">${esc(r.plan)}: ${esc(r.note)}</p>` : '').join('')}`;
    }
    const t = c.data, open = /^open$/i.test(t.seat);
    const pages = (v.pages || []).filter((r) => /^(todo|\?)/.test(r.status)).length, videos = (v.videos || []).filter((r) => /^(todo|\?)/.test(r.status)).length;
    return `${x}<h3>${esc(t.team)}</h3><p class="sm-sub">${open ? 'empty seat: Ori does it today' : esc(t.seat)}</p>
      <div class="sm-row">Touches<em>${esc(list(t.touches).map((k) => PNAME[k] || k).join(', '))}</em></div>
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
    const CENTER = [0, 1.6, 6.5];
    const rot = (x, y, z) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp + z1 * sp, -y * sp + z1 * cp];   /* the eye is above: far things rise on the screen */
    };
    const proj = (x, y, z) => {
      const [a, b, c] = rot(x - CENTER[0], y - CENTER[1], z - CENTER[2]);
      const k = (Math.min(W, H * 1.6) / 41) * zoom * (40 / (40 + c));
      return [W / 2 + a * k, H / 2 - b * k, c, k];
    };
    function size() {
      const r = root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawCube(c) {
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
      const items = S.cubes.map((c) => ({ c, z: proj(c.x, c.y, c.z)[2] }))
        .concat(S.pipes.map((p) => ({ p, z: (proj(p.a.x, p.a.y, p.a.z)[2] + proj(p.b.x, p.b.y, p.b.z)[2]) / 2 + 0.01 })));
      items.sort((a, b) => b.z - a.z);
      for (const it of items) {
        if (it.c) { drawCube(it.c); continue; }
        const a = proj(it.p.a.x, it.p.a.y, it.p.a.z), b = proj(it.p.b.x, it.p.b.y, it.p.b.z);
        const lit = sel && (sel === it.p.a || sel === it.p.b);
        ctx.strokeStyle = rgba(it.p.col, lit ? 0.95 : sel ? 0.12 : 0.34); ctx.lineWidth = it.p.w * (lit ? 2.2 : 1) * Math.max(0.6, a[3] / 26); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    const pick = (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null;
      for (const c of S.cubes) if (c.sr && Math.hypot(c.sx - x, c.sy - y) < Math.max(9, c.sr) && (!best || c.depth < best.depth)) best = c;
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
    window.addEventListener('resize', size);
    size(); cancelAnimationFrame(raf); frame();
    return { select: (key) => select(S.cubes.find((c) => c.key === key) || null), scene: S };
  }
  window.SnowstarMap = { html, mount };
})();
