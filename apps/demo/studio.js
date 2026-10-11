/* StreamDAW demo studio — BUILT by site/snowstar/demo/build-demo.mjs in the StreamDAW repo from
   stage/web/vu-analog.js, stage/web/fadermeter.js and site/snowstar/demo/studio.js. Edit those, not this file. */
(function () {
  'use strict';
  const REF = -4;
  const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -120);
  const needleAt = (db) => Math.min(1.06, Math.pow(10, (db - REF) / 20) / Math.pow(10, 3 / 20));   // 0..1 = rest..+3 VU
  const isDark = (el) => {
    const sc = el && el.closest ? el.closest('[data-theme]') : null;
    const t = sc ? sc.getAttribute('data-theme') : document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const PAL = {
    dark:  { f0: '#f7e2a6', f1: '#d9b866', glow: 'rgba(255,214,120,.55)', vig: 'rgba(60,40,10,.28)', ink: '#2b2416', red: '#c4271f', lamp: [255, 59, 47], lampHi: '#ffd1c7', lampOff: ['#7a2a24', '#2b0f0d'], bez0: '#3a3833', bez1: '#0e0d0b' },
    light: { f0: '#fbf5e4', f1: '#e7dcbd', glow: 'rgba(255,246,214,.6)', vig: 'rgba(60,40,10,.28)', ink: '#2b2416', red: '#c4271f', lamp: [255, 59, 47], lampHi: '#ffd1c7', lampOff: ['#7a2a24', '#2b0f0d'], bez0: '#4a4741', bez1: '#15140f' },
  };
  const all = new Set();

  function geo(x0, w, h) {
    const fx = x0 + 6, fy = 7, fw = w - 12, fh = h - 16;
    const cx = fx + fw / 2, cy = fy + fh * 1.45, R = Math.min(fh * 1.25, fw * 0.55), A = 42 * Math.PI / 180;
    return { x0, w, h, fx, fy, fw, fh, cx, cy, R, A, ang: (p) => -A + 2 * A * Math.max(0, Math.min(1, p)) - Math.PI / 2 };
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function paintBack(g, m, side, pal) {
    const { x0, w, h, fx, fy, fw, fh, cx, cy, R, ang } = m;
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    const bz = g.createLinearGradient(0, 0, 0, h); bz.addColorStop(0, pal.bez0); bz.addColorStop(1, pal.bez1);
    rr(g, x0, 1, w, h - 4, 9); g.fillStyle = bz; g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; rr(g, x0 + 0.5, 1.5, w - 1, h - 5, 8.5); g.stroke();
    g.save(); rr(g, fx, fy, fw, fh, 5); g.clip();
    const face = g.createLinearGradient(0, fy, 0, fy + fh); face.addColorStop(0, pal.f0); face.addColorStop(1, pal.f1);
    g.fillStyle = face; g.fillRect(fx, fy, fw, fh);
    const glow = g.createRadialGradient(fx + fw / 2, fy + fh * 0.9, 4, fx + fw / 2, fy + fh * 0.9, fw * 0.7); glow.addColorStop(0, pal.glow); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(fx, fy, fw, fh);
    const vig = g.createRadialGradient(fx + fw / 2, fy + fh / 2, fh * 0.2, fx + fw / 2, fy + fh / 2, fw * 0.75); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, pal.vig);
    g.fillStyle = vig; g.fillRect(fx, fy, fw, fh);
    const at = (vuDb) => needleAt(vuDb + REF);
    g.lineWidth = 1.2; g.strokeStyle = pal.ink;
    g.beginPath(); g.arc(cx, cy, R, ang(at(-20)), ang(at(0))); g.stroke();
    g.strokeStyle = pal.red; g.lineWidth = 3.2; g.beginPath(); g.arc(cx, cy, R + 1.5, ang(at(0)), ang(1)); g.stroke();
    g.font = '600 ' + Math.max(7, Math.round(fh * 0.13)) + 'px ui-sans-serif, -apple-system, Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [d, lab] of [[-20, '20'], [-10, '10'], [-7, ''], [-5, '5'], [-3, '3'], [-2, ''], [-1, ''], [0, '0'], [1, ''], [2, ''], [3, '+3']]) {
      const t = ang(at(d)), big = lab !== '', c = Math.cos(t), sn = Math.sin(t);
      g.strokeStyle = d > 0 ? pal.red : pal.ink; g.lineWidth = big ? 1.3 : 1;
      g.beginPath(); g.moveTo(cx + c * R, cy + sn * R); g.lineTo(cx + c * (R + (big ? 6 : 4)), cy + sn * (R + (big ? 6 : 4))); g.stroke();
      if (big && fw > 100) { g.fillStyle = d > 0 ? pal.red : pal.ink; g.fillText(lab, cx + c * (R + 13), cy + sn * (R + 13)); }
    }
    g.fillStyle = pal.ink; g.font = 'italic 700 ' + Math.max(9, Math.round(fh * 0.2)) + 'px Georgia, "Times New Roman", serif';
    g.fillText('VU', cx, fy + fh * 0.8);
    g.font = '600 ' + Math.max(7, Math.round(fh * 0.12)) + 'px ui-sans-serif, -apple-system, Helvetica, Arial'; g.textAlign = 'left';
    g.fillText(side, fx + 7, fy + 10);
    g.restore();
  }
  function paintFront(g, m) {   // over the needle: the pivot's cover and the glass
    const { fx, fy, fw, fh } = m;
    g.save(); rr(g, fx, fy, fw, fh, 5); g.clip();
    const cover = g.createLinearGradient(0, fy + fh - 12, 0, fy + fh); cover.addColorStop(0, 'rgba(20,18,14,0)'); cover.addColorStop(1, 'rgba(20,18,14,.35)');
    g.fillStyle = cover; g.fillRect(fx, fy + fh - 12, fw, 12);
    const gl = g.createLinearGradient(0, fy, 0, fy + fh * 0.55); gl.addColorStop(0, 'rgba(255,255,255,.42)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + fw, fy); g.lineTo(fx + fw, fy + fh * 0.32); g.quadraticCurveTo(fx + fw / 2, fy + fh * 0.5, fx, fy + fh * 0.32); g.closePath(); g.fill();
    g.restore();
  }
  function lamp(on, dpr, pal) {
    const c = document.createElement('canvas'), s = Math.ceil(18 * dpr); c.width = c.height = s;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rgb = pal.lamp.join(',');
    if (on) { const halo = g.createRadialGradient(9, 9, 1, 9, 9, 9); halo.addColorStop(0, 'rgba(' + rgb + ',.6)'); halo.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = halo; g.fillRect(0, 0, 18, 18); }
    const l = g.createRadialGradient(8, 8, 0.5, 9, 9, 4); l.addColorStop(0, on ? pal.lampHi : pal.lampOff[0]); l.addColorStop(1, on ? 'rgb(' + rgb + ')' : pal.lampOff[1]);
    g.fillStyle = l; g.beginPath(); g.arc(9, 9, 3.2, 0, 2 * Math.PI); g.fill();
    return c;
  }

  function create(cv, o) {
    const P = { dark: { ...PAL.dark, ...((o && o.pal && o.pal.dark) || {}) }, light: { ...PAL.light, ...((o && o.pal && o.pal.light) || {}) } };
    const s = { tl: 0, tr: 0, xl: 0, xr: 0, vl: 0, vr: 0, pkl: -1e9, pkr: -1e9, at: 0, last: 0, drawn: 0, running: false, L: null, key: '' };
    function layers() {
      const dpr = Math.min(3, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return null;
      const dark = isDark(cv), key = [W, H, dpr, dark].join();
      if (s.L && s.key === key) return s.L;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const pal = dark ? P.dark : P.light, gap = 10, mw = (W - gap) / 2;
      const ms = [geo(0, mw, H), geo(mw + gap, mw, H)];
      const mk = () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, g]; };
      const [bg, gb] = mk(), [fg, gf] = mk();
      paintBack(gb, ms[0], 'L', pal); paintBack(gb, ms[1], 'R', pal);
      paintFront(gf, ms[0]); paintFront(gf, ms[1]);
      s.L = { bg, fg, ms, dpr, W, H, on: lamp(true, dpr, pal), off: lamp(false, dpr, pal) }; s.key = key;
      return s.L;
    }
    function draw() {
      const L = layers(); if (!L) return;
      const g = cv.getContext('2d'), now = performance.now();
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(L.bg, 0, 0);
      g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.lineCap = 'round';
      [[L.ms[0], s.xl, now - s.pkl < 500], [L.ms[1], s.xr, now - s.pkr < 500]].forEach(([m, x, pk]) => {
        const t = m.ang(x), c = Math.cos(t), sn = Math.sin(t), r0 = m.R * 0.42, r1 = m.R + 7;
        g.save(); g.beginPath(); g.rect(m.fx, m.fy, m.fw, m.fh); g.clip();
        g.strokeStyle = 'rgba(40,25,5,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(m.cx + c * r0 + 2, m.cy + sn * r0 + 2); g.lineTo(m.cx + c * r1 + 2, m.cy + sn * r1 + 2); g.stroke();
        g.strokeStyle = '#141210'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(m.cx + c * r0, m.cy + sn * r0); g.lineTo(m.cx + c * r1, m.cy + sn * r1); g.stroke();
        g.restore();
        g.drawImage(pk ? L.on : L.off, m.fx + m.fw - 18, m.fy + 1, 18, 18);
      });
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L.fg, 0, 0);
    }
    function step(now) {
      if (document.hidden) { s.running = false; return; }
      if (now - s.drawn < 32) { requestAnimationFrame(step); return; }   // at most 30 frames a second
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000); s.last = now; s.drawn = now;
      const fresh = now - s.at < 400;
      const tl = fresh ? needleAt(toDb(s.tl)) : 0, tr = fresh ? needleAt(toDb(s.tr)) : 0;
      s.tl *= 0.6; s.tr *= 0.6;
      for (const [t, x, v] of [[tl, 'xl', 'vl'], [tr, 'xr', 'vr']]) {
        const w = 2 * Math.PI * (t > s[x] ? 5 : 1.6), K = w * w, C = 1.8 * w;
        for (let i = 0; i < 2; i++) { const hh = dt / 2; s[v] += (K * (t - s[x]) - C * s[v]) * hh; s[x] = Math.max(-0.02, Math.min(1.08, s[x] + s[v] * hh)); }
      }
      draw();
      const moving = Math.abs(s.vl) + Math.abs(s.vr) > 0.002 || s.xl > 0.002 || s.xr > 0.002;
      if (moving || fresh || now - Math.max(s.pkl, s.pkr) < 600) requestAnimationFrame(step);
      else { s.running = false; s.xl = s.xr = s.vl = s.vr = 0; draw(); }
    }
    const api = {
      feed(l, r) {
        l = +l || 0; r = +r || 0;
        s.tl = Math.max(s.tl, l); s.tr = Math.max(s.tr, r); s.at = performance.now();
        if (l > 0.89) s.pkl = s.at; if (r > 0.89) s.pkr = s.at;
        if (!s.running && !document.hidden) { s.running = true; s.last = performance.now(); requestAnimationFrame(step); }
      },
      pose(l, r, peak) { s.xl = +l || 0; s.xr = +r || 0; s.vl = s.vr = 0; if (peak) s.pkl = s.pkr = performance.now(); draw(); },
      redraw() { s.key = ''; draw(); },
    };
    all.add(api);
    requestAnimationFrame(() => draw());
    return api;
  }
  const again = () => { for (const m of all) m.redraw(); };
  window.addEventListener('sdawtheme', again);
  window.addEventListener('resize', again);
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', again); }
  window.SdawVU = { create, toDb, needleAt };
})();

