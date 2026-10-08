// The "Try it" coach on the sale page (desktop): shows what to do with the demo instead of
// saying it. It follows the real room (window.__studio, from studio.js):
//   no phone yet      the QR code grows, a sweep runs over it and a bubble says "scan me";
//                     between scans it acts the whole thing out: a hand holding a phone
//                     presses Play on it, then a pointer presses Play on the DAW
//   phone in, quiet   the hand presses Play on the phone
//   phone listening   the pointer shows the DAW's Play button
//   playing           tips, one after another: solo the vocal and mute the click (on the
//                     phone), click the timeline to jump (here), pull a fader (on the phone)
// Nothing here changes the session: it only draws. Paused while the section is off screen,
// and still (no motion) for people who ask their system for less motion.
// BUILT into apps/demo/coach.js by site/snowstar/demo/build-demo.mjs (no changes on the way).
(function () {
  'use strict';
  const sec = document.getElementById('demo'), daw = document.querySelector('.demo-daw'), card = document.querySelector('.demo-qr');
  const qrbox = document.getElementById('demoQr'), steps = document.getElementById('demoSteps');
  if (!sec || !daw || !card || !qrbox || !window.matchMedia) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = document.createElement('style');
  css.textContent = `
  .demo-daw{position:relative}
  .demo-qr{position:relative;transition:transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s;transform-origin:left center}
  .demo-qr.co-big{transform:scale(1.13);box-shadow:0 18px 40px -18px rgba(23,20,13,.45)}
  .demo-qr.co-big .qrbox{animation:coPulse 1.7s ease-out infinite}
  @keyframes coPulse{0%{box-shadow:0 0 0 0 rgba(200,242,58,.9)}100%{box-shadow:0 0 0 18px rgba(200,242,58,0)}}
  .qrbox{position:relative;overflow:hidden}
  .co-sweep{position:absolute;left:-4%;right:-4%;height:16%;top:0;pointer-events:none;opacity:0;
    background:linear-gradient(180deg,rgba(200,242,58,0),rgba(200,242,58,.55) 55%,rgba(170,214,30,.95) 60%,rgba(200,242,58,0) 62%)}
  .co-big .co-sweep{opacity:1;animation:coSweep 1.9s ease-in-out infinite}
  @keyframes coSweep{0%{top:-16%}50%{top:100%}100%{top:-16%}}
  .demo-qr p b{transition:background .3s,box-shadow .3s}
  .co-big p b{background:#c8f23a;box-shadow:0 0 0 4px #c8f23a;border-radius:3px}
  .demo-steps{list-style:none;counter-reset:s;display:grid;gap:8px;margin:20px 0 4px;max-width:30em}
  .demo-steps li{counter-increment:s;display:flex;align-items:center;gap:12px;font-size:15px;color:var(--muted);transition:color .3s}
  .demo-steps li::before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
    border:1.5px solid var(--line-2);font:600 12px/1 Inter,sans-serif;color:var(--muted);transition:background .3s,border-color .3s,color .3s}
  .demo-steps li b{color:var(--ink-2);font-weight:600}
  .demo-steps li.on{color:var(--ink)}
  .demo-steps li.on::before{background:var(--lime);border-color:var(--lime);color:var(--lime-ink)}
  .demo-steps li.done::before{content:"✓";background:var(--ink);border-color:var(--ink);color:var(--paper)}
  .co-pov{position:absolute;left:-78px;bottom:-84px;width:168px;z-index:5;pointer-events:none;opacity:0;
    transform:translateY(40px) rotate(-8deg) scale(.92);transform-origin:50% 100%;transition:opacity .45s,transform .55s cubic-bezier(.2,.9,.25,1.15);
    filter:drop-shadow(0 22px 26px rgba(23,20,13,.35))}
  .co-pov.show{opacity:1;transform:rotate(-6deg)}
  .co-pov svg{display:block;width:100%;height:auto;overflow:visible}
  .co-pov .sk{fill:#e2a47f;stroke:#a96c4f;stroke-width:1.6}
  .co-pov .nail{fill:#f2c8ad}
  .co-pov .t{font-family:Inter,system-ui,sans-serif;fill:#17140d}
  .co-pov .disc{fill:#17140d;transition:fill .25s}
  .co-pov.on .disc{fill:#c8f23a}
  .co-pov .tri{fill:#f7f3e8;transition:opacity .2s}.co-pov.on .tri{opacity:0}
  .co-pov .sq{fill:#1d2a00;opacity:0;transition:opacity .2s}.co-pov.on .sq{opacity:1}
  .co-pov .st2{opacity:0}.co-pov.on .st1{opacity:0}.co-pov.on .st2{opacity:1}
  .co-pov .btn{fill:#f7f3e8;stroke:#17140d;stroke-width:1.2;transition:fill .2s}
  .co-pov .bl{font:700 7.5px Inter,sans-serif;fill:#17140d;text-anchor:middle}
  .co-pov.solo .s-vox{fill:#c8f23a}
  .co-pov.solo .r-bass,.co-pov.solo .r-click,.co-pov.solo .r-groove{opacity:.38}
  .co-pov.mute .m-click{fill:#17140d}.co-pov.mute .m-click+.bl{fill:#f7f3e8}
  .co-pov.mute .r-click{opacity:.38}
  .co-pov .row{transition:opacity .3s}
  .co-pov .knob{transition:transform .6s cubic-bezier(.3,.7,.3,1)}
  .co-pov.fade .k-bass{transform:translateX(-40px)}
  /* the thumb turns on its root and reaches: --a the angle from straight up, --d how far
     (the pad's centre from the root at (46, 334)), per target on the screen */
  .co-th{transform:translate(46px,334px) rotate(var(--a));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-th .shaft{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(calc(var(--d) / 100));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-th .tipg{transform:translateY(calc(var(--d) * -1px));transition:transform .5s cubic-bezier(.3,.75,.3,1)}
  .co-pov{--a:35.8deg;--d:89}
  .co-pov.th-play{--a:11.3deg;--d:215}
  .co-pov.th-solo{--a:35.6deg;--d:178}
  .co-pov.th-mute{--a:58.2deg;--d:146}
  .co-pov.th-fade{--a:47.6deg;--d:141}
  .co-pov.th-fade.fade{--a:34.0deg;--d:115}
  .co-tap{fill:none;stroke:#c8f23a;stroke-width:3;opacity:0;transform-box:fill-box;transform-origin:center}
  .co-tap.go{animation:coTap .6s ease-out}
  @keyframes coTap{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(2.2)}}
  .co-cur{position:absolute;left:0;top:0;width:24px;height:24px;z-index:6;pointer-events:none;opacity:0;
    transition:transform .7s cubic-bezier(.3,.7,.25,1),opacity .3s;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}
  .co-cur.show{opacity:1}
  .co-cur svg{width:24px;height:24px;display:block}
  .co-cur::after{content:"";position:absolute;left:-12px;top:-12px;width:26px;height:26px;border-radius:50%;border:3px solid #c8f23a;opacity:0}
  .co-cur.click::after{animation:coClick .55s ease-out}
  @keyframes coClick{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
  .co-ghost{position:absolute;top:0;width:2px;background:#c8f23a;box-shadow:0 0 8px #c8f23a;opacity:0;pointer-events:none;z-index:4;transition:opacity .3s}
  .co-tip{position:absolute;z-index:7;background:#17140d;color:#efe9da;font:600 13px/1.25 Inter,system-ui,sans-serif;padding:9px 13px 9px 11px;border-radius:12px;
    max-width:230px;opacity:0;transform:translateY(6px);transition:opacity .35s,transform .35s;pointer-events:none;display:flex;gap:8px;align-items:flex-start}
  .co-tip::before{content:"";flex:none;width:8px;height:8px;margin-top:4px;border-radius:50%;background:#c8f23a}
  .co-tip.show{opacity:1;transform:none}
  .co-paused *, .co-paused{animation-play-state:paused!important}`;
  document.head.appendChild(css);

  // ---------- the pieces ----------
  const sweep = document.createElement('div'); sweep.className = 'co-sweep'; qrbox.appendChild(sweep);
  // While the code is big, the card's own line says what to do.
  const line = card.querySelector('p b'), lineWas = line ? line.textContent : '';
  function big(on) { card.classList.toggle('co-big', on); if (line) line.textContent = on ? 'Point your phone camera here' : lineWas; }

  const ROWS = [['vox', 'VOX', 182], ['bass', 'BASS', 216], ['click', 'CLICK', 250], ['groove', 'GROOVE', 284]];
  const pov = document.createElement('div'); pov.className = 'co-pov'; pov.setAttribute('aria-hidden', 'true');
  pov.innerHTML = '<svg viewBox="0 0 240 380"><defs><clipPath id="coScr"><rect x="54" y="28" width="134" height="282" rx="17"/></clipPath></defs>'
    // the hand behind the phone: the palm, and four fingers round its right edge
    + '<path class="sk" d="M6 386C4 334 28 300 70 296L196 284C224 282 236 314 230 346L224 386Z"/>'
    + [[166, 126], [172, 162], [170, 198], [164, 234]].map(([x, y]) => '<rect class="sk" x="' + x + '" y="' + y + '" width="48" height="31" rx="15.5"/>').join('')
    + '<rect x="46" y="18" width="150" height="302" rx="26" fill="#17140d"/>'
    + '<g clip-path="url(#coScr)"><rect x="54" y="28" width="134" height="282" fill="#f7f3e8"/>'
    + '<text class="t" x="64" y="47" style="font-weight:800;font-size:8px;letter-spacing:1.4px">STREAMDAW</text>'
    + '<text class="t" x="64" y="64" style="font-weight:600;font-size:6px;letter-spacing:1.2px;fill:#77705d">SESSION</text>'
    + '<text class="t" x="64" y="83" style="font:600 17px Fraunces,Georgia,serif">mama</text>'
    + '<rect x="62" y="94" width="118" height="58" rx="11" fill="#e2dac7" stroke="#c4b99f"/>'
    + '<circle class="disc" cx="88" cy="123" r="17"/><path class="tri" d="M83.5 115L96 123L83.5 131Z"/><rect class="sq" x="82.5" y="117.5" width="11" height="11" rx="1.5"/>'
    + '<text class="t st1" x="112" y="121" style="font-weight:700;font-size:11px">Ready</text>'
    + '<text class="t st2" x="112" y="121" style="font-weight:700;font-size:11px">Playing</text>'
    + '<text class="t" x="112" y="134" style="font-size:7.5px;fill:#5b5547">your own mix</text>'
    + '<text class="t" x="64" y="173" style="font-weight:600;font-size:6px;letter-spacing:1.2px;fill:#77705d">TRACK MIXER</text>'
    + ROWS.map(([k, n, y]) => '<g class="row r-' + k + '"><text class="t" x="66" y="' + (y + 10) + '" style="font-weight:700;font-size:8.5px">' + n + '</text>'
      + '<circle class="btn s-' + k + '" cx="150" cy="' + (y + 7) + '" r="7.5"/><text class="bl" x="150" y="' + (y + 9.6) + '">S</text>'
      + '<circle class="btn m-' + k + '" cx="170" cy="' + (y + 7) + '" r="7.5"/><text class="bl" x="170" y="' + (y + 9.6) + '">M</text>'
      + '<path d="M66 ' + (y + 23) + 'H178" stroke="#cfc6b0" stroke-width="3" stroke-linecap="round"/>'
      + '<circle class="knob k-' + k + '" cx="150" cy="' + (y + 23) + '" r="5" fill="#17140d"/></g>').join('')
    + '<circle class="co-tap" cx="88" cy="123" r="9"/></g>'
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
  const playBtn = () => daw.querySelector('[data-a="play"]');
  const lanes = () => daw.querySelector('.stu-lanes');
  function pointer(x, y, show) { cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; cur.classList.toggle('show', show !== false); }
  function click() { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); }
  function say(text, x, y) { if (!text) { tip.classList.remove('show'); return; } tip.textContent = text; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('show'); }
  function sayAtPov(text) { say(text, 100, daw.clientHeight + 6); }
  const POV_STATES = ['on', 'solo', 'mute', 'fade', 'th-play', 'th-solo', 'th-mute', 'th-fade'];
  function povSet(show, ...cls) { pov.classList.toggle('show', !!show); POV_STATES.forEach((c) => pov.classList.toggle(c, cls.includes(c))); }
  function press(cx, cy) { tap.setAttribute('cx', cx); tap.setAttribute('cy', cy); tap.classList.remove('go'); void tap.getBBox(); tap.classList.add('go'); }
  function stepOn(s) {
    if (!steps) return;
    const order = ['scan', 'phone', 'play', 'tips'], i = order.indexOf(s);
    steps.querySelectorAll('li').forEach((li) => { const j = order.indexOf(li.dataset.s); li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
  }
  function toPlay() { const b = at(playBtn()); pointer(b.x + b.w * 0.55, b.y + b.h * 0.6); return b; }
  function rest() { pointer(daw.clientWidth * 0.62, daw.clientHeight * 0.55, false); ghost.style.opacity = 0; }

  // ---------- what the room is doing ----------
  function room() {
    const s = window.__studio; if (!s) return 'scan';
    const ph = s.phones || [];
    if (!ph.length) return 'scan';
    if (!ph.some((p) => p.listening)) return 'phone';
    return s.tr && s.tr.playing ? 'tips' : 'play';
  }

  let mode = null, tipN = 0, jumped = false;
  function enter(m) {
    mode = m; clearAll(); stepOn(m);
    big(false); say(''); rest(); povSet(false);
    if (still) {            // no motion: the step list says it, plus one still picture of the step
      if (m === 'scan') big(true);
      else if (m === 'phone') { povSet(true, 'th-play'); sayAtPov('Press Play on your phone'); }
      else if (m === 'play') { povSet(true, 'on'); const b = toPlay(); say('Now press Play here', b.x + b.w + 14, b.y - 4); }
      else { povSet(true, 'on', 'solo'); sayAtPov('Solo, mute and pull the faders: the mix on your phone is yours'); }
      return;
    }
    if (m === 'scan') attract();
    else if (m === 'phone') pressPhone();
    else if (m === 'play') pointPlay();
    else tips();
  }

  // No phone yet: grow the code, then act the whole thing out, and again.
  function attract() {
    big(true);
    later(4200, () => {
      big(false);
      povSet(true); sayAtPov('Then press Play on your phone…');
      later(900, () => povSet(true, 'th-play'));
      later(1500, () => { press(88, 123); povSet(true, 'th-play', 'on'); });
      later(2300, () => povSet(true, 'on'));
      later(2700, () => { const b = toPlay(); say('…and Play here: your phone plays along', b.x + b.w + 14, b.y - 4); });
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
      later(600, () => { press(88, 123); povSet(true, 'th-play', 'on'); });
      later(1300, () => povSet(true));
      later(2600, loop);
    };
    later(500, loop);
  }
  // The phone is listening: the DAW's Play.
  function pointPlay() {
    povSet(true, 'on');
    const b = toPlay(); say('Now press Play here', b.x + b.w + 14, b.y - 4);
    const loop = () => { toPlay(); later(700, click); later(2200, loop); };
    later(400, loop);
  }
  // Playing: one tip after another.
  function tips() {
    const list = [
      () => { povSet(true, 'on', 'th-solo'); sayAtPov('Solo the vocal on your phone'); later(650, () => { press(150, 189); povSet(true, 'on', 'th-solo', 'solo'); }); later(2600, () => povSet(true, 'on', 'solo')); },
      () => { povSet(true, 'on', 'th-mute'); sayAtPov('Mute the click'); later(650, () => { press(170, 257); povSet(true, 'on', 'th-mute', 'mute'); }); later(2600, () => povSet(true, 'on', 'mute')); },
      () => {
        if (jumped) return false;
        povSet(true, 'on'); const l = at(lanes());
        pointer(l.x + l.w * 0.25, l.y + l.h * 0.45); say('Click the timeline to jump: every phone follows', l.x + l.w * 0.25 + 18, l.y + 8);
        ghost.style.height = l.h + 'px'; ghost.style.top = l.y + 'px';
        later(800, () => { click(); ghost.style.left = (l.x + l.w * 0.25) + 'px'; ghost.style.opacity = 1; });
        later(1500, () => { pointer(l.x + l.w * 0.6, l.y + l.h * 0.45); });
        later(2300, () => { click(); ghost.style.transition = 'left .5s, opacity .3s'; ghost.style.left = (l.x + l.w * 0.6) + 'px'; });
        later(3300, () => { ghost.style.opacity = 0; ghost.style.transition = ''; rest(); });
      },
      () => { povSet(true, 'on', 'th-fade'); sayAtPov('Pull a fader: nobody else hears your mix'); later(700, () => povSet(true, 'on', 'th-fade', 'fade')); later(2600, () => povSet(true, 'on', 'fade')); },
    ];
    const next = () => {
      say(''); rest();
      let r = list[tipN++ % list.length]();
      if (r === false) r = list[tipN++ % list.length]();
      later(3800, next);
    };
    next();
  }

  // The visitor jumped by themselves: that tip is learnt.
  daw.addEventListener('click', (e) => { if (e.target.closest('.stu-lanes')) jumped = true; });

  // ---------- run while on screen ----------
  let running = false, poll = 0;
  function tick() { const m = room(); if (m !== mode) enter(m); }
  function run(on) {
    if (on === running) return; running = on;
    sec.classList.toggle('co-paused', !on);
    if (on) { mode = null; tick(); poll = setInterval(tick, 400); }
    else { clearInterval(poll); clearAll(); }
  }
  new IntersectionObserver((es) => run(es.some((e) => e.isIntersecting)), { threshold: 0.25 }).observe(sec);
})();
