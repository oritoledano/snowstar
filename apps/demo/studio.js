// The sale page's studio: on a computer, the "Try it" section is the DAW. It shows KAYMA's
// "MAMA" session (the eight sends, in the Live set's colours), a playhead and Play / Stop,
// and the StreamDAW strip with the phones that joined. A QR code made for this visit opens
// the phone page (streamdaw-demo.html?room=…) in the same room; Play here plays on every
// phone in the room, in time (worker/src/streamdaw-demo-room.js carries the transport).
// BUILT into apps/demo/studio.js by site/snowstar/demo/build-demo.mjs (the lanes are inlined).
(function () {
  'use strict';
  const box = document.getElementById('demoDaw');
  if (!box || !window.WebSocket) return;
  const LANES = {"groove": "000000000000000000067868817181758672828385677737766776767275866485738005866766667566767281748757676670018176757586676766727581748175848283767574817777758473847485777775833222288111111881000008810000018080818000000687776875777769776777697277775978886769775585897767776978418888800000000000", "bass": "000000000000000000017473776787688888886730000000000000000000000000000000666677677767756576667666666647687666887889868585766786777678878876668778888685847668787988786887888876678887666678776655888876578887887677774294885688758856868777558875899956788857887388767763785788888888777765543210", "keys": "000000000000000000000000988876659776555431000000000000000000000000000000000000000000000000000000000000002221222222222221111111112222211122122222222222211111112222222113877544458776554486665554444432248755765565445322444444444444444444444443444434444444444444444444444444444443434453645252", "guitars": "000000145455545454545543777665657655666554455454545454545454545464745002644555545453545454545454555540006445555454534475655464544565657964455454545354545454545454545556876655478765544576555454444355668766765356665521443334443343334334434443333333344343344443444444333434434344443433320011", "strings": "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044520003794756634532113675567785353357643434677326320011111000000000000", "vox": "000000000000000000000000000000000000000476676516666627674776777755541566377755667766411577656677655510046666641676572667666656764566165658676667787854566767654676451166732267665335767677456324777765767656632375611464954877667411000395666767751110048775851477777777777772148667741110000000"};
  const BPM = 94, BAR = 240 / BPM, BARS = 36, DUR = 92;
  const TRACKS = [
    ['groove', 'GROOVE', '#f2e43c', '3/4'], ['bass', 'BASS', '#5ce3d6', '5/6'], ['keys', 'KEYS', '#f0393d', '7/8'],
    ['guitars', 'GUITARS', '#2f52c4', '9/10'], ['strings', 'STRINGS', '#ffa47c', '11/12'], ['vox', 'VOX', '#7fe36c', '13/14'],
    ['guide', 'GUIDE', '#f4f4f4', '15/16'], ['click', 'CLICK', '#f4f4f4', '17/18'],
  ];
  const ROOM = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const PHONE_URL = new URL('streamdaw-demo.html?room=' + ROOM, location.href).href;
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const WS_BASE = (LOCAL && new URLSearchParams(location.search).get('ws')) || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  const $ = (s, r) => (r || box).querySelector(s);

  // ---------- the window ----------
  const css = document.createElement('style');
  css.textContent = `
  .stu{--d0:#1f1f1f;--d1:#2b2b2b;--d2:#3a3a3a;--d3:#474747;--dt:#d9d9d9;--dm:#9a9a9a;background:var(--d1);color:var(--dt);border:1px solid #111;border-radius:14px;overflow:hidden;box-shadow:0 40px 80px -40px rgba(23,20,13,.55);font:500 12px/1 Inter,system-ui,sans-serif;user-select:none}
  .stu-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--d0);border-bottom:1px solid #111}
  .stu-bar i{width:10px;height:10px;border-radius:50%;background:#555}
  .stu-bar b{flex:1;text-align:center;font-weight:600;letter-spacing:.06em;color:var(--dm);font-size:11px}
  .stu-tr{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--d2);border-bottom:1px solid #111}
  .stu-tr .f{background:#1a1a1a;border:1px solid #111;border-radius:4px;padding:5px 8px;font:500 12px ui-monospace,Menlo,monospace;color:#e8e8e8;min-width:44px;text-align:center}
  .stu-tr button{appearance:none;border:1px solid #111;background:#2a2a2a;color:#e8e8e8;width:34px;height:28px;border-radius:5px;cursor:pointer;font-size:13px;display:grid;place-items:center}
  .stu-tr button:hover{background:#333}
  .stu-tr button.on{background:#ffa62b;color:#1a1a1a}
  .stu-tr .sp{flex:1}
  .stu-arr{display:grid;grid-template-columns:minmax(0,1fr) 124px;background:var(--d2)}
  .stu-lanes{position:relative;cursor:pointer}
  .stu-lanes canvas{display:block;width:100%}
  .stu-ph{position:absolute;top:0;bottom:0;width:1.5px;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.5);pointer-events:none;left:0}
  .stu-heads{border-left:1px solid #111;padding-top:22px}
  .stu-head{height:30px;border-bottom:1px solid #222;display:flex;align-items:center;gap:6px;padding:0 6px;background:var(--d3)}
  .stu-head span{flex:1;background:var(--c);color:#111;font-weight:700;font-size:10px;letter-spacing:.05em;padding:4px 6px;border-radius:3px;white-space:nowrap;overflow:hidden}
  .stu-head i{font-style:normal;font-size:10px;color:var(--dm);width:30px;text-align:right}
  .stu-sd{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#efe9da;color:#17140d;border-top:1px solid #111;flex-wrap:wrap}
  .stu-sd .wm{display:inline-block;width:96px;height:10px;background:#17140d;-webkit-mask:url(demo/streamdaw-wordmark.png) left center/contain no-repeat;mask:url(demo/streamdaw-wordmark.png) left center/contain no-repeat}
  .stu-sd .air{font:600 10px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:6px 9px;border-radius:999px;border:1px solid #17140d}
  .stu-sd .air.on{background:#c8f23a;border-color:#c8f23a}
  .stu-sd .air.on::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#1d2a00;margin-right:6px;vertical-align:1px}
  .stu-sd .who{flex:1;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;font-size:12px;color:#403a2c}
  .stu-sd .ph{border:1px solid rgba(23,20,13,.28);border-radius:999px;padding:5px 9px;background:#f7f3e8}
  .stu-sd .ph.l{border-color:#23864a;color:#14532d}
  .stu-sd .ph.l::before{content:"▶ ";font-size:9px}`;
  document.head.appendChild(css);
  box.className = 'stu';
  box.innerHTML = '<div class="stu-bar"><i></i><i></i><i></i><b>KAYMA — MAMA</b></div>'
    + '<div class="stu-tr"><button data-a="play" title="Play (on every phone in the session)" aria-label="Play">&#9654;&#xFE0E;</button><button data-a="stop" title="Stop. Twice: back to the start" aria-label="Stop">&#9632;</button>'
    + '<span class="f">94.00</span><span class="f">4 / 4</span><span class="sp"></span><span class="f" data-f="bbs">1. 1. 1</span><span class="f" data-f="time">0:00</span></div>'
    + '<div class="stu-arr"><div class="stu-lanes"><canvas></canvas><div class="stu-ph"></div></div><div class="stu-heads">'
    + TRACKS.map((t) => '<div class="stu-head" style="--c:' + t[2] + '"><span>' + t[1] + '</span><i>' + t[3] + '</i></div>').join('') + '</div></div>'
    + '<div class="stu-sd"><span class="wm" role="img" aria-label="StreamDAW"></span><span class="air">Off air</span><span style="font-size:12px">session <b>mama</b></span><span class="who"></span></div>';
  const cv = $('canvas'), lanes = $('.stu-lanes'), ph = $('.stu-ph');
  const RULER = 22, LANE = 31;
  function draw() {
    const w = lanes.clientWidth, h = RULER + LANE * TRACKS.length, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2e2e2e'; g.fillRect(0, 0, w, RULER);
    const bx = (b) => (b / BARS) * w;
    g.font = '500 10px Inter, system-ui, sans-serif'; g.fillStyle = '#bdbdbd'; g.strokeStyle = '#555';
    for (let b = 0; b <= BARS; b++) { const x = Math.round(bx(b)) + 0.5; g.beginPath(); g.moveTo(x, b % 4 ? RULER - 5 : 4); g.lineTo(x, RULER); g.stroke(); if (b % 4 === 0 && b < BARS) g.fillText(String(b + 1), x + 3, 13); }
    TRACKS.forEach((t, i) => {
      const y = RULER + i * LANE;
      g.fillStyle = i % 2 ? '#424242' : '#3f3f3f'; g.fillRect(0, y, w, LANE);
      g.strokeStyle = '#4c4c4c'; for (let b = 4; b < BARS; b += 4) { const x = Math.round(bx(b)) + 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + LANE); g.stroke(); }
      const top = y + 3, ch = LANE - 6;
      if (t[0] === 'guide') {
        for (const [b0, b1, lab] of [[0, 1, '1'], [4, 5, 'V']]) {
          g.fillStyle = t[2]; g.fillRect(bx(b0) + 1, top, bx(b1) - bx(b0) - 2, ch);
          g.fillStyle = '#222'; g.fillText(lab, bx(b0) + 4, top + 15);
        }
        return;
      }
      if (t[0] === 'click') {
        g.fillStyle = t[2]; g.fillRect(1, top, w - 2, ch); g.fillStyle = '#9a9a9a';
        for (let k = 0; k < BARS * 4; k++) { const x = bx(k / 4); g.fillRect(x, top + (k % 4 ? 9 : 4), 1, k % 4 ? ch - 18 : ch - 8); }
        return;
      }
      const env = LANES[t[0]] || '';
      let start = env.search(/[1-9]/), end = env.length - [...env].reverse().join('').search(/[1-9]/);
      if (start < 0) { start = 0; end = 0; }
      const per = BARS / env.length;
      if (t[0] === 'strings') { start = 27 / per; end = 35 / per; }      // strings: soft, but there from bar 28
      g.fillStyle = t[2]; g.fillRect(bx(start * per) + 1, top, bx((end - start) * per) - 2, ch);
      g.fillStyle = 'rgba(0,0,0,.42)';
      for (let k = start; k < end; k++) {
        const v = (+env[k] || (t[0] === 'strings' ? 3 : 0)) / 9, x = bx(k * per), cw = bx(per);
        const hh = Math.max(1, v * (ch - 6) / 2);
        for (let j = 0; j < 3; j++) g.fillRect(x + j * cw / 3, top + ch / 2 - hh * (0.75 + 0.25 * ((k + j) % 3) / 2), Math.max(1, cw / 3 - 1), 2 * hh * (0.75 + 0.25 * ((k + j) % 3) / 2));
      }
    });
  }
  draw(); addEventListener('resize', draw);

  // ---------- the room ----------
  let ws = null, up = false, off = 0, bestRtt = Infinity, phones = [], tr = { playing: false, pos: 0, at: 0 };
  const now = () => performance.timeOrigin + performance.now();
  const pos = () => (tr.playing ? Math.min(DUR, tr.pos + (now() + off - tr.at) / 1000) : tr.pos);
  function connect() {
    const s = new WebSocket(WS_BASE + '/api/streamdaw/demo/ws?role=host&room=' + ROOM); ws = s;
    s.onopen = () => { up = true; for (let i = 0; i < 5; i++) setTimeout(() => say({ type: 'ping', t: now() }), i * 150); paint(); };
    s.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (er) { return; }
      if (m.type === 'pong') { const t1 = now(), rtt = t1 - m.t; if (rtt < bestRtt) { bestRtt = rtt; off = m.now - (m.t + t1) / 2; } }
      else if (m.type === 'welcome') { off = m.now - now(); tr = m.transport; }
      else if (m.type === 'transport') tr = m;
      else if (m.type === 'presence') { phones = m.phones || []; paint(); }
    };
    s.onclose = (e) => { if (ws !== s) return; up = false; paint(); if (e.code !== 4000) setTimeout(connect, 2500); };
    s.onerror = () => {};
  }
  const say = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  setInterval(() => say({ type: 'ping', t: now() }), 4000);
  function transport(playing, p) {
    p = Math.max(0, Math.min(DUR - 0.5, p));
    if (up) say({ type: 'transport', playing, pos: p });
    else tr = { playing, pos: p, at: now() + off };       // no room (offline): the playhead still works
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (b && b.dataset.a === 'play') transport(!tr.playing, pos());
    else if (b && b.dataset.a === 'stop') transport(false, tr.playing ? pos() : 0);
    else if (e.target.closest('.stu-lanes')) { const r = lanes.getBoundingClientRect(); transport(tr.playing, (e.clientX - r.left) / r.width * BARS * BAR); }
  });
  function paint() {
    const n = phones.length, l = phones.filter((p) => p.listening).length;
    $('.stu-sd .who').innerHTML = !up ? '<span class="ph">connecting…</span>'
      : n ? phones.map((p) => '<span class="ph' + (p.listening ? ' l' : '') + '">' + esc(p.name) + (p.listening ? ' · listening' : ' · press play') + '</span>').join('')
          : '<span class="ph">No phone yet: scan the code</span>';
    const st = document.getElementById('demoQrState');
    if (st) st.textContent = !n ? 'Waiting for your phone…' : l ? (l === 1 ? 'Your phone is in: press play here.' : l + ' phones in: press play here.') : 'Your phone is in: press its play button, then play here.';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function frame() {
    const p = pos();
    if (tr.playing && p >= DUR - 0.05) transport(false, 0);
    ph.style.left = (p / (BARS * BAR) * 100) + '%';
    const beat = p / (60 / BPM), b = Math.floor(beat / 4) + 1, bt = Math.floor(beat % 4) + 1, six = Math.floor((beat % 1) * 4) + 1;
    $('[data-f="bbs"]').textContent = b + '. ' + bt + '. ' + six;
    $('[data-f="time"]').textContent = Math.floor(p / 60) + ':' + String(Math.floor(p % 60)).padStart(2, '0');
    $('[data-a="play"]').classList.toggle('on', tr.playing);
    const air = $('.stu-sd .air'); air.classList.toggle('on', tr.playing); air.textContent = tr.playing ? 'On air' : 'Off air';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- the QR code for this visit ----------
  function qr() {
    const host = document.getElementById('demoQr'); if (!host || !window.SdawQR) return;
    const m = window.SdawQR.matrix(PHONE_URL), n = m.size, q = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m.get(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    host.innerHTML = '<svg viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="QR code: join this demo session from your phone"><path fill="#17140d" d="' + d + '"/></svg>';
    const a = document.getElementById('demoLink'); if (a) a.href = PHONE_URL;
  }
  qr();
  // The room opens when the section comes near, not on every visit to the page.
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); connect(); paint(); } }, { rootMargin: '400px' });
  io.observe(box);
  paint();
  window.__studio = { room: ROOM, phoneUrl: PHONE_URL, get tr() { return tr; }, get phones() { return phones; }, get up() { return up; }, pos };
})();