(function () {
  'use strict';
  if (window.SdawFader) return;

  const pos = (d) => (d <= -60 ? 0 : d >= -18 ? 0.55 + (d + 18) / 18 * 0.45 : (d + 60) / 42 * 0.55);
  const unpos = (p) => (p <= 0 ? -Infinity : p >= 0.55 ? (p - 0.55) / 0.45 * 18 - 18 : p / 0.55 * 42 - 60);
  const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const topOf = (max) => pos(toDb(max));
  function xOf(v, max) { max = max > 0 ? max : 1; return v > 0 ? clamp(pos(toDb(Math.min(v, max))) / topOf(max), 0, 1) : 0; }
  function valueAt(x, max) {
    max = max > 0 ? max : 1;
    if (!(x > 0.004)) return 0;
    if (x >= 1) return max;
    return Math.min(max, Math.pow(10, unpos(x * topOf(max)) / 20));
  }
  function dbText(v) {
    if (!(v > 0.00001)) return '−∞ dB';
    const d = toDb(v);
    return Math.abs(d) < 0.05 ? '0.0 dB' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) + ' dB';
  }
  function panText(v) { const n = Math.round(v * 100); return n === 0 ? 'C' : (n < 0 ? 'L ' : 'R ') + Math.abs(n); }
  function panWords(v) { const n = Math.round(v * 100); return n === 0 ? 'centre' : (n < 0 ? 'left ' : 'right ') + Math.abs(n); }

  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  function readPal(el) {
    const cs = getComputedStyle(el);
    const v = (n, d) => { const s = cs.getPropertyValue(n); return (s && s.trim()) || d; };
    const num = (s, d) => { const n = parseFloat(s); return isFinite(n) ? n : d; };
    const fd = v('--fader-dark', ''), dark = fd ? fd === '1' : isDark();
    return {
      dark,
      seg: [v('--vu-g', '#44d36e'), v('--vu-y', '#f4c430'), v('--vu-r', '#ff4b4b')],
      off: num(v('--vu-off', '.12'), 0.12), glow: num(v('--vu-glow', '4'), 4),
      hi: v('--vu-hi', '#1d1c18'), lo: v('--vu-lo', '#0c0b09'), ink: v('--vu-ink', '232, 226, 207'),
      cap: v('--fader-cap', '') || v('--ink', '#f3eddc'),
      hot: v('--fader-hot', '') || v('--lime', '#c8f23a'),
      arc: v('--fader-arc', '') || (dark ? v('--lime', '#c8f23a') : v('--ink', '#16140f')),
      text: v('--ink', '#f3eddc'), k0: v('--field', '#15140f'), k1: v('--panel2', '#26241e'),
    };
  }

  function css() {
    if (document.getElementById('sdaw-fader-css')) return;
    const s = document.createElement('style'); s.id = 'sdaw-fader-css';
    s.textContent =
      '.sdf,.sdk{position:relative;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;outline:none}' +
      '.sdf{cursor:pointer;border-radius:999px}.sdk{cursor:grab;border-radius:50%}.sdf.sd-act,.sdk.sd-act{cursor:grabbing}' +
      '.sdf>canvas,.sdk>canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none}' +
      '.sdf>input.sd-in[type=range],.sdk>input.sd-in[type=range]{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;border:0;' +
        'opacity:0;pointer-events:none;-webkit-appearance:none;appearance:none;background:none}' +
      '.sd-tip{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-3px);padding:3px 7px;border-radius:999px;background:var(--ink);' +
        'color:var(--bg);font:500 11px/1.25 var(--mono,ui-monospace,Menlo,monospace);white-space:nowrap;pointer-events:none;z-index:6}' +
      '.sd-tip[hidden]{display:none}' +
      '.sdf.sd-off{cursor:default}.sdk.sd-off{cursor:default;opacity:.28}' +
      '.sdf.sd-focus:not(.sd-act),.sdk.sd-focus:not(.sd-act){outline:2px solid var(--ink);outline-offset:2px}';
    (document.head || document.documentElement).appendChild(s);
  }
  const live = new Set(), dirty = new Set(), byEl = new WeakMap();
  let raf = 0;
  function want(i) { dirty.add(i); if (!raf) raf = requestAnimationFrame(flush); }
  function flush() { raf = 0; const list = [...dirty]; dirty.clear(); for (const i of list) if (!i.dead) i.paint(); }
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver((es) => { for (const e of es) { const i = byEl.get(e.target); if (i && !i.dead) want(i); } }) : null;
  function retheme() { for (const i of live) { i.pal = null; i.bg = null; want(i); } }
  window.addEventListener('sdawtheme', retheme);
  try { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', retheme); } catch (e) {}

  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function disc(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); }

  class Ctl {
    constructor(el, o, kind) {
      css();
      const old = byEl.get(el); if (old) old.destroy();
      this.el = el; this.o = o; this.kind = kind; this.dead = false; this.act = false; this.drag = null;
      this.pal = null; this.bg = null; this.W = 0; this.H = 0; this.dpr = 0; this.ls = [];
      el.classList.add(kind);
      this.cv = document.createElement('canvas'); this.cv.setAttribute('aria-hidden', 'true');
      const inp = this.input = document.createElement('input');
      inp.type = 'range'; inp.className = 'sd-in' + (o.inputClass ? ' ' + o.inputClass : '');
      if (o.inputId) inp.id = o.inputId;
      inp.setAttribute('aria-label', o.label || (kind === 'sdf' ? 'Volume' : 'Pan'));
      this.tip = document.createElement('div'); this.tip.className = 'sd-tip'; this.tip.hidden = true; this.tip.setAttribute('aria-hidden', 'true');
      el.append(this.cv, inp, this.tip);
      byEl.set(el, this); live.add(this); if (ro) ro.observe(el);
      this.on(el, 'pointerdown', (e) => this.down(e));
      this.on(el, 'pointermove', (e) => this.move(e));
      this.on(el, 'pointerup', (e) => this.up(e, false));
      this.on(el, 'pointercancel', (e) => this.up(e, true));
      this.on(el, 'touchmove', (e) => { if (this.drag && this.drag.on && e.cancelable) e.preventDefault(); }, { passive: false });
      this.on(el, 'dblclick', (e) => { e.preventDefault(); this.home(); });
      this.on(el, 'contextmenu', (e) => { if (this.drag) e.preventDefault(); });
      this.on(inp, 'keydown', (e) => { if (/^(Arrow|Page|Home|End)/.test(e.key)) el.classList.add('sd-focus'); this.key(e); });
      this.on(inp, 'input', () => this.fromInput());
      this.on(inp, 'focus', () => { let fv = !this.ptrFocus; if (fv) try { fv = inp.matches(':focus-visible'); } catch (e) {} this.ptrFocus = false; el.classList.toggle('sd-focus', fv); });
      this.on(inp, 'blur', () => el.classList.remove('sd-focus'));
    }
    on(t, ty, fn, op) { t.addEventListener(ty, fn, op); this.ls.push([t, ty, fn, op]); }
    get value() { return this.v; }
    setValue(v, force) { if (this.drag && this.drag.on && !force) return; this.v = this.clampV(+v || 0); this.write(); want(this); }
    emit(final) { if (this.o.onInput) this.o.onInput(this.v, !!final); }
    set(v, final) {
      v = this.clampV(v);
      const ch = v !== this.v; this.v = v;
      if (ch) { this.write(); want(this); }
      if (ch || final) this.emit(final);
    }
    home() { if (this.disabled) return; this.set(this.homeV(), true); if (this.o.onDouble) this.o.onDouble(this.v); }
    setDisabled(b) {
      b = !!b; if (!!this.disabled === b) return;
      this.disabled = b; this.input.disabled = b; this.el.classList.toggle('sd-off', b);
      if (b && this.drag) { this.drag = null; this.active(false); }
      want(this);
    }
    tapped(e) {
      const now = performance.now(), t = this.lastTap;
      if (t && now - t.t < 350 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) { this.lastTap = null; this.home(); }
      else this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    active(on) {
      if (this.act === on) return;
      this.act = on; this.el.classList.toggle('sd-act', on);
      this.tip.hidden = !on; if (on) this.tipSync();
      want(this);
    }
    size() {
      const W = this.el.clientWidth, H = this.el.clientHeight;
      if (!W || !H) return false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== this.W || H !== this.H || dpr !== this.dpr) {
        this.W = W; this.H = H; this.dpr = dpr; this.bg = null;
        this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
        this.layout();
      }
      if (!this.pal) { this.pal = readPal(this.el); this.bg = null; }
      return true;
    }
    layout() {}
    redraw() { this.pal = null; this.bg = null; if (!this.dead) this.paint(); }
    destroy() {
      if (this.dead) return;
      this.dead = true;
      for (const [t, ty, fn, op] of this.ls) t.removeEventListener(ty, fn, op);
      this.ls = []; clearTimeout(this.holdT); clearTimeout(this.whT);
      if (this.anim) cancelAnimationFrame(this.anim);
      if (ro) ro.unobserve(this.el);
      live.delete(this); dirty.delete(this);
      if (byEl.get(this.el) === this) byEl.delete(this.el);
      this.cv.remove(); this.input.remove(); this.tip.remove();
      this.el.classList.remove(this.kind, 'sd-act', 'sd-focus', 'sd-held');
    }
  }

  class Fader extends Ctl {
    constructor(el, o) {
      super(el, o, 'sdf');
      this.vert = o.orientation === 'v';
      this.max = o.max > 0 ? +o.max : 1;
      this.unity = o.unity > 0 ? Math.min(+o.unity, this.max) : Math.min(1, this.max);
      el.style.touchAction = this.vert ? 'pan-x' : 'pan-y';
      const inp = this.input;
      inp.min = '0'; inp.max = String(Math.round(this.max * 100)); inp.step = 'any';   // the value in % of gain: '50' = 0.5
      if (this.vert) inp.setAttribute('aria-orientation', 'vertical');
      this.lv = [0, 0]; this.pk = [{ p: 0, at: 0 }, { p: 0, at: 0 }]; this.lt = 0; this.shown = null;
      this.v = this.clampV(o.value != null ? +o.value : this.unity);
      this.write(); want(this);
    }
    clampV(v) { return clamp(isFinite(v) ? v : 0, 0, this.max); }
    homeV() { return this.unity; }
    layout() {
      const Lg = this.vert ? this.H : this.W, T = this.vert ? this.W : this.H;
      const R = Math.max(6, Math.min(11, T / 2 - 2));                 // the thumb
      const a0 = R + 1, a1 = Math.max(a0 + 1, Lg - R - 1), span = a1 - a0;
      const tt = Math.max(8, Math.min(T - 4, Math.round(R * 1.5)));  // the track's thickness
      const gap = tt >= 14 ? 2 : 1, pad = 2, bh = (tt - 2 * pad - gap) / 2, c = T / 2;
      const N = clamp(Math.round(span / 5), 12, 120);                 // segments of about 5 px (the desk's are 4.75)
      this.g = { Lg, T, R, a0, a1, span, tt, gap, pad, bh, c, N, top: c - tt / 2, yL: c - gap / 2 - bh, yR: c + gap / 2 };
      const top = topOf(this.max);
      this.segCol = new Uint8Array(N);
      for (let k = 0; k < N; k++) { const d = unpos((k + 0.5) / N * top); this.segCol[k] = d > -6 ? 2 : d > -18 ? 1 : 0; }
    }
    geom() {
      if (!this.size()) return null;
      const g = this.g;
      return { vert: this.vert, a0: g.a0, a1: g.a1, span: g.span, R: g.R, thumb: this.thumbAt(), segments: g.N,
               yL: g.yL + g.bh / 2, yR: g.yR + g.bh / 2, lit: this.shown ? this.shown.slice(0, 4) : null };
    }
    setLevels(l, r) {
      const now = performance.now(), dt = this.lt ? Math.min(0.5, (now - this.lt) / 1000) : 0;
      this.lt = now;
      const top = topOf(this.max);
      for (let ch = 0; ch < 2; ch++) {
        const lin = ch ? (r == null ? l : r) : l, pk = this.pk[ch];
        const p = lin > 0 ? clamp(pos(toDb(lin)) / top, 0, 1) : 0;
        this.lv[ch] = p;
        if (p >= pk.p) { pk.p = p; pk.at = now; }
        else if (now - pk.at > 1500) pk.p = Math.max(p, pk.p - dt * 0.5);
      }
      const s = this.state(), o = this.shown;
      if (!o || s[0] !== o[0] || s[1] !== o[1] || s[2] !== o[2] || s[3] !== o[3]) want(this);
    }
    state() {
      const N = this.g ? this.g.N : 40;
      const seg = (p) => Math.round(p * N), pk = (p) => (p > 0.001 ? Math.max(0, Math.round(p * N) - 1) : -1);
      return [seg(this.lv[0]), seg(this.lv[1]), pk(this.pk[0].p), pk(this.pk[1].p)];
    }
    thumbAt() { const g = this.g; return g ? g.a0 + xOf(this.v, this.max) * g.span : 0; }
    write() {
      const inp = this.input, s = String(Math.round(this.v * 10000) / 100), t = dbText(this.v);
      if (inp.value !== s) inp.value = s;
      inp.setAttribute('aria-valuetext', t);
      this.el.title = (this.o.label || 'Volume') + ' ' + t + ' · double-' + (coarse() ? 'tap' : 'click') + ' for ' + dbText(this.unity);
      if (this.act) this.tipSync();
    }
    tipSync() {
      this.tip.textContent = dbText(this.v);
      if (this.vert) { this.tip.style.left = '50%'; this.tip.style.bottom = '100%'; }
      else if (this.g) this.tip.style.left = Math.round(this.thumbAt()) + 'px';
    }
    frame(g) { g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); if (this.vert) { g.translate(0, this.H); g.rotate(-Math.PI / 2); } }
    paintBg() {
      const b = document.createElement('canvas'); b.width = this.cv.width; b.height = this.cv.height;
      const cx = b.getContext('2d'), g = this.g, P = this.pal, dpr = this.dpr;
      this.frame(cx);
      const x0 = Math.max(0.5, g.a0 - 6), x1 = Math.min(g.Lg - 0.5, g.a1 + 6), y0 = g.top;
      rrect(cx, x0, y0, x1 - x0, g.tt, g.tt / 2);
      const grd = cx.createLinearGradient(0, y0, 0, y0 + g.tt); grd.addColorStop(0, P.lo); grd.addColorStop(1, P.hi);
      cx.fillStyle = grd; cx.fill();
      cx.save(); rrect(cx, x0, y0, x1 - x0, g.tt, g.tt / 2); cx.clip();                    // a recessed slot: shadow under the top lip
      cx.shadowColor = 'rgba(0,0,0,' + (P.dark ? 0.75 : 0.22) + ')'; cx.shadowBlur = 3 * dpr; cx.shadowOffsetY = 1 * dpr;
      cx.strokeStyle = '#000'; cx.lineWidth = 3; rrect(cx, x0 - 1.5, y0 - 1.5, x1 - x0 + 3, g.tt + 3, g.tt / 2 + 1.5); cx.stroke();
      cx.restore();
      cx.strokeStyle = 'rgba(' + P.ink + ',' + (P.dark ? 0.12 : 0.22) + ')'; cx.lineWidth = 1;
      rrect(cx, x0, y0, x1 - x0, g.tt, g.tt / 2); cx.stroke();
      const pitch = g.span / g.N, sw = Math.max(1, pitch - (pitch >= 3 ? 1 : 0.6)), paths = [new Path2D(), new Path2D(), new Path2D()];
      for (const y of [g.yL, g.yR]) for (let k = 0; k < g.N; k++) paths[this.segCol[k]].rect(g.a0 + k * pitch + (pitch - sw) / 2, y, sw, g.bh);
      cx.globalAlpha = P.off;
      for (let ci = 0; ci < 3; ci++) { cx.fillStyle = P.seg[ci]; cx.fill(paths[ci]); }
      cx.globalAlpha = 1;
      const au = g.a0 + xOf(this.unity, this.max) * g.span;                                  // unity: a notch above and below
      cx.strokeStyle = 'rgba(' + P.ink + ',.6)'; cx.lineWidth = 1.5; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(au, y0 - 4.5); cx.lineTo(au, y0 - 1.5); cx.moveTo(au, y0 + g.tt + 1.5); cx.lineTo(au, y0 + g.tt + 4.5); cx.stroke();
      return b;
    }
    paint() {
      if (!this.size()) return;
      const g = this.g, P = this.pal, dpr = this.dpr, cx = this.cv.getContext('2d');
      if (!this.bg) this.bg = this.paintBg();
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, this.cv.width, this.cv.height); cx.drawImage(this.bg, 0, 0);
      this.frame(cx);
      const st = this.shown = this.state();
      const pitch = g.span / g.N, sw = Math.max(1, pitch - (pitch >= 3 ? 1 : 0.6));
      const paths = [new Path2D(), new Path2D(), new Path2D()], used = [0, 0, 0];
      for (let ch = 0; ch < 2; ch++) {
        const lit = st[ch], pk = st[2 + ch], y = ch ? g.yR : g.yL;
        for (let k = 0; k < g.N; k++) {
          if (k < lit || k === pk) { const ci = this.segCol[k]; paths[ci].rect(g.a0 + k * pitch + (pitch - sw) / 2, y, sw, g.bh); used[ci] = 1; }
        }
      }
      for (let ci = 0; ci < 3; ci++) {
        if (!used[ci]) continue;
        cx.fillStyle = P.seg[ci]; cx.shadowColor = P.seg[ci]; cx.shadowBlur = P.glow * dpr; cx.fill(paths[ci]);
      }
      cx.shadowBlur = 0; cx.shadowColor = 'transparent';
      if (!this.disabled) this.paintThumb(cx);       // no thumb: a meter alone (the control page's rows a mix does not have)
    }
    paintThumb(cx) {
      const g = this.g, P = this.pal, dpr = this.dpr, at = this.thumbAt(), c = g.c, R = g.R;
      cx.save();
      if (this.act) {                                                // held: a glow in its own colour
        cx.shadowColor = P.hot; cx.shadowBlur = 12 * dpr; cx.globalAlpha = P.dark ? 0.5 : 0.8; cx.fillStyle = P.hot;
        disc(cx, at, c, R + 2); cx.fill(); cx.globalAlpha = 1;
      }
      cx.shadowColor = 'rgba(0,0,0,' + (P.dark ? 0.6 : 0.35) + ')'; cx.shadowBlur = 4 * dpr; cx.shadowOffsetY = 1 * dpr;
      cx.fillStyle = P.cap; disc(cx, at, c, R); cx.fill();
      cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
      const hl = cx.createRadialGradient(at - R * 0.35, c - R * 0.45, 0.5, at, c, R);
      hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(0.6, 'rgba(255,255,255,.08)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = hl; disc(cx, at, c, R); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,.28)'; cx.lineWidth = 1; disc(cx, at, c, R - 0.5); cx.stroke();
      cx.strokeStyle = P.dark ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.85)'; cx.lineWidth = 1.5; cx.lineCap = 'round';   // the exact place
      cx.beginPath(); cx.moveTo(at, c - R * 0.5); cx.lineTo(at, c + R * 0.5); cx.stroke();
      cx.restore();
    }
    along(e) { const r = this.el.getBoundingClientRect(); return this.vert ? r.bottom - e.clientY : e.clientX - r.left; }
    setAlong(a, final) { const g = this.g; if (g) this.set(valueAt((a - g.a0) / g.span, this.max), final); }
    down(e) {
      if (this.disabled || this.drag || (e.pointerType === 'mouse' && e.button !== 0) || !this.size()) return;
      const touch = e.pointerType === 'touch', a = this.along(e), at = this.thumbAt();
      const d = this.drag = { id: e.pointerId, touch, x0: e.clientX, y0: e.clientY, a0: a, t0: performance.now(), on: false, off: 0 };
      if (touch) return;                     // a finger: wait to see which way it goes (a vertical one is the page scrolling)
      e.preventDefault();
      try { this.el.setPointerCapture(e.pointerId); } catch (err) {}
      this.ptrFocus = true; try { this.input.focus({ preventScroll: true }); } catch (err) {} this.ptrFocus = false;
      d.on = true; this.active(true);
      if (Math.abs(a - at) <= this.g.R + 2) d.off = at - a;   // on the thumb: it stays where it was under the pointer
      else this.setAlong(a, false);                           // on the track: it goes there
    }
    move(e) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.on) {
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0, al = this.vert ? -dy : dx, ac = this.vert ? dx : dy;
        if (Math.abs(ac) > 8 && Math.abs(ac) >= Math.abs(al)) { this.drag = null; return; }
        if (Math.abs(al) < 5) return;
        d.on = true; d.off = this.thumbAt() - d.a0; this.active(true);   // a finger moves the thumb by its own travel, from anywhere
      }
      this.setAlong(this.along(e) + d.off, false);
    }
    up(e, cancel) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (d.on) { this.active(false); this.emit(true); }
      else if (d.touch && !cancel && performance.now() - d.t0 < 300 && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) this.tapped(e);
    }
    key(e) {
      const k = e.key, x = xOf(this.v, this.max), st = e.shiftKey ? 0.005 : 0.025;   // ~1 dB a press near the top
      let v;
      if (k === 'ArrowRight' || k === 'ArrowUp') v = valueAt(Math.max(x + st, 0.005), this.max);
      else if (k === 'ArrowLeft' || k === 'ArrowDown') v = valueAt(x - st, this.max);
      else if (k === 'PageUp') v = valueAt(x + 0.125, this.max);
      else if (k === 'PageDown') v = valueAt(x - 0.125, this.max);
      else if (k === 'Home') v = this.unity;
      else if (k === 'End') v = this.max;
      else return;
      e.preventDefault(); this.set(v, true);
    }
    fromInput() { this.v = this.clampV((+this.input.value || 0) / 100); this.write(); want(this); this.emit(true); }
  }

  const HOLD_MS = 200, TOUCH_PX = 120, MOUSE_PX = 150;   // a finger: 120 px from centre to one side; a mouse: 150 px
  class Knob extends Ctl {
    constructor(el, o) {
      super(el, o, 'sdk');
      this.detent = o.detent != null ? +o.detent : 0.08;      // the sticky centre (the slider's ±8 of 100)
      el.style.touchAction = 'pan-y';
      const inp = this.input; inp.min = '-100'; inp.max = '100'; inp.step = '1';
      this.v = this.clampV(+o.value || 0); this.pulse = 0; this.pulseAt = 0; this.chargeFrom = 0; this.anim = 0; this.wh = null;
      this.on(el, 'wheel', (e) => this.wheel(e), { passive: false });
      this.write(); want(this);
    }
    clampV(v) { return clamp(isFinite(v) ? Math.round(v * 100) / 100 : 0, -1, 1); }
    homeV() { return 0; }
    snap(raw) { return Math.abs(raw) <= this.detent ? 0 : raw; }
    write() {
      const inp = this.input, s = String(Math.round(this.v * 100)), w = panWords(this.v);
      if (inp.value !== s) inp.value = s;
      inp.setAttribute('aria-valuetext', w);
      this.el.title = (this.o.label || 'Pan') + ': ' + w + (coarse() ? ' · hold, then slide left or right · double-tap for centre' : ' · drag or scroll to turn · double-click for centre');
      if (this.act) this.tipSync();
    }
    tipSync() { this.tip.textContent = panText(this.v); }
    down(e) {
      if (this.disabled || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const touch = e.pointerType === 'touch';
      const d = this.drag = { id: e.pointerId, touch, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, raw: this.v, on: false, t0: performance.now() };
      if (touch) {                           // a finger holds first; the ring fills while it does
        this.holdT = setTimeout(() => this.engage(), HOLD_MS);
        this.chargeFrom = performance.now(); this.animate();
        return;
      }
      e.preventDefault();
      try { this.el.setPointerCapture(e.pointerId); } catch (err) {}
      this.ptrFocus = true; try { this.input.focus({ preventScroll: true }); } catch (err) {} this.ptrFocus = false;
      d.on = true; this.active(true);
    }
    engage() {
      const d = this.drag; this.holdT = 0; this.chargeFrom = 0;
      if (!d || d.on || this.dead) return;
      d.on = true; d.raw = this.v;
      this.el.classList.add('sd-held');
      this.pulse = 1; this.pulseAt = performance.now(); this.animate();
      try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(8); } catch (err) {}
      this.active(true);
    }
    unhold() { clearTimeout(this.holdT); this.holdT = 0; this.chargeFrom = 0; this.drag = null; want(this); }
    move(e) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
      if (!d.on) { if (Math.hypot(d.x - d.x0, d.y - d.y0) > 8) this.unhold(); return; }   // moved before the hold: a scroll or a swipe
      d.raw = clamp(d.raw + (d.touch ? dx / TOUCH_PX : (dx - dy) / MOUSE_PX * (e.shiftKey ? 0.2 : 1)), -1, 1);
      this.set(this.snap(d.raw), false);
    }
    up(e, cancel) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      clearTimeout(this.holdT); this.holdT = 0; this.chargeFrom = 0; this.drag = null;
      this.el.classList.remove('sd-held');
      if (d.on) { this.active(false); this.emit(true); }
      else if (d.touch && !cancel && performance.now() - d.t0 < 300 && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) this.tapped(e);
      want(this);
    }
    wheel(e) {
      if (this.disabled) return;
      if (this.drag) return;
      e.preventDefault();
      const now = performance.now();
      if (!this.wh || now - this.wh.at > 800) this.wh = { raw: this.v, at: now };
      this.wh.at = now;
      const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1;      // lines, pages, pixels
      this.wh.raw = clamp(this.wh.raw + (e.deltaX - e.deltaY) * k * 0.0006, -1, 1);   // a notch (100 px) = 6
      this.active(true);
      this.set(this.snap(this.wh.raw), false);
      clearTimeout(this.whT);
      this.whT = setTimeout(() => { this.active(false); this.emit(true); }, 450);
    }
    key(e) {
      const k = e.key, st = e.shiftKey ? 0.01 : 0.05;
      let v;
      if (k === 'ArrowRight' || k === 'ArrowUp') v = this.v + st;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') v = this.v - st;
      else if (k === 'PageUp') v = this.v + 0.25;
      else if (k === 'PageDown') v = this.v - 0.25;
      else if (k === 'Home') v = 0;
      else return;
      e.preventDefault(); this.set(v, true);
    }
    fromInput() { this.v = this.clampV(this.snap((+this.input.value || 0) / 100)); this.write(); want(this); this.emit(true); }
    animate() {
      if (this.anim || this.dead) return;
      const step = () => {
        this.anim = 0;
        if (this.dead) return;
        if (this.pulse > 0) this.pulse = Math.max(0, 1 - (performance.now() - this.pulseAt) / 260);
        this.paint();
        if (this.pulse > 0 || this.chargeFrom) this.anim = requestAnimationFrame(step);
      };
      this.anim = requestAnimationFrame(step);
    }
    paint() {
      if (!this.size()) return;
      const P = this.pal, cx = this.cv.getContext('2d'), dpr = this.dpr, W = this.W, H = this.H;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
      const S = Math.min(W, H), x = W / 2, y = H / 2, aw = Math.max(2.5, S * 0.07);
      const ro = S / 2 - aw / 2 - 2.5, rb = Math.max(4, ro - aw / 2 - 2.6);
      const A = (v) => -Math.PI / 2 + v * Math.PI * 0.75;          // -1 … +1 = 135° either side of the top
      const hot = this.act, charge = this.chargeFrom ? clamp((performance.now() - this.chargeFrom) / HOLD_MS, 0, 1) : 0;
      cx.lineCap = 'round';
      cx.strokeStyle = 'rgba(' + P.ink + ',' + (P.dark ? 0.16 : 0.2) + ')'; cx.lineWidth = aw;     // the travel
      cx.beginPath(); cx.arc(x, y, ro, A(-1), A(1)); cx.stroke();
      cx.strokeStyle = 'rgba(' + P.ink + ',.55)'; cx.lineWidth = 1.5;                                 // the centre's mark
      cx.beginPath(); cx.moveTo(x, y - ro - aw / 2 - 0.5); cx.lineTo(x, y - ro - aw / 2 - 2.5); cx.stroke();
      if (S >= 34) {                                                                                  // L and R under the ends
        cx.fillStyle = 'rgba(' + P.ink + ',.6)'; cx.font = '600 7px ' + 'ui-sans-serif, -apple-system, Helvetica, Arial';
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText('L', x - ro * 0.42, y + ro + 0.5); cx.fillText('R', x + ro * 0.42, y + ro + 0.5);
      }
      if (charge > 0) {                                                                               // a finger holding: the ring fills
        cx.strokeStyle = P.hot; cx.globalAlpha = (P.dark ? 0.25 : 0.5) + 0.5 * charge; cx.lineWidth = aw;
        cx.beginPath(); cx.arc(x, y, ro, A(-1), A(-1) + charge * Math.PI * 1.5); cx.stroke(); cx.globalAlpha = 1;
      }
      if (Math.abs(this.v) >= 0.005) {                                                                // where it sits: an arc from the top
        cx.save(); if (hot) { cx.shadowColor = P.hot; cx.shadowBlur = 8 * dpr; }
        cx.strokeStyle = P.arc; cx.lineWidth = aw; cx.beginPath();
        if (this.v > 0) cx.arc(x, y, ro, A(0), A(this.v)); else cx.arc(x, y, ro, A(this.v), A(0));
        cx.stroke(); cx.restore();
      }
      if (hot) {                                                                                      // turning: it glows
        cx.save(); cx.shadowColor = P.hot; cx.shadowBlur = 10 * dpr; cx.strokeStyle = P.hot; cx.lineWidth = P.dark ? 2 : 3;
        disc(cx, x, y, rb + 1.5); cx.stroke(); cx.restore();
        if (!P.dark) { cx.strokeStyle = 'rgba(' + P.ink + ',.55)'; cx.lineWidth = 1; disc(cx, x, y, rb + 3.5); cx.stroke(); }   // lime on paper: an ink edge so it reads
      }
      if (this.pulse > 0) {                                                                           // the hold took: a ring goes out
        cx.strokeStyle = P.hot; cx.globalAlpha = this.pulse; cx.lineWidth = 2;
        disc(cx, x, y, rb + 1.5 + (1 - this.pulse) * (ro - rb + 1)); cx.stroke(); cx.globalAlpha = 1;
      }
      const rB = rb * (1 + 0.07 * this.pulse);
      cx.save();
      cx.shadowColor = 'rgba(0,0,0,' + (P.dark ? 0.6 : 0.3) + ')'; cx.shadowBlur = 3 * dpr; cx.shadowOffsetY = 1 * dpr;
      const bg = cx.createLinearGradient(0, y - rB, 0, y + rB);
      bg.addColorStop(0, P.dark ? P.k1 : P.k0); bg.addColorStop(1, P.dark ? P.k0 : P.k1);
      cx.fillStyle = bg; disc(cx, x, y, rB); cx.fill(); cx.restore();
      cx.strokeStyle = 'rgba(' + P.ink + ',' + (P.dark ? 0.3 : 0.35) + ')'; cx.lineWidth = 1; disc(cx, x, y, rB - 0.5); cx.stroke();
      const a = A(this.v);                                                                            // the pointer
      cx.strokeStyle = hot && P.dark ? P.hot : P.text; cx.lineWidth = 2.2;
      cx.beginPath(); cx.moveTo(x + Math.cos(a) * rB * 0.2, y + Math.sin(a) * rB * 0.2); cx.lineTo(x + Math.cos(a) * rB * 0.82, y + Math.sin(a) * rB * 0.82); cx.stroke();
    }
  }

  window.SdawFader = { create: (el, o) => new Fader(el, o || {}), of: (el) => { const i = byEl.get(el); return i instanceof Fader ? i : null; }, xOf, valueAt, dbText };
  window.SdawKnob = { create: (el, o) => new Knob(el, o || {}), of: (el) => { const i = byEl.get(el); return i instanceof Knob ? i : null; }, panText, panWords };
})();

