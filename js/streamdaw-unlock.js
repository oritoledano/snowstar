/* ═══════════ StreamDAW unlock page (apps/streamdaw-unlock.html) ═══════════════
   An owner turns a machine ID into a key. This lived in the sale page's pricing
   section ("Unlock your Mac.") until 2026-10-10; it moved here so the sale page
   sells, and owners have a page of their own (linked from the sale page, its
   footer, and the account menu's StreamDAW entry).

   Same Worker calls as before:
     GET  /api/streamdaw/activations   → {owned, activations:[{machine_id,status,key_text,…}]}
                                          (401 signed out; owned:false without Pro)
     POST /api/streamdaw/activate      {machineId, name} → {status:'issued', key}
                                          | {status:'pending', soon} | {error}
   The machine can arrive as ?machine=SD… (from the app) or from the sale page's
   checkout in this tab (sessionStorage 'sd_machine'). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const MACHINE_RE = /^SD[0-9A-F]{12,20}$/;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const q = new URLSearchParams(location.search);
  (function () {
    const m = (q.get('machine') || '').trim().toUpperCase();
    if (MACHINE_RE.test(m)) { try { sessionStorage.setItem('sd_machine', m); } catch (e) {} }
  })();
  function forMac() { try { const m = sessionStorage.getItem('sd_machine'); return MACHINE_RE.test(m || '') ? m : null; } catch (e) { return null; } }

  const PANELS = ['ulWait', 'ulAnon', 'ulNone', 'ulOwner'];
  function show(id) { PANELS.forEach((p) => { const el = $(p); if (el) el.hidden = p !== id; }); }

  const acct = () => window.SnowstarAccount;
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }

  let last = null;            // the account the page was last drawn for
  let acts = [];              // this purchase's Macs, newest first
  async function init(force) {
    await ready();
    const M = acct(), user = M && M.user;
    const who = user ? (user.email || user.id || 'x') : '';
    if (!force && who === last) return;
    last = who;
    if (!user) { show('ulAnon'); return; }
    show('ulWait');
    let d = null;
    try {
      const r = await fetch('/api/streamdaw/activations', { credentials: 'include' });
      if (r.status === 401) { show('ulAnon'); return; }
      d = await r.json();
    } catch (e) {
      show('ulWait'); $('ulWait').innerHTML = '<p>Could not reach your account. Check the connection and reload the page.</p>'; return;
    }
    if (!d || !d.owned) { $('ulWho').textContent = user.email || user.name || ''; show('ulNone'); return; }
    show('ulOwner');
    const name = $('licName'); if (name && !name.value && user.name && !String(user.name).includes('@')) name.value = user.name;
    acts = d.activations || [];
    drawMacs();
    const mac = forMac(), field = $('licMachine');
    if (mac && field && !field.value) field.value = mac;
    // Came for a Mac that already has its key: show it straight away.
    const here = mac && acts.find((a) => a.machine_id === mac && a.status === 'issued' && a.key_text);
    if (here) showKey(here.key_text, here.machine_id);
    else if (mac && acts.some((a) => a.machine_id === mac && a.status === 'pending'))
      licMsg('Your request for this Mac is in. The key arrives by email and appears here.');
  }

  function when(t) { if (!t) return ''; const d = new Date(Number(t) * 1000); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function drawMacs() {
    const wrap = $('macsWrap'), list = $('macs'); if (!wrap || !list) return;
    if (!acts.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    list.innerHTML = acts.map((a, i) => {
      const st = a.status === 'issued' ? 'Key issued' + (a.issued_at ? ' ' + when(a.issued_at) : '')
        : a.status === 'pending' ? 'Key being made' : esc(a.status || '');
      return '<li><code>' + esc(a.machine_id) + '</code><span class="st ' + esc(a.status) + '">' + st + '</span>'
        + (a.status === 'issued' && a.key_text ? '<button class="btn ghost sm" type="button" data-show="' + i + '">Show key</button>' : '') + '</li>';
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]'); if (!b) return;
    const a = acts[Number(b.dataset.show)]; if (a && a.key_text) showKey(a.key_text, a.machine_id);
  });

  function licMsg(t, kind) { const m = $('licMsg'); if (m) { m.textContent = t; m.className = 'lmsg' + (kind ? ' ' + kind : ''); } }
  function showKey(k, machine) {
    $('licForm').hidden = true;
    $('licKeyWrap').hidden = false;
    $('licKey').value = k;
    $('licKeyFor').textContent = machine || '';
  }
  function another() {
    $('licKeyWrap').hidden = true; $('licForm').hidden = false;
    const f = $('licMachine'); f.value = ''; f.focus(); licMsg('');
  }

  // The minter usually sends a key within a minute: watch for it for a few minutes.
  async function licWait(t0, machine) {
    try {
      const r = await fetch('/api/streamdaw/activations', { credentials: 'include' }); const d = await r.json();
      acts = d.activations || acts; drawMacs();
      const issued = acts.find((a) => a.status === 'issued' && a.key_text && a.machine_id === machine);
      if (issued) { showKey(issued.key_text, machine); return; }
    } catch (e) {}
    if (Date.now() - t0 < 5 * 60000) setTimeout(() => licWait(t0, machine), 10000);
    else licMsg('Your key is taking longer than usual. It arrives by email, and appears here when you come back.');
  }

  async function licRequest() {
    const name = $('licName').value.trim();
    const machine = $('licMachine').value.trim().toUpperCase();
    if (!machine) { licMsg('Paste the machine ID from StreamDAW › Settings › Licence first.', 'bad'); return; }
    if (!MACHINE_RE.test(machine)) { licMsg('That does not look like a machine ID. It starts with SD: copy it from StreamDAW › Settings › Licence.', 'bad'); return; }
    const btn = $('licSend'); btn.disabled = true; licMsg('Sending…');
    try {
      const r = await fetch('/api/streamdaw/activate', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ machineId: machine, name }) });
      const d = await r.json();
      if (r.status === 401) { btn.disabled = false; last = null; init(true); return; }
      if (!r.ok) { licMsg(d.error || 'That did not go through.', 'bad'); btn.disabled = false; return; }
      try { sessionStorage.setItem('sd_machine', machine); } catch (e) {}
      if (d.status === 'issued' && d.key) { btn.disabled = false; showKey(d.key, machine); refresh(); return; }
      if (d.soon) { licMsg('Got it. Your key is being made: it appears here and arrives by email, usually within a minute.', 'ok'); licWait(Date.now(), machine); }
      else licMsg('Got it: we emailed you a confirmation. Your key arrives in a second email, usually within a day, and appears here.', 'ok');
      btn.disabled = false; refresh();
    } catch (e) { licMsg('Network trouble. Try again.', 'bad'); btn.disabled = false; }
  }
  async function refresh() {
    try { const r = await fetch('/api/streamdaw/activations', { credentials: 'include' }); const d = await r.json(); acts = d.activations || []; drawMacs(); } catch (e) {}
  }

  $('licSend').addEventListener('click', licRequest);
  $('licMachine').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); licRequest(); } });
  $('licAnother').addEventListener('click', another);
  $('licCopy').addEventListener('click', () => {
    const t = $('licKey'), c = $('licCopy');
    const done = () => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy key'; }, 1500); };
    const old = () => { t.select(); try { document.execCommand('copy'); done(); } catch (e) {} };
    if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, old); else old();
  });
  $('ulSignin').addEventListener('click', () => {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    open('login', 'Sign in with the email you bought StreamDAW Pro with.');
  });

  init();
  // Signing in or out (the lightbox, the account menu) redraws the page for that account.
  (function () { const M = acct(); if (M && M.onChange) M.onChange(() => { init(); }); })();
})();
