// The "Try it" coach on the sale page (desktop): shows what to do with the demo instead of
// saying it. It follows the real room (window.__studio, from studio.js):
//   no phone yet      the QR code grows (the studio's invite card, or the page's own code if it
//                     has one), a sweep runs over it; between scans it acts the whole thing out:
//                     a hand holding a phone presses Play on it, then a pointer presses GO LIVE
//   phone in, quiet   the hand presses Play on the phone
//   phone listening   the pointer shows GO LIVE
//   live              tips, one after another: solo VOX here (it lands on the phone: the studio
//                     sets the phone's own mix), mute the click on the phone, click the timeline
//                     to jump, pull a fader on the phone, the desk view (once)
// Nothing here changes the session: it only draws. Paused while the section is off screen,
// and still (one picture per step, no motion) for people who ask their system for less motion.
// 2026-10-10: redrawn for the new studio (the control page) and the new phone page (dark, the
// fader-meters). BUILT into apps/demo/coach.js by site/snowstar/demo/build-demo.mjs (as it is).
(function () {
  'use strict';
  const box = document.getElementById('demoDaw');
  if (!box || !window.matchMedia) return;
  const daw = box.closest('.demo-daw') || box.parentElement;
  const sec = document.getElementById('demo') || box.closest('section') || daw;
  const steps = document.getElementById('demoSteps');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (getComputedStyle(daw).position === 'static') daw.style.position = 'relative';

  const css = document.createElement('style');
  css.textContent = `
  .demo-qr{transition:transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s;transform-origin:left center}
  .demo-qr.co-big{transform:scale(1.13);box-shadow:0 18px 40px -18px rgba(23,20,13,.45)}
  .demo-qr p b{transition:background .3s,box-shadow .3s}
  .co-big p b{background:#c8f23a;box-shadow:0 0 0 4px #c8f23a;border-radius:3px}
  .stu .inv.co-big{transform:scale(1.05)}
  .co-big .qrbox,.co-big .qtile{animation:coPulse 1.7s ease-out infinite}
  @keyframes coPulse{0%{box-shadow:0 0 0 0 rgba(200,242,58,.9)}100%{box-shadow:0 0 0 16px rgba(200,242,58,0)}}
  .qrbox{position:relative;overflow:hidden}
  .co-sweep{position:absolute;left:-4%;right:-4%;height:16%;top:0;pointer-events:none;opacity:0;
    background:linear-gradient(180deg,rgba(200,242,58,0),rgba(200,242,58,.55) 55%,rgba(170,214,30,.95) 60%,rgba(200,242,58,0) 62%)}
  .co-big .co-sweep{opacity:1;animation:coSweep 1.9s ease-in-out infinite}
  @keyframes coSweep{0%{top:-16%}50%{top:100%}100%{top:-16%}}
  /* the numbered steps (#demoSteps): the step the room is at is lit, the ones behind it ticked */
  .demo-steps{list-style:none;counter-reset:s;display:grid;gap:8px;margin:20px 0 4px;max-width:30em}
  .demo-steps li{counter-increment:s;display:flex;align-items:center;gap:12px;font-size:15px;color:var(--muted);transition:color .3s}
  .demo-steps li::before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
    border:1.5px solid var(--line-2);font:600 12px/1 Inter,sans-serif;color:var(--muted);transition:background .3s,border-color .3s,color .3s}
  .demo-steps li b{color:var(--ink-2);font-weight:600}
  .demo-steps li.on{color:var(--ink)}
  .demo-steps li.on::before{background:var(--lime);border-color:var(--lime);color:var(--lime-ink)}
  .demo-steps li.done::before{content:"✓";background:var(--ink);border-color:var(--ink);color:var(--paper)}
  .co-pov{position:absolute;left:-78px;bottom:-84px;width:168px;z-index:25;pointer-events:none;opacity:0;
    transform:translateY(40px) rotate(-8deg) scale(.92);transform-origin:50% 100%;transition:opacity .45s,transform .55s cubic-bezier(.2,.9,.25,1.15);
    filter:drop-shadow(0 22px 26px rgba(23,20,13,.35))}
  .co-pov.show{opacity:1;transform:rotate(-6deg)}
  .co-pov svg{display:block;width:100%;height:auto;overflow:visible}
  .co-pov .sk{fill:#e2a47f;stroke:#a96c4f;stroke-width:1.6}
  .co-pov .nail{fill:#f2c8ad}
  .co-pov .t{font-family:Inter,system-ui,sans-serif;fill:#f3eddc}
  .co-pov .dim{fill:#a39d8a}
  .co-pov .disc{fill:#f3eddc;transition:fill .25s}
  .co-pov.on .disc{fill:#c8f23a}
  .co-pov .tri{fill:#12110e;transition:opacity .2s}.co-pov.on .tri{opacity:0}
  .co-pov .sq{fill:#1d2a00;opacity:0;transition:opacity .2s}.co-pov.on .sq{opacity:1}
  .co-pov .st2{opacity:0}.co-pov.on .st1{opacity:0}.co-pov.on .st2{opacity:1}
  .co-pov .btn{fill:none;stroke:#5b574a;stroke-width:1.1;transition:fill .2s,stroke .2s}
  .co-pov .bl{font:600 7px Inter,sans-serif;fill:#f3eddc;text-anchor:middle}
  .co-pov.solo .s-vox{fill:#c8f23a;stroke:#c8f23a}.co-pov.solo .s-vox+.bl{fill:#1d2a00}
  .co-pov.solo .r-bass,.co-pov.solo .r-click,.co-pov.solo .r-groove{opacity:.38}
  .co-pov.mute .m-click{fill:#ff5c8a;stroke:#ff5c8a}.co-pov.mute .m-click+.bl{fill:#1a0610}
  .co-pov.mute .r-click{opacity:.38}
  .co-pov .row{transition:opacity .3s}
  .co-pov .knob{transition:transform .6s cubic-bezier(.3,.7,.3,1)}
  .co-pov .lit{transition:transform .6s cubic-bezier(.3,.7,.3,1);transform-box:fill-box;transform-origin:left center}
  .co-pov.fade .k-bass{transform:translateX(-40px)}
  .co-pov.fade .l-bass{transform:scaleX(.55)}
  /* the thumb turns on its root and reaches: --a the angle from straight up, --d how far
     (the pad's centre from the root at (46, 334)), per target on the screen */
  .co-th{transform:translate(46px,334px) rotate(var(--a));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-th .shaft{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(calc(var(--d) / 100));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-th .tipg{transform:translateY(calc(var(--d) * -1px));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-pov{--a:35.8deg;--d:89}
  .co-pov.th-play{--a:10.95deg;--d:221}
  .co-pov.th-solo{--a:35.6deg;--d:178}
  .co-pov.th-mute{--a:58.2deg;--d:146}
  .co-pov.th-fade{--a:47.6deg;--d:141}
  .co-pov.th-fade.fade{--a:34.0deg;--d:115}
  .co-tap{fill:none;stroke:#c8f23a;stroke-width:3;opacity:0;transform-box:fill-box;transform-origin:center}
  .co-tap.go{animation:coTap .6s ease-out}
  @keyframes coTap{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(2.2)}}
  .co-cur{position:absolute;left:0;top:0;width:24px;height:24px;z-index:26;pointer-events:none;opacity:0;
    transition:transform .7s cubic-bezier(.3,.7,.25,1),opacity .3s;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}
  .co-cur.show{opacity:1}
  .co-cur svg{width:24px;height:24px;display:block}
  .co-cur::after{content:"";position:absolute;left:-12px;top:-12px;width:26px;height:26px;border-radius:50%;border:3px solid #c8f23a;opacity:0}
  .co-cur.click::after{animation:coClick .55s ease-out}
  @keyframes coClick{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
  .co-ghost{position:absolute;top:0;width:2px;background:#c8f23a;box-shadow:0 0 8px #c8f23a;opacity:0;pointer-events:none;z-index:24;transition:opacity .3s}
  .co-tip{position:absolute;z-index:27;background:#17140d;color:#efe9da;font:600 13px/1.25 Inter,system-ui,sans-serif;padding:9px 13px 9px 11px;border-radius:12px;
    max-width:230px;opacity:0;transform:translateY(6px);transition:opacity .35s,transform .35s;pointer-events:none;display:flex;gap:8px;align-items:flex-start;box-shadow:0 10px 24px -12px rgba(0,0,0,.6)}
  .co-tip::before{content:"";flex:none;width:8px;height:8px;margin-top:4px;border-radius:50%;background:#c8f23a}
  .co-tip.show{opacity:1;transform:none}
  .co-paused *, .co-paused{animation-play-state:paused!important}`;
  document.head.appendChild(css);

  // ---------- the QR code to point at: the page's own (old sale page), else the studio's card ----------
  function qrTarget() {
    const card = document.querySelector('.demo-qr'), q = document.getElementById('demoQr');
    if (card && q && q.offsetParent) return { card, tile: q, line: card.querySelector('p b'), page: true };
    const S = window.__studio, inv = S && S.el('invite'), tile = S && S.el('qr');
    return inv && tile ? { card: inv, tile, line: null, page: false } : null;
  }
  let bigOn = null, lineWas = '';
  function big(on) {
    const q = on ? qrTarget() : bigOn;
    if (!q) { bigOn = null; return; }
    if (on && !q.tile.querySelector('.co-sweep')) { const sw = document.createElement('div'); sw.className = 'co-sweep'; q.tile.appendChild(sw); }
    q.card.classList.toggle('co-big', on);
    if (q.line) { if (on) { lineWas = lineWas || q.line.textContent; q.line.textContent = 'Point your phone camera here'; } else if (lineWas) q.line.textContent = lineWas; }
    bigOn = on ? q : null;
    if (on && !q.page) { const r = at(q.card); say('Point your phone camera here', Math.max(8, r.x - 244), r.y + r.h * 0.42); }
  }

  // ---------- the phone in a hand: today's phone page, small ----------
  const ROWS = [['vox', 'VOX', 182], ['bass', 'BASS', 216], ['click', 'CLICK', 250], ['groove', 'GROOVE', 284]];
  const meter = (k, y) => {          // a fader-meter: green, then amber segments, lit up to `w`
    let s = '<g class="lit l-' + k + '">';
    for (let i = 0; i < 17; i++) s += '<rect x="' + (66 + i * 5) + '" y="' + (y + 21) + '" width="3.6" height="4" rx=".6" fill="' + (i < 11 ? '#44d36e' : '#f4c430') + '"/>';
    return s + '</g>';
  };
  const pov = document.createElement('div'); pov.className = 'co-pov'; pov.setAttribute('aria-hidden', 'true');
  pov.innerHTML = '<svg viewBox="0 0 240 380"><defs><clipPath id="coScr"><rect x="54" y="28" width="134" height="282" rx="17"/></clipPath>'
    + '<linearGradient id="coAmp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2925"/><stop offset=".55" stop-color="#151410"/><stop offset="1" stop-color="#0b0a08"/></linearGradient>'
    + '<linearGradient id="coVu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e2a6"/><stop offset="1" stop-color="#d9b866"/></linearGradient></defs>'
    // the hand behind the phone: the palm, and four fingers round its right edge
    + '<path class="sk" d="M6 386C4 334 28 300 70 296L196 284C224 282 236 314 230 346L224 386Z"/>'
    + [[166, 126], [172, 162], [170, 198], [164, 234]].map(([x, y]) => '<rect class="sk" x="' + x + '" y="' + y + '" width="48" height="31" rx="15.5"/>').join('')
    + '<rect x="46" y="18" width="150" height="302" rx="26" fill="#0a0907"/>'
    + '<g clip-path="url(#coScr)"><rect x="54" y="28" width="134" height="282" fill="#1b1a16"/>'
    + '<text class="t" x="64" y="47" style="font-weight:800;font-size:8px;letter-spacing:1.4px">STREAMDAW</text>'
    + '<text class="t dim" x="64" y="62" style="font-weight:600;font-size:5.5px;letter-spacing:1.2px">SESSION</text>'
    + '<text class="t" x="64" y="80" style="font:600 16px Fraunces,Georgia,serif">mama</text>'
    + '<rect x="62" y="90" width="118" height="70" rx="10" fill="url(#coAmp)" stroke="#000"/>'
    + '<circle class="disc" cx="88" cy="117" r="15"/><path class="tri" d="M84 110L95 117L84 124Z"/><rect class="sq" x="83" y="112" width="10" height="10" rx="1.5"/>'
    + '<text class="t st1" x="110" y="115" style="font:600 10px Fraunces,Georgia,serif">Ready</text>'
    + '<text class="t st2" x="110" y="115" style="font:600 10px Fraunces,Georgia,serif">Live</text>'
    + '<text class="t dim" x="110" y="126" style="font-size:6px">in time</text>'
    + '<rect x="68" y="137" width="50" height="18" rx="3" fill="url(#coVu)" stroke="#000"/><rect x="124" y="137" width="50" height="18" rx="3" fill="url(#coVu)" stroke="#000"/>'
    + '<path d="M78 152L88 142M134 152L146 141" stroke="#141210" stroke-width="1"/>'
    + '<text class="t dim" x="64" y="173" style="font-weight:600;font-size:5.5px;letter-spacing:1.2px">MIXER · TRACK MIXER</text>'
    + ROWS.map(([k, n, y]) => '<g class="row r-' + k + '"><text class="t" x="66" y="' + (y + 10) + '" style="font-weight:600;font-size:8px">' + n + '</text>'
      + '<circle class="btn s-' + k + '" cx="150" cy="' + (y + 7) + '" r="7"/><text class="bl" x="150" y="' + (y + 9.5) + '">S</text>'
      + '<circle class="btn m-' + k + '" cx="170" cy="' + (y + 7) + '" r="7"/><text class="bl" x="170" y="' + (y + 9.5) + '">M</text>'
      + '<rect x="64" y="' + (y + 19) + '" width="96" height="8" rx="4" fill="#0c0b09"/>' + meter(k, y)
      + '<circle class="knob k-' + k + '" cx="150" cy="' + (y + 23) + '" r="5" fill="#f3eddc"/>'
      + '<circle cx="174" cy="' + (y + 23) + '" r="4.5" fill="#15140f" stroke="#c8f23a" stroke-width="1"/></g>').join('')
    + '<circle class="co-tap" cx="88" cy="117" r="9"/></g>'
    // the thumb, in front: from the bottom left, its pad at (105, 247) when at rest
    + '<g class="co-th"><rect class="sk shaft" x="-19" y="-100" width="38" height="100" vector-effect="non-scaling-stroke"/>'
    + '<g class="tipg"><circle class="sk" r="19"/><rect x="-17.2" y="0" width="34.4" height="30" fill="#e2a47f"/><ellipse class="nail" cx="0" cy="-4" rx="10.5" ry="13"/></g></g>'
    // the root of the thumb, in front of it, so it grows out of the hand
    + '<path class="sk" d="M-6 386C-8 352 6 318 40 312C70 308 88 330 86 356L84 386Z"/></svg>';
  daw.appendChild(pov);
  const tap = pov.querySelector('.co-tap');

  const cur = document.createElement('div'); cur.className = 'co-cur';
  cur.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2v17.5l4.8-4.6 3.4 7.3 3.2-1.5-3.3-7h6.6Z" fill="#fff" stroke="#17140d" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  daw.appendChild(cur);
  const ghost = document.createElement('div'); ghost.className = 'co-ghost'; daw.appendChild(ghost);
  const tip = document.createElement('div'); tip.className = 'co-tip'; daw.appendChild(tip);

  // ---------- helpers ----------
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };
  const at = (el) => { const r = el.getBoundingClientRect(), d = daw.getBoundingClientRect(); return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height }; };
  const S = () => window.__studio;
  const el = (n) => (S() ? S().el(n) : null);
  function pointer(x, y, show) { cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; cur.classList.toggle('show', show !== false); }
  function click() { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); }
  function say(text, x, y) {
    if (!text) { tip.classList.remove('show'); return; }
    tip.textContent = text; tip.classList.add('show');
    tip.style.left = Math.max(4, Math.min(x, daw.clientWidth - tip.offsetWidth - 4)) + 'px'; tip.style.top = y + 'px';
  }
  function sayAtPov() { const a = [...arguments]; say(a[0], 100, daw.clientHeight + 6); }
  const POV_STATES = ['on', 'solo', 'mute', 'fade', 'th-play', 'th-solo', 'th-mute', 'th-fade'];
  function povSet(show, ...cls) {
    if (show) { const r = daw.getBoundingClientRect(); pov.style.left = Math.max(-78, 6 - r.left) + 'px'; }
    pov.classList.toggle('show', !!show); POV_STATES.forEach((c) => pov.classList.toggle(c, cls.includes(c)));
  }
  function press(cx, cy) { tap.setAttribute('cx', cx); tap.setAttribute('cy', cy); tap.classList.remove('go'); void tap.getBBox(); tap.classList.add('go'); }
  function stepOn(s) {
    if (!steps) return;
    const order = ['scan', 'phone', 'play', 'tips'], i = order.indexOf(s);
    steps.querySelectorAll('li').forEach((li) => { const j = order.indexOf(li.dataset.s); li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
  }
  function toLive() { const b = el('live'); if (!b) return null; const r = at(b); pointer(r.x + r.w * 0.5, r.y + r.h * 0.6); return r; }
  function sayLive(text) { const r = el('live') && at(el('live')); if (r) say(text, r.x + r.w - 236, r.y + r.h + 12); }
  function rest() { pointer(daw.clientWidth * 0.62, daw.clientHeight * 0.55, false); ghost.style.opacity = 0; }

  // ---------- what the room is doing ----------
  function room() {
    const s = S(); if (!s) return 'scan';
    const ph = s.phones || [];
    if (!ph.length) return 'scan';
    if (!ph.some((p) => p.listening)) return 'phone';
    return s.tr && s.tr.playing ? 'tips' : 'play';
  }

  let mode = null, tipN = 0, jumped = false, deskSeen = false;
  function enter(m) {
    mode = m; clearAll(); stepOn(m);
    big(false); say(''); rest(); povSet(false);
    if (still) {            // no motion: the step list says it, plus one still picture of the step
      if (m === 'scan') big(true);
      else if (m === 'phone') { povSet(true, 'th-play'); sayAtPov('Press Play on your phone'); }
      else if (m === 'play') { povSet(true, 'on'); toLive(); sayLive('Now GO LIVE: your phone plays along'); }
      else { povSet(true, 'on', 'solo'); sayAtPov('Solo, mute, pull a fader: here or on your phone'); }
      return;
    }
    if (m === 'scan') attract();
    else if (m === 'phone') pressPhone();
    else if (m === 'play') pointLive();
    else tips();
  }

  // No phone yet: grow the code, then act the whole thing out, and again.
  function attract() {
    big(true);
    later(4200, () => {
      big(false); say('');
      povSet(true); sayAtPov('Then press Play on your phone…');
      later(900, () => povSet(true, 'th-play'));
      later(1500, () => { press(88, 117); povSet(true, 'th-play', 'on'); });
      later(2300, () => povSet(true, 'on'));
      later(2700, () => { toLive(); sayLive('…and GO LIVE here: your phone plays along'); });
      later(3700, click);
      later(5400, () => { povSet(false); say(''); rest(); });
      later(6200, attract);
    });
  }
  // A phone is in but quiet: show the press on the phone.
  function pressPhone() {
    povSet(true); sayAtPov('Press Play on your phone');
    const loop = () => {
      povSet(true, 'th-play');
      later(600, () => { press(88, 117); povSet(true, 'th-play', 'on'); });
      later(1300, () => povSet(true));
      later(2600, loop);
    };
    later(500, loop);
  }
  // The phone is listening: GO LIVE.
  function pointLive() {
    povSet(true, 'on');
    toLive(); sayLive('Now GO LIVE: your phone plays along');
    const loop = () => { toLive(); later(700, click); later(2200, loop); };
    later(400, loop);
  }
  // Live: one tip after another.
  function tips() {
    const list = [
      () => {   // the studio sets the phone's own mix (when the room carries mixes)
        const s = S(), b = s && s.target !== 'main' && s.section === 'stream' ? el('s:vox') : null;
        if (!b || b.disabled) {
          povSet(true, 'on', 'th-solo'); sayAtPov('Solo the vocal on your phone');
          later(650, () => { press(150, 189); povSet(true, 'on', 'th-solo', 'solo'); }); later(2600, () => povSet(true, 'on', 'solo'));
          return;
        }
        povSet(true, 'on'); const r = at(b);
        pointer(r.x + r.w * 0.5, r.y + r.h * 0.6); say('Solo VOX here: it lands on your phone', r.x - 250, r.y - 8);
        later(900, () => { click(); povSet(true, 'on', 'solo'); });
      },
      () => { povSet(true, 'on', 'th-mute'); sayAtPov('Mute the click on your phone: it shows here too'); later(650, () => { press(170, 257); povSet(true, 'on', 'th-mute', 'mute'); }); later(2600, () => povSet(true, 'on', 'mute')); },
      () => {
        if (jumped) return false;
        povSet(true, 'on'); const l = at(el('lanes'));
        pointer(l.x + l.w * 0.25, l.y + l.h * 0.5); say('Click the timeline to jump: every phone follows', l.x + l.w * 0.25 - 40, l.y + l.h + 10);
        ghost.style.height = l.h + 'px'; ghost.style.top = l.y + 'px';
        later(800, () => { click(); ghost.style.left = (l.x + l.w * 0.25) + 'px'; ghost.style.opacity = 1; });
        later(1500, () => { pointer(l.x + l.w * 0.6, l.y + l.h * 0.5); });
        later(2300, () => { click(); ghost.style.transition = 'left .5s, opacity .3s'; ghost.style.left = (l.x + l.w * 0.6) + 'px'; });
        later(3300, () => { ghost.style.opacity = 0; ghost.style.transition = ''; rest(); });
      },
      () => { povSet(true, 'on', 'th-fade'); sayAtPov('Pull a fader: nobody else hears your mix'); later(700, () => povSet(true, 'on', 'th-fade', 'fade')); later(2600, () => povSet(true, 'on', 'fade')); },
      () => {
        const s = S(), v = el('view');
        if (deskSeen || !s || s.view === 'mixer' || !v) return false;
        povSet(false); const r = at(v.querySelector('[data-v="mixer"]') || v);
        pointer(r.x + r.w * 0.5, r.y + r.h * 0.6); say('Mixer: the same, as a desk', r.x - 120, r.y - 46);
        later(900, click);
      },
    ];
    const next = () => {
      say(''); rest();
      let r = list[tipN++ % list.length](), k = 0;
      while (r === false && k++ < list.length) r = list[tipN++ % list.length]();
      later(3800, next);
    };
    next();
  }

  // What the visitor did by themselves is learnt.
  daw.addEventListener('click', (e) => {
    if (e.target.closest('.sx-lanes')) jumped = true;
    if (e.target.closest('[data-a="view"]')) deskSeen = true;
  });

  // ---------- run while on screen ----------
  let running = false, poll = 0;
  function tick() {
    const m = room(); if (m !== mode) { enter(m); return; }
    if (bigOn && !bigOn.card.isConnected) big(true);   // the studio drew its column again: the new card grows too
  }
  function run(on) {
    if (on && !daw.offsetParent) on = false;       // the studio is not shown (a phone visiting the sale page)
    if (on === running) return; running = on;
    sec.classList.toggle('co-paused', !on);
    if (on) { mode = null; tick(); poll = setInterval(tick, 400); }
    else { clearInterval(poll); clearAll(); }
  }
  new IntersectionObserver((es) => run(es.some((e) => e.isIntersecting)), { threshold: 0.25 }).observe(sec);
})();