(function () {
  'use strict';
  const box = document.getElementById('demoDaw');
  if (!box || !window.WebSocket || box.__sdemo) return;
  box.__sdemo = true;
  const LANES = {"groove": "000000000000000000067868817181758672828385677737766776767275866485738005866766667566767281748757676670018176757586676766727581748175848283767574817777758473847485777775833222288111111881000008810000018080818000000687776875777769776777697277775978886769775585897767776978418888800000000000", "bass": "000000000000000000017473776787688888886730000000000000000000000000000000666677677767756576667666666647687666887889868585766786777678878876668778888685847668787988786887888876678887666678776655888876578887887677774294885688758856868777558875899956788857887388767763785788888888777765543210", "keys": "000000000000000000000000988876659776555431000000000000000000000000000000000000000000000000000000000000002221222222222221111111112222211122122222222222211111112222222113877544458776554486665554444432248755765565445322444444444444444444444443444434444444444444444444444444444443434453645252", "guitars": "000000145455545454545543777665657655666554455454545454545454545464745002644555545453545454545454555540006445555454534475655464544565657964455454545354545454545454545556876655478765544576555454444355668766765356665521443334443343334334434443333333344343344443444444333434434344443433320011", "strings": "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044520003794756634532113675567785353357643434677326320011111000000000000", "vox": "000000000000000000000000000000000000000476676516666627674776777755541566377755667766411577656677655510046666641676572667666656764566165658676667787854566767654676451166732267665335767677456324777765767656632375611464954877667411000395666767751110048775851477777777777772148667741110000000"};
  const THEME_CSS = "/* StreamDAW — one look, dark and bright (2026-10-06; meters light in the bright one, 10-07).\n   The \"Stage\" look chosen by Ori: paper and ink, a lime \"on\" colour, a hot pink for what\n   needs attention, the Snowstar blue for links. Every page links this file and uses only\n   these tokens; html[data-theme] is set by theme.js (device setting first, then the\n   person's own choice, remembered on that device). */\n.stu, .stu[data-theme=\"light\"] {\n  --bg: #efe9da;  --panel: #f7f3e8;  --panel2: #e6dfcd;  --field: #fbf8f0;\n  --ink: #16140f; --dim: #6f6a5c;    --faint: #a59f8c;\n  --line: #16140f; --soft: #d3cbb6;\n  --lime: #c8f23a; --lime-ink: #1d2a00;\n  --hot: #e0164f;  --hot-ink: #ffffff;\n  --blue: #1c2be0; --ok: #23864a;    --warn: #b06a00;\n  --meter: #16140f; --shadow: 0 1px 0 rgba(22,20,15,.08);\n  --vu-hi: #fdfbf4; --vu-lo: #e8e1cf; --vu-ink: 22, 20, 15; --vu-edge: 255, 255, 255;   /* the meters: a light face */\n  --vu-g: #1d9a4a; --vu-y: #d29a00; --vu-r: #e02f3a; --vu-off: .16; --vu-glow: 2;\n  /* The leather: Ori's amp tolex, one seamless tile (site/snowstar/demo/leather-make.py), with a\n     soft light from the top left. --amp: the phone's play card; --amp-wall: the app's middle. */\n  --amp: linear-gradient(155deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,.06) 32%, rgba(0,0,0,0) 58%, rgba(0,0,0,.08) 100%), #e7e1d4 url(demo/leather-light.jpg?v=02726ec0) 0 0 / 330px auto repeat;\n  --amp-wall: linear-gradient(rgba(239,233,218,.25), rgba(239,233,218,.25)), #e7e1d4 url(demo/leather-light.jpg?v=02726ec0) 0 0 / 330px auto repeat;\n  --amp-ink: #16140f; --amp-sub: rgba(22,20,15,.7); --amp-edge: #6f6556; --amp-text: 0 1px 0 rgba(255,255,255,.45);\n  --amp-glow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 0 0 3px rgba(0,0,0,.08), 0 10px 24px -16px rgba(40,30,10,.55);\n  --pop-shadow: 0 10px 30px -10px rgba(0,0,0,.35);\n  --screen-bg: #000;   /* behind a picture made big (both themes) */\n  /* The invite card (the QR over the listener page, 2026-10-10): the link preview's look, dark\n     leather in both themes, so these are not redefined for the dark one. */\n  --inv-ink: #f3eddc; --inv-sub: rgba(243,237,220,.82); --inv-dim: rgba(243,237,220,.62); --inv-fine: rgba(243,237,220,.55);\n  --inv-line: rgba(243,237,220,.38); --inv-hover: rgba(243,237,220,.08); --inv-veil: rgba(8,7,5,.62); --inv-edge: #000; --inv-tile: #fff;\n  --inv-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -20px rgba(0,0,0,.8); --inv-tile-shadow: 0 10px 30px -12px rgba(0,0,0,.7);\n  --inv-wall: linear-gradient(155deg, rgba(255,255,255,.08) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,.3) 100%), #12110e url(demo/leather-dark.jpg?v=4b6aaf55) 0 0 / 330px auto repeat;\n  --head: \"Fraunces\", Georgia, \"Times New Roman\", serif;\n  --sans: \"Inter\", -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Arial, sans-serif;\n  --mono: ui-monospace, \"SF Mono\", Menlo, monospace;\n  color-scheme: light;\n}\n.stu[data-theme=\"dark\"] {\n  --bg: #12110e;  --panel: #1b1a16;  --panel2: #26241e;  --field: #15140f;\n  --ink: #f3eddc; --dim: #a39d8a;    --faint: #6a6556;\n  --line: #5b574a; --soft: #34322a;\n  --lime: #c8f23a; --lime-ink: #1d2a00;\n  --hot: #ff5c8a;  --hot-ink: #1a0610;\n  --blue: #8c96ff; --ok: #5fd38a;    --warn: #f0b04a;\n  --meter: #f3eddc; --shadow: none;\n  --vu-hi: #1d1c18; --vu-lo: #0c0b09; --vu-ink: 232, 226, 207; --vu-edge: 255, 255, 255;  /* the meters: dark hardware */\n  --vu-g: #44d36e; --vu-y: #f4c430; --vu-r: #ff4b4b; --vu-off: .11; --vu-glow: 6;\n  --amp: linear-gradient(155deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.025) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.22) 100%), #12110e url(demo/leather-dark.jpg?v=4b6aaf55) 0 0 / 330px auto repeat;\n  --amp-wall: linear-gradient(rgba(0,0,0,.62), rgba(0,0,0,.62)), linear-gradient(rgba(18,17,14,.2), rgba(18,17,14,.2)), #12110e url(demo/leather-dark.jpg?v=4b6aaf55) 0 0 / 330px auto repeat;   /* 2026-10-10, Ori: darker; his example is 38 % of the light it had: black at .62 over what it was */\n  --amp-ink: #f3eddc; --amp-sub: rgba(243,237,220,.7); --amp-edge: #000; --amp-text: 0 1px 2px rgba(0,0,0,.55);\n  --amp-glow: inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 0 3px rgba(0,0,0,.25), 0 10px 24px -14px rgba(0,0,0,.6);\n  --pop-shadow: 0 10px 30px -10px rgba(0,0,0,.55);\n  color-scheme: dark;\n}\n\n/* The StreamDAW wordmark, in the ink of whichever theme is on: the PNG is used as a mask. */\n.stu .wordmark { display: inline-block; width: 150px; height: 15px; background: var(--ink);\n  -webkit-mask: url(demo/streamdaw-wordmark.png) left center / contain no-repeat;\n          mask: url(demo/streamdaw-wordmark.png) left center / contain no-repeat; }\n.stu .theme-btn { appearance: none; border: 1px solid var(--line); background: transparent; color: var(--ink);\n  border-radius: 999px; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;\n  cursor: pointer; font: 14px var(--sans); padding: 0; }\n.stu .theme-btn::before { content: \"\\263E\"; }                          /* a moon: switch to dark */\n.stu[data-theme=\"dark\"] .theme-btn::before { content: \"\\2600\"; }  /* a sun: switch to bright */\n";
  const LEVELS_URL = "demo/levels.bin?v=0bc4986d";
  const BPM = 94, BAR = 240 / BPM, BARS = 36, DUR = 92;
  const PAIRS = [
    { id: 'master', name: 'Master', pr: '1/2' },
    { id: 'groove', name: 'GROOVE', c: '#f2e43c', pr: '3/4', t: 0 }, { id: 'bass', name: 'BASS', c: '#5ce3d6', pr: '5/6', t: 1 },
    { id: 'keys', name: 'KEYS', c: '#f0393d', pr: '7/8', t: 2 }, { id: 'guitars', name: 'GUITARS', c: '#2f52c4', pr: '9/10', t: 3 },
    { id: 'strings', name: 'STRINGS', c: '#ffa47c', pr: '11/12', t: 4 }, { id: 'vox', name: 'VOX', c: '#7fe36c', pr: '13/14', t: 5 },
    { id: 'guide', name: 'GUIDE', c: '#f4f4f4', pr: '15/16', t: 6 }, { id: 'click', name: 'CLICK', c: '#f4f4f4', pr: '17/18', t: 7 },
  ];
  const STEMS = PAIRS.filter((p) => p.t != null);
  const ROOM = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const WSQ = LOCAL ? new URLSearchParams(location.search).get('ws') : '';
  const WS_BASE = WSQ || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  const PHONE_URL = new URL('streamdaw-demo.html?room=' + ROOM + (WSQ ? '&ws=' + encodeURIComponent(WSQ) : ''), location.href).href;
  const store = { get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r) => (r || box).querySelector(s);
  const $$ = (s, r) => [...(r || box).querySelectorAll(s)];
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  const css = document.createElement('style');
  css.textContent = THEME_CSS + `
  .stu{position:relative;container:stu/inline-size;background:var(--bg);color:var(--ink);font:13px/1.35 var(--sans);text-align:left;border:1px solid #000;border-radius:14px;overflow:hidden;
    box-shadow:0 40px 80px -40px rgba(23,20,13,.55),0 2px 0 rgba(23,20,13,.04);-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  .stu[data-theme="dark"]{--fader-dark:1} .stu[data-theme="light"]{--fader-dark:0}
  .stu *{box-sizing:border-box;margin:0}
  .stu button{font:inherit;color:inherit}
  .stu .d{color:var(--dim)} .stu .mono{font-family:var(--mono);font-size:12px}
  .stu .h{font-family:var(--head);font-weight:500}
  .stu .sp{flex:1}
  /* the DAW: Live's window, its transport and the arrangement (always Live's own grey) */
  .stu .sx-host{display:flex;align-items:center;gap:8px;height:46px;padding:0 10px;background:#262626;color:#d9d9d9;border-bottom:1px solid #000;font:500 12px/1 var(--sans)}
  .stu .sx-dots{display:flex;gap:6px;flex:none}.stu .sx-dots i{width:10px;height:10px;border-radius:50%;background:#4d4d4d}
  .stu .sx-title{font-weight:600;letter-spacing:.06em;color:#9a9a9a;font-size:11px;white-space:nowrap;margin:0 4px}
  .stu .sx-tb{appearance:none;border:1px solid #111;background:#333;color:#e8e8e8;width:30px;height:26px;border-radius:5px;cursor:pointer;display:grid;place-items:center;font-size:12px;padding:0;flex:none}
  .stu .sx-tb:hover{background:#3d3d3d}.stu .sx-tb.on{background:#7be35a;color:#102300;border-color:#0d0d0d}
  .stu .sx-f{background:#161616;border:1px solid #0d0d0d;border-radius:4px;padding:6px 7px;font:500 11.5px/1 var(--mono);color:#e8e8e8;min-width:42px;text-align:center;flex:none;white-space:nowrap}
  .stu .sx-lanes{flex:1;min-width:60px;position:relative;height:34px;cursor:pointer;border-radius:4px;overflow:hidden;background:#1b1b1b;border:1px solid #0d0d0d}
  .stu .sx-lanes canvas{display:block;width:100%;height:100%}
  .stu .sx-ph{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.6);left:0;pointer-events:none}
  /* the control page's top bar */
  .stu .sx-top{height:50px;padding:0 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .stu .sx-wm{display:inline-block;flex:0 1 128px;min-width:80px;height:14px;background:var(--ink);-webkit-mask:url(demo/streamdaw-wordmark.png) left center/contain no-repeat;mask:url(demo/streamdaw-wordmark.png) left center/contain no-repeat}
  .stu .sx-sess{font:12px var(--mono);border:1px solid var(--line);border-radius:999px;padding:4px 12px;flex:none}
  .stu .sx-counts{color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
  .stu .pill{appearance:none;background:transparent;border:1px solid var(--line);border-radius:999px;height:28px;padding:0 12px;cursor:pointer;white-space:nowrap;color:var(--ink);
    font:500 13px/1 var(--sans);display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none}
  .stu .pill:hover{background:var(--panel2)} .stu .pill:disabled{opacity:.42;cursor:default;background:transparent}
  .stu .pill.ink{background:var(--ink);color:var(--bg)} .stu .pill.lime{background:var(--lime);color:var(--lime-ink);border-color:var(--line)}
  .stu .pill.sm{height:22px;padding:0 9px;font-size:12px} .stu .pill.icon{width:28px;padding:0}
  .stu .pill svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .stu .onair{min-width:116px;font-weight:600;letter-spacing:.05em}
  .stu .bars{display:inline-flex;align-items:center;gap:2px;height:12px}
  .stu .bars i{width:2px;height:100%;border-radius:1px;background:currentColor;animation:sxbar 1s ease-in-out infinite}
  .stu .bars i:nth-child(2){animation-delay:-.35s}.stu .bars i:nth-child(3){animation-delay:-.7s}.stu .bars i:nth-child(4){animation-delay:-.2s}
  @keyframes sxbar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
  .stu .theme-btn{flex:none}
  /* the three columns */
  .stu .sx-main{display:grid;grid-template-columns:110px minmax(0,1fr) 216px;min-height:530px}   /* Stream and Analytics the same height: the page does not jump */
  .stu .sx-rail{border-right:1px solid var(--line);padding:12px 8px;display:flex;flex-direction:column;gap:3px}
  .stu .nv{appearance:none;border:0;background:transparent;text-align:left;padding:7px 10px;border-radius:999px;color:var(--dim);cursor:pointer}
  .stu .nv:hover{color:var(--ink)} .stu .nv.on{background:var(--ink);color:var(--bg)}
  .stu .sx-rail .who{margin-top:auto;padding:0 10px;font-size:11px;color:var(--dim);white-space:nowrap}
  .stu .sx-mid{background:var(--amp-wall);min-width:0;display:flex;flex-direction:column}
  .stu .sx-vu{height:86px;margin:12px 16px 0;display:flex;justify-content:center;flex:none}
  .stu .sx-vu canvas{display:block;width:min(100%,380px);height:100%}
  .stu .sx-center{padding:10px 16px 14px;min-width:0}
  .stu .sx-side{border-left:1px solid var(--line);padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}
  .stu .sx-bottom{height:30px;padding:0 12px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--dim);white-space:nowrap}
  .stu .sx-bottom b{color:var(--ink);font-weight:500}
  .stu .sx-bottom .r{font-family:var(--mono);font-size:11px}
  /* Stream */
  .stu .sec-h{display:flex;align-items:center;gap:10px;margin-bottom:8px;min-height:30px}
  .stu .sec-h .h{font-size:20px}
  .stu .seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px;gap:2px;background:var(--panel);flex:none;max-width:100%;overflow:hidden}
  .stu .seg button{appearance:none;border:0;background:transparent;color:var(--ink);padding:5px 11px;border-radius:999px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
  .stu .seg button.on{background:var(--ink);color:var(--bg)}
  .stu .sx-tabs{display:none}
  .stu .sw{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
  .stu .sw i{width:32px;height:18px;border-radius:9px;border:1px solid var(--line);position:relative;background:var(--lime);flex:none}
  .stu .sw i::after{content:"";position:absolute;left:16px;top:2px;width:12px;height:12px;border-radius:50%;background:#16140f}
  .stu .mixbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
  .stu .mixbar .note{font-size:12px;color:var(--amp-sub);text-shadow:var(--amp-text)}
  .stu .hostmix{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:36px;padding:4px 0;border-top:1px solid var(--soft)}
  .stu .hostmix .hm-t{font-weight:600;white-space:nowrap;margin-right:2px}
  .stu .hostmix .hm-gap{flex:1}
  .stu .hostmix .pill.on[data-a="all"][data-k="s"]{background:var(--lime);color:var(--lime-ink);border-color:var(--line)}
  .stu .hostmix .pill.on[data-a="all"][data-k="m"]{background:var(--hot);color:var(--hot-ink);border-color:var(--hot)}
  .stu .editbtn.on{background:var(--ink);color:var(--bg)}
  .stu .row{display:grid;align-items:center;gap:9px;min-height:32px;border-top:1px solid var(--soft)}
  .stu .row.sends{grid-template-columns:16px 40px minmax(56px,1fr) 8px minmax(84px,1.5fr) 24px 24px 28px}
  .stu .tk{width:16px;height:16px;border:1px solid var(--line);background:var(--lime)}
  .stu .pc{color:var(--dim);font:12px var(--mono);white-space:nowrap}
  .stu .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .stu .dot{width:8px;height:8px;border-radius:50%;background:transparent}.stu .dot.on{background:var(--ok)}
  .stu .row .fm{display:block;height:22px;min-width:0;width:100%;max-width:230px;justify-self:end}
  .stu .row .kn{display:block;width:28px;height:28px}
  .stu .mb{appearance:none;width:24px;height:22px;padding:0;border:1px solid var(--line);border-radius:5px;background:transparent;color:var(--ink);font:600 10.5px var(--mono);cursor:pointer}
  .stu .mb.s.on{background:var(--lime);color:var(--lime-ink);border-color:var(--lime)} .stu .mb.m.on{background:var(--hot);color:var(--hot-ink);border-color:var(--hot)}
  .stu .mb:disabled{opacity:.3;cursor:default}
  .stu .row.rest .nm{color:var(--faint)}
  /* the desk: dark hardware in both themes */
  .stu .desk{display:flex;gap:6px;overflow-x:auto;padding:8px 2px 10px;scrollbar-width:thin}
  .stu .desk .strip{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 62px;border:1px solid #000;border-radius:10px;padding:8px 5px 9px;
    background:linear-gradient(180deg,#34322d 0%,#24221e 55%,#1b1a17 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 14px -8px rgba(0,0,0,.7);color:#e9e3d2;border-top:1px solid #000}
  .stu .strip .pr{font:10px var(--mono);color:#a8a190}
  .stu .strip .dot{align-self:flex-end;margin:-14px 0 0}
  .stu .strip .lm{display:block;width:28px;height:150px;margin:0 auto}
  .stu .strip .kn{display:block;width:28px;height:28px;margin:0 auto}
  .stu .desk .strip .lm,.stu .desk .strip .kn{--fader-dark:1;--vu-hi:#1d1c18;--vu-lo:#0c0b09;--vu-ink:232,226,207;--vu-g:#44d36e;--vu-y:#f4c430;--vu-r:#ff4b4b;--vu-off:.11;--vu-glow:6;--ink:#f3eddc;--field:#15140f;--panel2:#26241e}
  .stu .strip .sn{width:100%;text-align:center;font:600 10.5px var(--sans);letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:3px 2px;border-radius:4px;background:#0f0e0c;color:#f3eddc}
  .stu .strip .sbtn{width:100%;height:22px;border-radius:5px;border:1px solid #000;background:linear-gradient(#d6f55c,#b9df2f);color:#1d2a00;font:700 10px/20px var(--sans);letter-spacing:.12em;text-align:center;box-shadow:0 0 8px rgba(200,242,58,.4)}
  .stu .desk .strip .msm{display:flex;gap:4px;width:100%}
  .stu .desk .strip .mb{flex:1;width:auto;height:21px;border-color:#000;background:linear-gradient(#3b3934,#2a2824);color:#a8a190}
  .stu .desk .strip .mb.s.on{background:linear-gradient(#d6f55c,#b9df2f);color:#1d2a00} .stu .desk .strip .mb.m.on{background:linear-gradient(#ff7aa0,#e0164f);color:#fff}
  .stu .desk .hoststrip{display:flex;flex-direction:column;align-items:stretch;gap:6px;flex:0 0 96px;border:1px solid #000;border-radius:10px;padding:8px 6px 10px;
    background:linear-gradient(180deg,#34322d 0%,#24221e 55%,#1b1a17 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 14px -8px rgba(0,0,0,.7)}
  .stu .hoststrip .hm-t{font:700 10px var(--sans);letter-spacing:.12em;text-transform:uppercase;color:#a8a190;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stu .hoststrip .hb{appearance:none;height:25px;border-radius:5px;border:1px solid #000;background:linear-gradient(#3b3934,#2a2824);color:#e9e3d2;font:700 9px var(--sans);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;padding:0 2px}
  .stu .hoststrip .hb.gap{margin-top:6px}
  .stu .hoststrip .hb.on[data-k="s"]{background:linear-gradient(#d6f55c,#b9df2f);color:#1d2a00;box-shadow:0 0 8px rgba(200,242,58,.45)}
  .stu .hoststrip .hb.on[data-k="m"]{background:linear-gradient(#ff7aa0,#e0164f);color:#fff;box-shadow:0 0 8px rgba(224,22,79,.45)}
  .stu .hoststrip .hb.editbtn.on{background:linear-gradient(#f3eddc,#d9d2bf);color:#16140f}
  .stu .hoststrip .hb:disabled{opacity:.4;cursor:default}
  .stu .hoststrip .hm-st{font:10px var(--sans);color:#a8a190;text-align:center;margin-top:auto}
  .stu .strip.rest .sn{color:#6a6556}
  /* Edit: a light per row, green shown, red hidden, blinking slowly */
  .stu .vis{appearance:none;display:none;width:12px;height:12px;padding:0;border-radius:50%;border:1px solid rgba(0,0,0,.45);cursor:pointer;
    background:radial-gradient(circle at 35% 35%,#c9ffd9,#44d36e 55%,#1f8a43);box-shadow:0 0 7px rgba(68,211,110,.75);animation:sxvis 2.6s ease-in-out infinite}
  .stu .hid .vis{background:radial-gradient(circle at 35% 35%,#ffd0d0,#ff4b4b 55%,#a51d1d);box-shadow:0 0 7px rgba(255,75,75,.75)}
  @keyframes sxvis{0%,100%{opacity:1}50%{opacity:.38;box-shadow:none}}
  .stu .editing .vis{display:block}
  .stu .editing .row.sends{grid-template-columns:12px 16px 40px minmax(56px,1fr) 8px minmax(84px,1.5fr) 24px 24px 28px}
  .stu .editing .strip .vis{align-self:center}
  .stu .rows:not(.editing) .hid{display:none}
  .stu .editing .hid > :not(.vis){opacity:.32}
  /* Listening, and the invite (the QR code in the invite card's look) */
  .stu .sx-side .h{font-size:16px}
  .stu .person{display:flex;align-items:center;gap:7px;height:30px}
  .stu .person .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
  .stu .person .n:hover{text-decoration:underline}
  .stu .person.off .n{color:var(--dim)}
  .stu .person.pick .n{font-weight:600}
  .stu .ptime{font:11px var(--mono);color:var(--dim);flex:none}
  .stu .pbs{display:inline-flex;gap:3px;flex:none}
  .stu .pb{width:20px;height:20px;border-radius:6px;border:1px solid var(--soft);color:var(--faint);display:inline-flex;align-items:center;justify-content:center}
  .stu .pb svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .stu .cta{line-height:1.5;color:var(--dim);margin:2px 0 6px}
  .stu .inv{margin-top:6px;border-radius:16px;padding:14px 12px 12px;text-align:center;color:var(--inv-ink);background:var(--inv-wall);border:1px solid var(--inv-edge);box-shadow:var(--inv-shadow);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
  .stu .inv .ih{font:600 21px/1.05 var(--head);letter-spacing:-.01em}
  .stu .inv .is{font:400 12.5px/1.3 var(--head);color:var(--inv-sub);margin:4px 0 10px}
  .stu .qtile{position:relative;overflow:hidden;background:var(--inv-tile);border-radius:12px;padding:8px;width:min(100%,170px);margin:0 auto;box-shadow:var(--inv-tile-shadow)}
  .stu .qtile svg{display:block;width:100%;height:auto}
  .stu .inv .il{color:var(--lime);font:500 12px/1.3 var(--sans);margin:10px 0 0}
  .stu .sx-sheet{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--inv-veil);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
  .stu .sx-sheet[hidden]{display:none}
  .stu .sx-sheet .inv{position:relative;width:min(330px,100%);padding:22px 20px 18px}
  .stu .sx-sheet .qtile{width:min(220px,62vw);padding:10px}
  .stu .sx-sheet .iw{display:block;width:140px;height:15px;margin:0 auto 14px;background:var(--inv-ink);-webkit-mask:url(demo/streamdaw-wordmark.png) center/contain no-repeat;mask:url(demo/streamdaw-wordmark.png) center/contain no-repeat}
  .stu .sx-sheet .ih{font-size:28px}
  .stu .qb{appearance:none;border:1px solid var(--inv-line);background:transparent;color:var(--inv-ink);border-radius:999px;padding:8px 15px;font:500 13px/1 var(--sans);cursor:pointer;margin-top:12px}
  .stu .qb:hover{background:var(--inv-hover)}
  .stu .qx{position:absolute;right:10px;top:8px;appearance:none;border:0;background:transparent;color:var(--inv-dim);font:300 26px/1 var(--sans);cursor:pointer;padding:2px 8px}
  /* Analytics */
  .stu .an{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
  .stu .anc{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:12px 14px}
  .stu .anc .t{display:flex;align-items:center;gap:8px;font:500 16px var(--head);margin-bottom:8px}
  .stu .anc .t .d{font:12px var(--sans)}
  .stu .nums{display:flex;gap:18px;flex-wrap:wrap}
  .stu .nums b{display:block;font:600 22px/1.1 var(--sans)}
  .stu .nums span{font-size:11.5px;color:var(--dim)}
  .stu .spark{display:flex;align-items:flex-end;gap:1px;height:36px;margin-top:10px;border-bottom:1px solid var(--soft)}
  .stu .spark i{flex:1;background:var(--lime);opacity:.8;min-height:0}
  .stu .axis{display:flex;justify-content:space-between;font:10.5px var(--mono);color:var(--dim);margin-top:3px}
  .stu .lub{position:relative;height:16px;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--field)}
  .stu .lub i{position:absolute;left:0;top:0;bottom:0;background:var(--lime);width:0;transition:width .1s linear}
  .stu .lub u{position:absolute;top:0;bottom:0;width:1px;background:var(--dim)}
  .stu .lub b{position:absolute;top:-1px;bottom:-1px;width:2px;margin-left:-1px;background:var(--ink)}
  .stu .lus{position:relative;height:14px;font:10.5px var(--mono);color:var(--dim);margin:3px 0 8px}
  .stu .lus span{position:absolute;white-space:nowrap}
  .stu .lus em{position:absolute;font-style:normal;color:var(--ink);transform:translateX(-50%)}
  .stu .lun{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 10px}
  .stu .lun span{display:block;font-size:11px;color:var(--dim)}
  .stu .lun b{font:600 17px/1.2 var(--sans)} .stu .lun small{font-size:11px;color:var(--dim)}
  /* a short word at the bottom of the window */
  .stu .sx-toast{position:absolute;left:50%;bottom:42px;z-index:30;transform:translate(-50%,8px);opacity:0;pointer-events:none;max-width:calc(100% - 32px);
    background:var(--ink);color:var(--bg);font:500 12.5px/1.35 var(--sans);padding:8px 13px;border-radius:999px;transition:opacity .25s,transform .25s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stu .sx-toast.show{opacity:1;transform:translate(-50%,0)}
  .stu :focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  @media (prefers-reduced-motion:reduce){.stu .bars i,.stu .vis{animation:none}.stu .sx-toast,.stu .inv{transition:none}}
  /* narrower windows: the rail becomes a switch over the middle; then the people go under it */
  @container stu (max-width:899px){
    .stu .sx-main{grid-template-columns:minmax(0,1fr) 176px} .stu .sx-rail{display:none} .stu .sx-side{padding:12px 10px} .stu .sx-tabs{display:inline-flex}
    .stu .sx-title,.stu .sx-counts,.stu .pbs{display:none} .stu .sx-tabs + .h{display:none}
  }
  @container stu (max-width:560px){
    .stu .sx-main{grid-template-columns:minmax(0,1fr);min-height:0} .stu .sx-side{border-left:0;border-top:1px solid var(--line)}
    .stu .sx-f[data-f="bbs"],.stu .sx-dots,.stu .viewseg,.stu .sx-sess,.stu [data-a="copy"]{display:none}
    .stu .row.sends{grid-template-columns:16px 34px minmax(52px,1fr) 8px minmax(70px,1.2fr) 24px 24px 28px}
    .stu .sx-bottom .c{display:none}
  }`;
  document.head.appendChild(css);

  let theme = store.get('sdemo_theme', 'dark') === 'light' ? 'light' : 'dark';
  let view = store.get('sdemo_view', 'list') === 'mixer' ? 'mixer' : 'list';
  let section = 'stream';
  const ICON = {
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M17 21h4v-4M14 21v-3"/></svg>',
    mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    cam: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>',
    scr: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  };
  box.className = 'stu';
  box.setAttribute('data-theme', theme);
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'StreamDAW demo: KAYMA, MAMA');
  box.innerHTML =
    '<div class="sx-host"><span class="sx-dots" aria-hidden="true"><i></i><i></i><i></i></span><b class="sx-title">KAYMA — MAMA</b>'
    + '<button class="sx-tb" data-a="play" aria-label="Play">&#9654;&#xFE0E;</button><button class="sx-tb" data-a="stop" aria-label="Stop" title="Stop. Twice: back to the start">&#9632;</button>'
    + '<span class="sx-f" data-f="bbs">1. 1. 1</span><span class="sx-f" data-f="time">0:00</span>'
    + '<div class="sx-lanes" title="Click to jump: every phone follows"><canvas></canvas><div class="sx-ph"></div></div></div>'
    + '<div class="sx-top"><span class="sx-wm" role="img" aria-label="StreamDAW"></span><span class="sx-sess">mama</span><span class="sx-counts"></span><span class="sp"></span>'
    + '<button class="pill" data-a="copy" title="Copy the listen link">' + ICON.link + 'Copy link</button>'
    + '<button class="pill icon" data-a="qr" aria-label="QR code" title="QR code">' + ICON.qr + '</button>'
    + '<button class="theme-btn" data-a="theme" aria-label="Switch dark and bright" title="Dark / bright"></button>'
    + '<button class="pill onair ink" data-a="live">GO LIVE</button></div>'
    + '<div class="sx-main"><nav class="sx-rail"><button class="nv on" data-s="stream">Stream</button><button class="nv" data-s="analytics">Analytics</button><div class="who">StreamDAW 0.5</div></nav>'
    + '<div class="sx-mid"><div class="sx-vu"><canvas aria-label="Level of what is sent"></canvas></div><div class="sx-center"></div></div>'
    + '<aside class="sx-side" aria-label="Listening"></aside></div>'
    + '<div class="sx-bottom"><span>StreamDAW Audio</span><span class="sp"></span><span class="c">powered by <b>snowstar.company</b></span><span class="sp"></span><span class="r" data-lufs>48.0 kHz</span></div>'
    + '<div class="sx-sheet" hidden role="dialog" aria-label="Scan to join this session"><div class="inv"><button class="qx" data-a="qrclose" aria-label="Close">&times;</button>'
    + '<span class="iw" role="img" aria-label="StreamDAW"></span><div class="ih">You\'re invited</div><div class="is">to <b>mama</b>, a remote studio session</div>'
    + '<div class="qtile" data-qr></div><div class="il">Listen live · in time · in your own mix</div><button class="qb" data-a="copy">Copy link</button></div></div>'
    + '<div class="sx-toast" role="status" aria-live="polite"></div>';
  const lanes = $('.sx-lanes'), cv = $('.sx-lanes canvas'), ph = $('.sx-ph'), center = $('.sx-center'), side = $('.sx-side');
  const f1 = $('[data-f="bbs"]'), f2 = $('[data-f="time"]');

  const vu = window.SdawVU ? SdawVU.create($('.sx-vu canvas'), { pal: { dark: { f0: '#f3eddc', f1: '#d4cdb8', glow: 'rgba(200,242,58,.30)', vig: 'rgba(18,17,14,.32)',
    red: '#e0164f', lamp: [255, 92, 138], lampHi: '#ffd6e2', lampOff: ['#6e2a3c', '#24090f'] } } }) : null;

  function drawLanes() {
    const w = lanes.clientWidth, h = lanes.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, h);
    const bx = (b) => (b / BARS) * w, L = (h - 2) / STEMS.length;
    g.fillStyle = '#2a2a2a'; for (let b = 4; b < BARS; b += 4) g.fillRect(Math.round(bx(b)), 0, 1, h);
    STEMS.forEach((t, i) => {
      const top = 1 + i * L + 0.5, ch = Math.max(1, L - 1);
      g.fillStyle = t.c;
      if (t.id === 'guide') { for (const [b0, b1] of [[0, 1], [4, 5]]) g.fillRect(bx(b0) + 1, top, bx(b1) - bx(b0) - 2, ch); return; }
      if (t.id === 'click') { g.globalAlpha = 0.55; g.fillRect(1, top, w - 2, ch); g.globalAlpha = 1; return; }
      const env = LANES[t.id] || '';
      let start = env.search(/[1-9]/), end = env.length - [...env].reverse().join('').search(/[1-9]/);
      if (start < 0) { start = 0; end = 0; }
      const per = BARS / Math.max(1, env.length);
      if (t.id === 'strings') { start = 27 / per; end = 35 / per; }
      for (let k = start; k < end; k++) {
        const v = (+env[k] || (t.id === 'strings' ? 3 : 0)) / 9;
        g.globalAlpha = 0.45 + 0.55 * v; g.fillRect(bx(k * per), top, bx(per) + 0.5, ch);
      }
      g.globalAlpha = 1;
    });
  }
  drawLanes();
  if (window.ResizeObserver) new ResizeObserver(() => drawLanes()).observe(lanes); else addEventListener('resize', drawLanes);

  let LV = null, LVT = 8, LVF = 0, LVW = 19, lvAsked = false;
  function loadLevels() {
    if (lvAsked) return; lvAsked = true;
    fetch(LEVELS_URL).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => {
      if (!b) return; const u = new Uint8Array(b);
      if (u[0] !== 0x53 || u[1] !== 0x44 || u[2] !== 0x4c || u[3] !== 0x56) return;
      LVT = u[5]; LVF = u[6] | (u[7] << 8); LVW = LVT * 2 + 3; LV = u;
    }).catch(() => {});
  }
  const lin = (b) => (b ? Math.pow(10, (b / 4 - 60) / 20) : 0);
  const nrg = (b) => (b ? Math.pow(10, (b / 4 - 64 + 0.691) / 10) : 0);
  const lufsOf = (z) => (z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity);
  const lvByte = (f, k) => (LV && f >= 0 && f < LVF ? LV[8 + f * LVW + k] : 0);

  let ws = null, up = false, off = 0, bestRtt = Infinity, phones = [], tr = { playing: false, pos: 0, at: 0 };
  const now = () => performance.timeOrigin + performance.now();
  const pos = () => (tr.playing ? Math.min(DUR, tr.pos + (now() + off - tr.at) / 1000) : tr.pos);
  const seen = new Map();          // phone id -> first seen (ms), for "0:12" and the names' order
  const mixes = new Map();         // phone id -> { mode, t: Map(name -> {v, p, m, s}) }, as the phone says
  let connectedSince = 0, peak = 0;
  function connect() {
    const s = new WebSocket(WS_BASE + '/api/streamdaw/demo/ws?role=host&room=' + ROOM); ws = s;
    s.onopen = () => { up = true; for (let i = 0; i < 5; i++) setTimeout(() => say({ type: 'ping', t: now() }), i * 150); paintAll(); };
    s.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (er) { return; }
      if (m.type === 'pong') { const t1 = now(), rtt = t1 - m.t; if (rtt < bestRtt) { bestRtt = rtt; off = m.now - (m.t + t1) / 2; } }
      else if (m.type === 'welcome') { off = m.now - now(); tr = m.transport; }
      else if (m.type === 'transport') tr = m;
      else if (m.type === 'presence') onPresence(m.phones || []);
      else if (m.type === 'mix') onMix(m.id, m);
    };
    s.onclose = (e) => { if (ws !== s) return; up = false; paintAll(); if (e.code !== 4000) setTimeout(connect, 2500); };
    s.onerror = () => {};
  }
  const say = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  setInterval(() => say({ type: 'ping', t: now() }), 4000);
  function transport(playing, p) {
    p = Math.max(0, Math.min(DUR - 0.5, p));
    if (up) say({ type: 'transport', playing, pos: p });
    else tr = { playing, pos: p, at: now() + off };       // no room (offline): the playhead still works
  }
  function onPresence(list) {
    const t = Date.now();
    for (const p of list) { if (!seen.has(p.id)) seen.set(p.id, t); if (p.mix) onMix(p.id, p.mix, true); }
    for (const id of [...mixes.keys()]) if (!list.some((p) => p.id === id)) mixes.delete(id);
    phones = list.slice().sort((a, b) => seen.get(a.id) - seen.get(b.id));
    if (phones.length && !connectedSince) connectedSince = t;
    if (!phones.length) connectedSince = 0;
    peak = Math.max(peak, phones.length);
    if (target !== 'main' && !mixes.has(target)) target = 'main';
    autoPick();
    paintAll();
  }
  function nameOf(id) {
    const p = phones.find((x) => x.id === id); if (!p) return 'Phone';
    const same = phones.filter((x) => x.name === p.name);
    return same.length > 1 ? p.name + ' ' + (same.indexOf(p) + 1) : p.name;
  }

  const main = {}; for (const p of PAIRS) main[p.id] = { v: 1, p: 0, m: false, s: false };
  let target = 'main', picked = false, clip = null, editing = false;
  const hidden = new Set(), touchedAt = {};
  function onMix(id, m, quiet) {
    if (!id || !m || (m.mode !== 'master' && m.mode !== 'tracks') || !Array.isArray(m.t)) return;
    const t = new Map();
    for (const e of m.t) if (Array.isArray(e) && typeof e[0] === 'string') t.set(e[0], { v: +e[1] >= 0 ? +e[1] : 1, p: +e[2] || 0, m: !!e[3], s: !!e[4] });
    const was = mixes.get(id);
    mixes.set(id, { mode: m.mode, t });
    if (quiet) return;
    if (autoPick()) { paintAll(); return; }
    if (id === target) { if (!was || was.mode !== m.mode) renderCenter(); else patchRows(); }
    else if (!was) renderCenter();
  }
  function autoPick() {
    if (picked || target !== 'main') return false;
    const p = phones.find((x) => mixes.has(x.id)); if (!p) return false;
    target = p.id; picked = true; return true;
  }
  function tgtMix(pr) {
    if (target === 'main') { const x = main[pr.id]; return { ...x, has: true, live: true }; }
    const mx = mixes.get(target), x = mx && pr.t != null ? mx.t.get(pr.name) : null;
    return x ? { ...x, has: true, live: mx.mode === 'tracks' } : { v: 1, p: 0, m: false, s: false, has: false, live: false };
  }
  const usable = (pr) => { const x = tgtMix(pr); return x.has && x.live; };
  const pend = {};
  function tgtSet(pr, patch, final) {
    if (!usable(pr)) return;
    const moving = 'v' in patch || 'p' in patch;
    if (moving) touchedAt[pr.id] = Date.now();
    if (target === 'main') { Object.assign(main[pr.id], patch); patchRows(); return; }
    const mx = mixes.get(target), x = mx && mx.t.get(pr.name); if (!x) return;
    Object.assign(x, patch);
    const k = target + ':' + pr.id, msg = () => ({ type: 'mixSet', id: target, t: [[pr.name, x.v, x.p, x.m ? 1 : 0, x.s ? 1 : 0]] });
    if (!moving) { say(msg()); patchRows(); return; }
    const P = pend[k] || (pend[k] = { at: 0, t: 0 });
    clearTimeout(P.t);
    const go = () => { P.at = Date.now(); say(msg()); };
    if (final || Date.now() - P.at > 60) go(); else P.t = setTimeout(go, 60 - (Date.now() - P.at));
  }
  function allOf(k) {
    const list = target === 'main' ? (k === 'm' ? PAIRS : STEMS) : STEMS.filter((p) => tgtMix(p).has);
    return list.filter((p) => !hidden.has(p.id));
  }
  function setAll(k) {
    const list = allOf(k); if (!list.length) return;
    if (target !== 'main' && !(mixes.get(target) || {}).mode) return;
    const on = !list.every((p) => tgtMix(p)[k]);
    if (target === 'main') { for (const p of list) main[p.id][k] = on; patchRows(); return; }
    const mx = mixes.get(target); if (mx.mode !== 'tracks') return;
    for (const p of list) { const x = mx.t.get(p.name); if (x) x[k] = on; }
    say({ type: 'mixSet', id: target, t: list.map((p) => { const x = mx.t.get(p.name); return [p.name, x.v, x.p, x.m ? 1 : 0, x.s ? 1 : 0]; }) });
    patchRows();
  }
  function mixReset() {
    if (target === 'main') { for (const p of PAIRS) Object.assign(main[p.id], { v: 1, p: 0, m: false, s: false }); renderCenter(); toast('Main is back to as sent'); return; }
    const mx = mixes.get(target); if (!mx) return;
    for (const x of mx.t.values()) Object.assign(x, { v: 1, p: 0, m: false, s: false });
    say({ type: 'mixSet', id: target, reset: true }); renderCenter(); toast(nameOf(target) + '’s mix is reset');
  }
  function mixCopy() {
    const from = target === 'main' ? 'Main' : nameOf(target);
    const tracks = STEMS.map((p) => { const x = tgtMix(p); return x.has ? [p.name, x.v, x.p, x.m, x.s] : null; }).filter(Boolean);
    if (!tracks.length) return;
    clip = { from, tracks }; patchHostmix();
    toast('Copied ' + (from === 'Main' ? 'the Main mix' : from + '’s mix') + ': pick another, then Paste mix');
  }
  function mixPaste() {
    if (!clip) return;
    if (target === 'main') {
      for (const [n, v, p, m, s] of clip.tracks) { const pr = STEMS.find((x) => x.name === n); if (pr) Object.assign(main[pr.id], { v, p, m, s }); }
    } else {
      const mx = mixes.get(target); if (!mx) return;
      mx.mode = 'tracks';
      for (const [n, v, p, m, s] of clip.tracks) { const x = mx.t.get(n); if (x) Object.assign(x, { v, p, m, s }); }
      say({ type: 'mixSet', id: target, mode: 'tracks', t: clip.tracks.map(([n, v, p, m, s]) => [n, v, p, m ? 1 : 0, s ? 1 : 0]) });
    }
    renderCenter();
    toast((target === 'main' ? 'Main' : nameOf(target)) + ' now has ' + (clip.from === 'Main' ? 'the Main mix' : clip.from + '’s mix'));
  }

  const ctl = new Map();           // pair id -> { f: fader, k: knob }
  let centerSig = '';
  function sigOf() {
    const mx = target !== 'main' ? mixes.get(target) : null;
    return [section, view, target, mx ? mx.mode : '', editing, [...hidden].join(), phones.filter((p) => mixes.has(p.id)).map((p) => p.id + nameOf(p.id)).join()].join('|');
  }
  function renderCenter(force) {
    const sig = sigOf();
    if (!force && sig === centerSig) { patchRows(); return; }
    centerSig = sig;
    for (const c of ctl.values()) { if (c.f) c.f.destroy(); if (c.k) c.k.destroy(); }
    ctl.clear();
    $$('.nv').forEach((b) => b.classList.toggle('on', b.dataset.s === section));
    if (section === 'analytics') { center.innerHTML = analyticsHtml(); paintAnalytics(true); return; }
    const tabs = '<span class="seg sx-tabs" role="tablist" aria-label="Section"><button data-s="stream" class="on">Stream</button><button data-s="analytics">Analytics</button></span>';
    let h = '<div class="sec-h">' + tabs + '<span class="h">Stream</span><span class="sp"></span>'
      + '<span class="seg viewseg" role="group" aria-label="View"><button data-a="view" data-v="list" class="' + (view === 'list' ? 'on' : '') + '">List</button><button data-a="view" data-v="mixer" class="' + (view === 'mixer' ? 'on' : '') + '">Mixer</button></span>'
      + '<span class="sw" title="Sync mode: every phone plays the same instant"><i></i><span>Sync mode</span></span></div>';
    const withMix = phones.filter((p) => mixes.has(p.id));
    h += '<div class="mixbar"><span class="seg" role="tablist" aria-label="Whose mix the controls set"><button data-a="tgt" data-t="main" class="' + (target === 'main' ? 'on' : '') + '" title="Main: what this Mac’s monitor plays">Main</button>'
      + withMix.map((p) => '<button data-a="tgt" data-t="' + esc(p.id) + '" class="' + (target === p.id ? 'on' : '') + '" title="' + esc(nameOf(p.id)) + '’s own mix, in their ears">' + esc(nameOf(p.id)) + '</button>').join('') + '</span>';
    const mx = target !== 'main' ? mixes.get(target) : null;
    if (mx) h += '<span class="seg"><button data-a="mode" data-m="master" class="' + (mx.mode === 'master' ? 'on' : '') + '">Full mix</button><button data-a="mode" data-m="tracks" class="' + (mx.mode === 'tracks' ? 'on' : '') + '">Track mixer</button></span>';
    h += '</div>';
    const shown = PAIRS.filter((p) => editing || !hidden.has(p.id));
    const vis = (p) => '<button class="vis" data-a="vis" aria-label="Show or hide ' + p.name + '"></button>';
    if (view === 'mixer') {
      h += '<div class="desk rows' + (editing ? ' editing' : '') + '">' + hostStrip(true);
      for (const p of shown)
        h += '<div class="strip' + (hidden.has(p.id) ? ' hid' : '') + '" data-p="' + p.id + '"><span class="pr">' + p.pr + '</span><span class="dot"></span><span class="kn"></span>'
           + '<span class="msm"><button class="mb s" data-a="s">S</button><button class="mb m" data-a="m">M</button></span><span class="lm"></span>'
           + '<span class="sn">' + esc(p.name) + '</span><span class="sbtn">ON</span>' + vis(p) + '</div>';
      h += '</div>';
    } else {
      h += hostStrip(false) + '<div class="rows' + (editing ? ' editing' : '') + '">';
      for (const p of shown)
        h += '<div class="row sends' + (hidden.has(p.id) ? ' hid' : '') + '" data-p="' + p.id + '">' + vis(p) + '<span class="tk" aria-hidden="true"></span><span class="pc">' + p.pr + '</span>'
           + '<span class="nm">' + esc(p.name) + '</span><span class="dot"></span><span class="fm"></span>'
           + '<button class="mb s" data-a="s" aria-label="Solo ' + p.name + '">S</button><button class="mb m" data-a="m" aria-label="Mute ' + p.name + '">M</button><span class="kn"></span></div>';
      h += '</div>';
    }
    center.innerHTML = h;
    if (window.SdawFader) for (const el of $$('[data-p]', center)) {
      const pr = PAIRS.find((x) => x.id === el.dataset.p), x = tgtMix(pr), desk = view === 'mixer';
      const f = SdawFader.create($(desk ? '.lm' : '.fm', el), { orientation: desk ? 'v' : 'h', value: x.v, max: target === 'main' ? 1.5 : 1, label: 'Volume, ' + pr.name,
        onInput: (v, final) => tgtSet(pr, { v: Math.round(v * 1000) / 1000 }, final) });
      const k = SdawKnob.create($('.kn', el), { value: x.p, detent: 0.08, label: 'Pan, ' + pr.name, onInput: (v, final) => tgtSet(pr, { p: Math.round(v * 100) / 100 }, final) });
      ctl.set(pr.id, { f, k, el });
    }
    lastMeterF = -2;
    patchRows();
  }
  function hostStrip(desk) {
    const title = target === 'main' ? 'Main' : esc(nameOf(target));
    if (desk) return '<div class="hoststrip" role="group" aria-label="Whose mix"><span class="hm-t">' + title + '</span>'
      + '<button class="hb" data-a="all" data-k="s">Solo all</button><button class="hb" data-a="all" data-k="m">Mute all</button>'
      + '<button class="hb gap" data-a="copymix">Copy mix</button><button class="hb" data-a="paste">Paste mix</button><button class="hb" data-a="reset">Reset</button>'
      + '<button class="hb editbtn' + (editing ? ' on' : '') + '" data-a="edit">' + (editing ? 'Done' : 'Edit') + '</button><span class="hm-st" data-hmst></span></div>';
    return '<div class="hostmix" role="group" aria-label="Whose mix"><span class="hm-t">' + title + '</span><span class="d" data-hmst></span><span class="hm-gap"></span>'
      + '<button class="pill sm editbtn' + (editing ? ' on' : '') + '" data-a="edit">' + (editing ? 'Done' : 'Edit') + '</button><button class="pill sm" data-a="reset">Reset</button>'
      + '<button class="pill sm" data-a="copymix">Copy mix</button><button class="pill sm" data-a="paste">Paste mix</button>'
      + '<button class="pill sm" data-a="all" data-k="s">Solo all</button><button class="pill sm" data-a="all" data-k="m">Mute all</button></div>';
  }
  function patchRows() {
    if (section !== 'stream') return;
    const anyS = PAIRS.some((p) => { const x = tgtMix(p); return x.has && x.s; });
    for (const p of PAIRS) {
      const c = ctl.get(p.id); if (!c) continue;
      const x = tgtMix(p), ok = x.has && x.live, quiet = x.has && (x.m || (anyS && !x.s));
      c.el.classList.toggle('rest', !ok || quiet);
      for (const b of $$('.mb', c.el)) { const on = !!x[b.dataset.a]; b.classList.toggle('on', on); b.disabled = !ok; b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      if (Date.now() - (touchedAt[p.id] || 0) > 700) { if (Math.abs(c.f.value - x.v) > 1e-4) c.f.setValue(x.v); if (Math.abs(c.k.value - x.p) > 1e-4) c.k.setValue(x.p); }
      c.f.setDisabled(!ok); c.k.setDisabled(!ok);
      const v = $('.vis', c.el); if (v) v.setAttribute('aria-pressed', hidden.has(p.id) ? 'false' : 'true');
    }
    patchHostmix();
  }
  function patchHostmix() {
    const mx = target !== 'main' ? mixes.get(target) : null;
    for (const b of $$('[data-a="all"]', center)) {
      const k = b.dataset.k, list = allOf(k), on = list.length > 0 && list.every((p) => tgtMix(p)[k]);
      b.classList.toggle('on', on); b.disabled = !list.length || (mx && mx.mode !== 'tracks');
    }
    for (const b of $$('[data-a="paste"]', center)) b.disabled = !clip;
    for (const b of $$('[data-a="reset"],[data-a="copymix"]', center)) b.disabled = !!(target !== 'main' && !mx);
    const nS = STEMS.filter((p) => { const x = tgtMix(p); return x.has && x.s; }).length, nM = PAIRS.filter((p) => { const x = tgtMix(p); return x.has && x.m; }).length;
    const what = mx && mx.mode === 'master' ? 'full mix' : target === 'main' && !nS && !nM ? 'full mix' : [target === 'main' ? 'main mix' : 'track mixer'].concat(nS ? [nS + ' soloed'] : [], nM ? [nM + ' muted'] : []).join(', ');
    for (const el of $$('[data-hmst]', center)) { const t = el.closest('.hoststrip') ? what : '· ' + what; if (el.textContent !== t) el.textContent = t; }
  }

  const people = [];               // a sample every 5 s, the last 10 minutes
  const LU = { blocks: [], shorts: [], peakMax: 0, frames: 0, lastF: null, wasPlaying: false };
  function luReset() { LU.blocks = []; LU.shorts = []; LU.peakMax = 0; LU.frames = 0; }
  function luFrame(f) {            // the playhead passed frame f, playing: what the relay's meter would add
    if (!LV) return;
    LU.frames++;
    if (LU.frames >= 4) { let z = 0; for (let j = 0; j < 4; j++) z += nrg(lvByte(f - j, LVT * 2 + 2)); LU.blocks.push(z / 4); }
    if (LU.frames >= 30) { let z = 0; for (let j = 0; j < 30; j++) z += nrg(lvByte(f - j, LVT * 2 + 2)); LU.shorts.push(z / 30); }
    LU.peakMax = Math.max(LU.peakMax, lin(lvByte(f, LVT * 2)), lin(lvByte(f, LVT * 2 + 1)));
  }
  function gated(list, rel) {
    const a = list.filter((z) => lufsOf(z) > -70); if (!a.length) return null;
    const g = lufsOf(a.reduce((s, z) => s + z, 0) / a.length) + rel;
    return a.filter((z) => lufsOf(z) > g);
  }
  function luNow() {
    const f = Math.floor(pos() * 10), playing = tr.playing && LV;
    const win = (k) => { let z = 0; for (let j = 0; j < k; j++) z += nrg(lvByte(f - j, LVT * 2 + 2)); return lufsOf(z / k); };
    let pk = 0; if (playing) for (let j = 0; j < 30; j++) pk = Math.max(pk, lin(lvByte(f - j, LVT * 2)), lin(lvByte(f - j, LVT * 2 + 1)));
    const gi = gated(LU.blocks, -10), gs = gated(LU.shorts, -20);
    let lra = null;
    if (gs && gs.length > 1) { const s = gs.map(lufsOf).sort((a, b) => a - b); lra = s[Math.floor(0.95 * (s.length - 1))] - s[Math.floor(0.10 * (s.length - 1))]; }
    return { m: playing ? win(4) : null, s: playing ? win(30) : null, i: gi && gi.length ? lufsOf(gi.reduce((a, z) => a + z, 0) / gi.length) : null, lra,
             pk: playing && pk > 0 ? 20 * Math.log10(pk) : null, pkMax: LU.peakMax > 0 ? 20 * Math.log10(LU.peakMax) : null, secs: Math.round(LU.frames / 10) };
  }
  const num = (v, d) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d));
  const at01 = (l) => Math.max(0, Math.min(1, (l + 40) / 40));
  function analyticsHtml() {
    const tabs = '<span class="seg sx-tabs" role="tablist" aria-label="Section"><button data-s="stream">Stream</button><button data-s="analytics" class="on">Analytics</button></span>';
    return '<div class="sec-h">' + tabs + '<span class="h">Analytics</span><span class="d">Live, twice a second.</span></div><div class="an">'
      + '<div class="anc"><div class="t">People</div><div class="nums"><div><b data-v="now">0</b><span>connected</span></div><div><b>0</b><span>at the door</span></div><div><b data-v="peak">0</b><span>peak this sitting</span></div></div>'
      + '<div class="spark" data-v="spark"></div><div class="axis"><span>10 min ago</span><span>now</span></div></div>'
      + '<div class="anc"><div class="t">Loudness <span class="d">Master · 48 kHz</span><span class="sp"></span><button class="pill sm" data-a="lureset">Reset</button></div>'
      + '<div class="lub"><i data-v="mbar"></i><u style="left:42.5%"></u><u style="left:65%"></u><b data-v="sline" style="display:none"></b></div>'
      + '<div class="lus"><span style="left:0">−40</span><span style="left:42.5%;transform:translateX(-50%)">−23</span><span style="left:65%;transform:translateX(-50%)">−14</span><span style="right:0">0 LUFS</span><em data-v="iarrow" style="display:none">▲</em></div>'
      + '<div class="lun"><div><span>Momentary</span><b data-v="m">—</b> <small>LUFS</small></div><div><span>Short-term</span><b data-v="s">—</b> <small>LUFS</small></div>'
      + '<div><span>Integrated</span><b data-v="i">—</b> <small>LUFS</small><span data-v="since"></span></div><div><span>Range</span><b data-v="lra">—</b> <small>LU</small></div>'
      + '<div><span>Sample peak</span><b data-v="pk">—</b> <small>dBFS</small><span data-v="pkmax"></span></div></div></div></div>';
  }
  function paintAnalytics(all) {
    if (section !== 'analytics') return;
    const set = (k, t) => { const el = $('[data-v="' + k + '"]', center); if (el && el.textContent !== t) el.textContent = t; };
    const L = luNow();
    const mb = $('[data-v="mbar"]', center); if (mb) mb.style.width = (L.m == null ? 0 : at01(L.m) * 100) + '%';
    const sl = $('[data-v="sline"]', center); if (sl) { sl.style.display = L.s == null ? 'none' : ''; sl.style.left = (L.s == null ? 0 : at01(L.s) * 100) + '%'; }
    if (!all && paintAnalytics.at && Date.now() - paintAnalytics.at < 480) return;   // the numbers: twice a second
    paintAnalytics.at = Date.now();
    set('now', String(phones.length)); set('peak', String(peak));
    set('m', num(L.m)); set('s', num(L.s)); set('i', num(L.i)); set('lra', num(L.lra)); set('pk', num(L.pk));
    set('since', L.i == null ? '' : 'since GO LIVE · ' + mmss(L.secs)); set('pkmax', L.pkMax == null ? '' : 'max ' + num(L.pkMax));
    const ia = $('[data-v="iarrow"]', center); if (ia) { ia.style.display = L.i == null ? 'none' : ''; ia.style.left = (L.i == null ? 0 : at01(L.i) * 100) + '%'; }
    const sp = $('[data-v="spark"]', center);
    if (sp) {                       // 120 slots of 5 s: the last 10 minutes, now on the right
      const top = Math.max(1, peak), slots = Array(120 - Math.min(120, people.length)).fill(0).concat(people.slice(-120), [phones.length]).slice(-120);
      const h = slots.map((n) => '<i style="height:' + Math.round((n / top) * 100) + '%"></i>').join(''); if (sp.__h !== h) { sp.__h = h; sp.innerHTML = h; }
    }
  }
  setInterval(() => { people.push(phones.length); if (people.length > 120) people.shift(); }, 5000);

  const external = () => { const q = document.getElementById('demoQr'); return !!(q && q.offsetParent); };
  let sideSig = '';
  function renderSide() {
    const ext = external();
    const sig = JSON.stringify([phones.map((p) => [p.id, nameOf(p.id), p.listening]), target, up, ext]);
    if (sig === sideSig) { tickTimes(); return; }
    sideSig = sig;
    let h = '<div class="h">Listening</div>';
    if (!phones.length) {
      h += ext ? '<div class="cta">Nobody yet. Scan the code with your phone.</div><div style="display:flex;gap:6px"><button class="pill sm" data-a="copy">Copy link</button><button class="pill sm" data-a="qr">QR code</button></div>'
        : '<div class="inv" data-inv><div class="ih">You\'re invited</div><div class="is">Scan with your phone</div><div class="qtile" data-qr></div><div class="il">' + (up ? 'Listen live · in time' : 'Opening the session…') + '</div></div>';
    }
    for (const p of phones)
      h += '<div class="person' + (p.listening ? '' : ' off') + (p.id === target ? ' pick' : '') + '"><span aria-hidden="true">' + (p.listening ? '▶' : '‖') + '</span>'
         + '<span class="n" data-a="tgt" data-t="' + esc(p.id) + '" title="Their mix">' + esc(nameOf(p.id)) + '</span><span class="ptime" data-since="' + seen.get(p.id) + '"></span>'
         + '<span class="pbs" aria-hidden="true">' + ['mic', 'cam', 'scr'].map((k) => '<span class="pb"><svg viewBox="0 0 24 24">' + ICON[k] + '</svg></span>').join('') + '</span></div>';
    side.innerHTML = h;
    drawQr();
    tickTimes();
  }
  function tickTimes() {
    for (const el of $$('[data-since]', side)) { const t = mmss(Math.max(0, (Date.now() - +el.dataset.since) / 1000)); if (el.textContent !== t) el.textContent = t; }
  }
  function renderTop() {
    const n = phones.length, live = tr.playing;
    const ct = '9 streams · ' + n + ' listening' + (connectedSince ? ' · connected ' + mmss((Date.now() - connectedSince) / 1000) : '');
    const c = $('.sx-counts'); if (c.textContent !== ct) c.textContent = ct;
    const b = $('[data-a="live"]'), hh = live ? '<span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>STOP LIVE' : 'GO LIVE';
    if (b.__h !== hh) { b.__h = hh; b.innerHTML = hh; b.className = 'pill onair ' + (live ? 'lime' : 'ink'); b.setAttribute('aria-label', live ? 'Stop live' : 'Go live: every phone plays'); }
    const pl = $('[data-a="play"]'); pl.classList.toggle('on', live); pl.setAttribute('aria-label', live ? 'Pause' : 'Play');
    const st = document.getElementById('demoQrState');
    if (st) { const l = phones.filter((p) => p.listening).length; st.textContent = !n ? 'Waiting for your phone…' : l ? (l === 1 ? 'Your phone is in: press GO LIVE.' : l + ' phones in: press GO LIVE.') : 'Your phone is in: press its Play, then GO LIVE.'; }
  }
  function paintAll() { renderTop(); renderSide(); renderCenter(); }

  function qrSvg() {
    if (!window.SdawQR) return '';
    const m = window.SdawQR.matrix(PHONE_URL), n = m.size, q = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m.get(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<svg viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="QR code: join this demo session from your phone"><path fill="#17140d" d="' + d + '"/></svg>';
  }
  let qrCache = '';
  function drawQr() {
    if (!qrCache) qrCache = qrSvg();
    for (const el of $$('[data-qr]')) if (!el.firstChild) el.innerHTML = qrCache;
    const host = document.getElementById('demoQr'); if (host && qrCache && !host.querySelector('svg')) host.insertAdjacentHTML('afterbegin', qrCache);
    const a = document.getElementById('demoLink'); if (a) a.href = PHONE_URL;
  }

  let toastT = 0;
  function toast(t) { const el = $('.sx-toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
  function setTheme(t) {
    theme = t; box.setAttribute('data-theme', t); store.set('sdemo_theme', t);
    window.dispatchEvent(new Event('sdawtheme'));       // the meters and faders read their colours again
  }
  box.addEventListener('click', (e) => {
    const sb = e.target.closest('[data-s]');
    if (sb && box.contains(sb) && !sb.closest('[data-p]')) { section = sb.dataset.s; renderCenter(); return; }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'play') transport(!tr.playing, pos());
    else if (a === 'stop') transport(false, tr.playing ? pos() : 0);
    else if (a === 'live') transport(!tr.playing, pos() >= DUR - 0.6 ? 0 : pos());
    else if (a === 'copy') { (navigator.clipboard ? navigator.clipboard.writeText(PHONE_URL) : Promise.reject()).then(() => toast('Link copied: open it on a phone'), () => toast(PHONE_URL)); }
    else if (a === 'qr') { drawQr(); $('.sx-sheet').hidden = false; }
    else if (a === 'qrclose') $('.sx-sheet').hidden = true;
    else if (a === 'theme') setTheme(theme === 'dark' ? 'light' : 'dark');
    else if (a === 'view') { view = b.dataset.v; store.set('sdemo_view', view); renderCenter(); }
    else if (a === 'tgt') { target = b.dataset.t === 'main' || !mixes.has(b.dataset.t) ? 'main' : b.dataset.t; picked = true; section = 'stream'; renderCenter(); renderSide(); }
    else if (a === 'mode') { const mx = mixes.get(target); if (mx && mx.mode !== b.dataset.m) { mx.mode = b.dataset.m; say({ type: 'mixSet', id: target, mode: mx.mode }); renderCenter(); } }
    else if (a === 's' || a === 'm') { const pr = PAIRS.find((x) => x.id === b.closest('[data-p]').dataset.p); tgtSet(pr, { [a]: !tgtMix(pr)[a] }, true); }
    else if (a === 'all') setAll(b.dataset.k);
    else if (a === 'reset') mixReset();
    else if (a === 'copymix') mixCopy();
    else if (a === 'paste') mixPaste();
    else if (a === 'edit') { editing = !editing; renderCenter(); }
    else if (a === 'vis') { const id = b.closest('[data-p]').dataset.p; if (hidden.has(id)) hidden.delete(id); else hidden.add(id); renderCenter(); }
    else if (a === 'lureset') { luReset(); paintAnalytics(true); }
  });
  $('.sx-sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('.sx-sheet').hidden) $('.sx-sheet').hidden = true; });
  lanes.addEventListener('click', (e) => { const r = lanes.getBoundingClientRect(); transport(tr.playing, (e.clientX - r.left) / r.width * BARS * BAR); });

  let lastMeterF = -2, running = false, lastTop = 0;
  function frame() {
    if (!running) return;
    const p = pos(), playing = tr.playing;
    if (playing && p >= DUR - 0.05) transport(false, 0);
    ph.style.left = (p / (BARS * BAR) * 100) + '%';
    const beat = p / (60 / BPM), bb = Math.floor(beat / 4) + 1, bt = Math.floor(beat % 4) + 1, six = Math.floor((beat % 1) * 4) + 1;
    const t1 = bb + '. ' + bt + '. ' + six, t2 = mmss(p);
    if (f1.textContent !== t1) f1.textContent = t1; if (f2.textContent !== t2) f2.textContent = t2;
    if (playing && !LU.wasPlaying) { luReset(); LU.lastF = null; }
    LU.wasPlaying = playing;
    const f = Math.floor(p * 10);
    if (playing && LV) {
      if (LU.lastF != null && f > LU.lastF && f - LU.lastF <= 6) for (let j = LU.lastF + 1; j <= f; j++) luFrame(j);
      LU.lastF = f;
    } else LU.lastF = null;
    if (f !== lastMeterF) {          // the song's levels change ten times a second
      lastMeterF = f;
      const on = playing && LV;
      for (const pr of PAIRS) {
        const c = ctl.get(pr.id); if (!c) continue;
        const k = pr.t == null ? LVT * 2 : pr.t * 2;
        const l = on ? lin(lvByte(f, k)) : 0, r = on ? lin(lvByte(f, k + 1)) : 0;
        c.f.setLevels(Math.min(1, l), Math.min(1, r));
        const d = $('.dot', c.el); if (d) d.classList.toggle('on', !!on && l + r > 0.003);
      }
      if (on && vu) vu.feed(lin(lvByte(f, LVT * 2)), lin(lvByte(f, LVT * 2 + 1)));
      const lu = $('[data-lufs]');
      if (lu) { const L = on ? luNow() : null, t = L && L.s != null ? num(L.s) + ' LUFS · 48.0 kHz' : '48.0 kHz'; if (lu.textContent !== t) lu.textContent = t; }
      paintAnalytics(false);
    }
    if (Date.now() - lastTop > 500) { lastTop = Date.now(); renderTop(); tickTimes(); }
    requestAnimationFrame(frame);
  }
  function run(on) { if (on === running) return; running = on; if (on) requestAnimationFrame(frame); }
  let opened = false;
  const io = new IntersectionObserver((es) => {
    const near = es.some((e) => e.isIntersecting);
    if (near && !opened) { opened = true; connect(); loadLevels(); }
    run(near && !document.hidden);
  }, { rootMargin: '400px' });
  io.observe(box);
  document.addEventListener('visibilitychange', () => { if (document.hidden) run(false); else if (opened) run(true); });
  paintAll();
  drawQr();

  window.__studio = {
    room: ROOM, phoneUrl: PHONE_URL, get tr() { return tr; }, get phones() { return phones; }, get up() { return up; }, pos,
    get target() { return target; }, get view() { return view; }, get section() { return section; }, mixes,
    el(name) {
      const [k, id] = String(name).split(':');
      if (k === 'play') return $('[data-a="play"]'); if (k === 'live') return $('[data-a="live"]'); if (k === 'lanes') return lanes;
      if (k === 'qr') return $('.sx-side [data-qr]'); if (k === 'invite') return $('.sx-side [data-inv]'); if (k === 'view') return $('.viewseg', center);
      if (k === 'tgt') return $(id ? '.mixbar [data-t="' + id + '"]' : '.mixbar [data-a="tgt"]:not([data-t="main"])', center);
      if (k === 's' || k === 'm') return $('[data-p="' + id + '"] [data-a="' + k + '"]', center);
      if (k === 'fader') return $('[data-p="' + id + '"] ' + (view === 'mixer' ? '.lm' : '.fm'), center);
      return null;
    },
  };
})();
