// The scene the films show, injected into the app's own page (SNOWSTAR-ENHANCE app/ui/index.html) and driven by
// real data: the engine's own channel list, waveforms, timings and meter levels (film/<id>-film.json).
// Nothing here is edited into the app: the page is loaded as it ships and spoken to through its own event bus.
(FILM) => {
  const stripOf = (n) => strips.find((s) => s.ch.name === n);
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  // a key is small: the arrow's tip touches its lower-left corner so the lit key stays in sight
  const touch = (el) => { const r = el.getBoundingClientRect(); return [r.left + 5, r.bottom - 4]; };
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const lerp = (a, b, u) => a + (b - a) * u;
  const kindOf = (n) => (n === 'Voice' ? 'voice' : n === 'Background' ? 'background' : 'part');

  // ---- the pointer, the dragged file, the click
  const mk = (css) => { const d = document.createElement('div'); d.style.cssText = css; document.body.appendChild(d); return d; };
  const ptr = mk('position:fixed;width:23px;height:31px;z-index:60;pointer-events:none;opacity:0;transition:opacity .25s;'
    + 'background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 22 30%27%3E%3Cpath d=%27M2 2v22l6-6 4 10 4-2-4-9h8z%27 fill=%27%23fff%27 stroke=%27%23000%27 stroke-width=%271.6%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") 0 0/23px 31px no-repeat;'
    + 'filter:drop-shadow(0 2px 6px rgba(0,0,0,.55))');
  const ring = mk('position:fixed;z-index:59;pointer-events:none;border:2px solid #c8f23a;border-radius:50%;opacity:0;width:14px;height:14px;margin:-7px 0 0 -7px');
  const card = mk('position:fixed;z-index:58;pointer-events:none;opacity:0;transform:rotate(-3deg);display:flex;align-items:center;gap:9px;'
    + 'padding:9px 13px 9px 11px;border-radius:10px;background:rgba(16,18,16,.93);border:1px solid rgba(200,242,58,.55);'
    + 'box-shadow:0 14px 34px rgba(0,0,0,.55);font:600 13px/1 ui-sans-serif,-apple-system,Inter,sans-serif;color:#eef3e2;white-space:nowrap');
  const glyph = FILM.cardIcon === 'film'
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c8f23a" stroke-width="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M7 4.5v15M17 4.5v15M2.5 9.5h4.5M2.5 14.5h4.5M17 9.5h4.5M17 14.5h4.5"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c8f23a" stroke-width="2" stroke-linecap="round"><path d="M3 12h2l2.5-7 3 14 3-11 2.5 6h5"/></svg>';
  card.innerHTML = glyph + '<span>' + FILM.display + '</span>';
  const at = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  let px = 0, py = 0;
  const point = (x, y) => { px = x; py = y; at(ptr, x - 3, y - 2); ptr.style.opacity = 1; };
  let ringAt = -9;
  const click = (t) => { ringAt = t; at(ring, px, py); };

  // ---- the file, as the engine described it
  const channels = () => FILM.channels.map((n) => ({
    name: n, kind: kindOf(n), stereo: true, eq: n !== 'Background', gainDb: FILM.gains[n] || 0,
    on: true, mono: false, solo: false, loHz: 20, hiHz: 20000, amount: 1, minor: FILM.hidden.includes(n),
  }));
  let chans = channels();
  const fileRow = (state, step, progress, eta) => [{ id: 1, name: FILM.display, seconds: FILM.seconds, state, step, progress, eta, checked: true, selected: true }];

  fire('files', []); fire('selected', {});            // the lab as it opens: nothing in it
  const W = innerWidth, H = innerHeight;
  const dropAt = [W * 0.46, H * 0.44];
  at(card, dropAt[0] - 60, dropAt[1] - 14);

  const steps = FILM.steps.map(([name, a, b]) => ({ name, a, b }));
  const span = FILM.ready - FILM.drop;
  let dropped = false, ready = false, lastStatus = -9, soloNow = null, abAfter = true, origin = null, originFor = null;
  const done = {};

  // the fader ramps, exactly as the sound was built
  const gainAt = (name, t) => {
    let db = FILM.gains[name] || 0;
    for (const ev of FILM.automation) {
      if (!ev.ramp || !(name in ev.ramp)) continue;
      const t0 = ev.rampFrom, t1 = ev.t, target = ev.ramp[name];
      if (t >= t1) db = target;
      else if (t > t0) db = lerp(db, target, ease((t - t0) / Math.max(1e-6, t1 - t0)));
    }
    return Math.round(db * 10) / 10;
  };
  const ramping = (t) => FILM.automation.find((ev) => ev.ramp && t >= ev.rampFrom - 1e-6 && t <= ev.t + 0.12);

  const targetOf = (target) => {
    const [what, who] = target.split(':');
    if (what === 'ab') return touch(document.getElementById(who === 'after' ? 'after' : 'before'));
    const st = stripOf(who);
    if (!st) return [px, py];
    if (what === 'solo') return touch(st.kS);
    const r = st.el.getBoundingClientRect(), l = st.liq.getBoundingClientRect();
    return [r.left + r.width / 2 + 7, l.top];                       // the liquid's surface, where a hand would hold it
  };

  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;

    // --- the file comes in
    if (!dropped) {
      const u = ease((t - 0.1) / (FILM.drop - 0.25));
      const x = lerp(W * 0.1, dropAt[0], u), y = lerp(H * 1.02, dropAt[1], u);
      point(x, y); at(card, x - 54, y - 10); card.style.opacity = t > 0.12 ? 1 : 0;
      if (t > 0.34) fire('dragging', true);
      if (t >= FILM.drop) {
        dropped = true; fire('dragging', false); card.style.opacity = 0; ptr.style.opacity = 0;
        fire('files', fileRow('working', 'decode', 0, -1));
        fire('selected', { id: 1, name: FILM.display, seconds: FILM.seconds, state: 'working', mode: FILM.mode,
          bandwidthHz: FILM.bandwidthHz, parts: FILM.parts, peaksBefore: FILM.peaksBefore, steps: FILM.stepFlags, channels: [] });
        click(t);
      }
    } else if (!ready) {
      // --- the chain, its own steps, in its own order, faster than life
      const p = Math.min(0.995, (t - FILM.drop) / span);
      const s = steps.find((x) => t < x.b) || steps[steps.length - 1];
      if (t - lastStatus > 0.05) {
        lastStatus = t;
        fire('status', { id: 1, step: s.name, fraction: p, eta: t > FILM.drop + 0.25 ? (1 - p) * FILM.took : -1 });
        fire('files', fileRow('working', s.name, p, (1 - p) * FILM.took));
      }
      if (t >= FILM.ready) {
        ready = true;
        fire('files', fileRow('ready', '', 1, 0));
        fire('selected', { id: 1, name: FILM.display, seconds: FILM.seconds, state: 'ready', mode: FILM.mode,
          bandwidthHz: FILM.bandwidthHz, parts: FILM.parts, peaksBefore: FILM.peaksBefore, steps: FILM.stepFlags, channels: chans });
        fire('status', { id: 1, step: 'done', fraction: 1, took: FILM.took });
        after = FILM.peaksAfter; playing = true; draw();
      }
    } else {
      // --- it plays: the meters and the playhead are the sound you hear
      const i = Math.floor((t - FILM.ready) / FILM.frame);
      const lv = FILM.levels[Math.min(i, FILM.levels.length - 1)] || [];
      fire('position', { seconds: FILM.playFrom + (t - FILM.ready), playing: true, levels: lv });

      for (const ev of FILM.automation) {                           // the switches, at their moment
        if (t < ev.t || done[FILM.automation.indexOf(ev)]) continue;
        done[FILM.automation.indexOf(ev)] = true;
        if ('solo' in ev) {
          soloNow = ev.solo;
          strips.forEach((st) => { st.ch.solo = st.ch.name === soloNow; paintStrip(st); });
          click(t);
        }
        if ('ab' in ev) { abAfter = ev.ab === 'after'; setAB(abAfter); click(t); }
      }

      const r = ramping(t);                                          // the hand on a fader
      strips.forEach((st) => {
        const db = gainAt(st.ch.name, t);
        if (Math.abs(db - st.ch.gainDb) > 0.049) { st.ch.gainDb = db; paintStrip(st); }
        const held = !!r && r.ramp[st.ch.name] !== undefined;
        st.el.classList.toggle('drag', held && t <= r.t);
      });

      // --- the pointer: to the next control, then it waits there
      const nx = FILM.automation.find((ev) => ev.move && t >= ev.move.from && t < ev.t);
      if (nx) {
        if (originFor !== nx.move.target + nx.t) { originFor = nx.move.target + nx.t; origin = [px, py]; }
        const g = targetOf(nx.move.target);
        const u = ease((t - nx.move.from) / Math.max(1e-6, nx.t - nx.move.from));
        point(lerp(origin[0], g[0], u), lerp(origin[1], g[1], u));
      } else if (r && t >= r.rampFrom) {
        const g = targetOf('fader:' + Object.keys(r.ramp)[0]);
        point(g[0], g[1]);                                           // riding the liquid up or down
      }
      if (t > FILM.duration - 0.55) ptr.style.opacity = 0;
    }

    const age = t - ringAt;                                          // the click, a ring that opens and goes
    if (age >= 0 && age < 0.45) { const u = age / 0.45; ring.style.opacity = (1 - u) * 0.9; ring.style.transform = 'scale(' + (1 + u * 2.6) + ')'; }
    else ring.style.opacity = 0;

    if (t < FILM.duration + 0.2) requestAnimationFrame(tick);
    else window.__acDone = true;
  };
  requestAnimationFrame(tick);
  return { id: FILM.id, duration: FILM.duration, epoch: Date.now() / 1000 };   // the film's own zero, to line the sound up with
}
