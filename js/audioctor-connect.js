/* ═══════════ Audioctor: the app's Sign in, in the browser (apps/audioctor-connect.html, 2026-11-17) ═══════════
   The app opened this page with ?c=<the page's id> (worker/src/audioctor/audioctor-connect.js). The person signs in
   (or makes an account), checks that the code matches the one in the app, and presses Connect; the app is polling and
   gets its key by itself. No plan on the account: the plans, and a checkout that comes back here (?paid=1); the key
   reaches the app the moment Creem tells the Worker.
     POST /api/audioctor/connect/info     {c} → {short, mac, signedIn, email, plan, approved, mine, done, expired}
     POST /api/audioctor/connect/approve  {c} → {ok, plan} | {error, reason}
     POST /api/audioctor/checkout         {plan, machine-less, connect: c} → {creem: {checkoutUrl}}  */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const q = new URLSearchParams(location.search);
  const c = q.get('c') || '';
  const PANELS = ['cnWait', 'cnBad', 'cnAnon', 'cnAsk', 'cnPlans', 'cnDone', 'cnPaying'];
  const show = (id) => PANELS.forEach((p) => { const el = $(p); if (el) el.hidden = p !== id; });
  const fill = (cls, text) => document.querySelectorAll('.' + cls).forEach((el) => { el.textContent = text; });
  const acct = () => window.SnowstarAccount;
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }
  const post = (path, body) => fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }));
  const paid = q.get('paid') === '1';
  let timer = 0;

  async function draw() {
    clearTimeout(timer);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(c)) { show('cnBad'); return; }
    await ready();
    const { status, d } = await post('/api/audioctor/connect/info', { c }).catch(() => ({ status: 0, d: {} }));
    if (status !== 200) { show('cnBad'); return; }
    fill('cnMacName', d.mac || 'your Mac');
    fill('cnEmail', d.email || '');
    $('cnShort').textContent = d.short || '';
    if (d.done) { show('cnDone'); return; }
    if (d.expired) { show('cnBad'); return; }
    if (!d.signedIn) { show('cnAnon'); return; }
    if (d.approved && !d.mine) { $('cnBadText').textContent = 'Another account connected this Mac. In Audioctor, press Sign in again.'; show('cnBad'); return; }
    if (!d.approved) { show('cnAsk'); return; }
    if (d.plan) { show('cnDone'); return; }
    if (paid) { show('cnPaying'); timer = setTimeout(draw, 3000); return; }    // the webhook is on its way
    show('cnPlans');
  }

  async function connect() {
    const b = $('cnGo');
    if (b.dataset.busy) return;
    b.dataset.busy = '1'; $('cnMsg').textContent = '';
    try {
      const { status, d } = await post('/api/audioctor/connect/approve', { c });
      if (status === 401) { openAuth('login'); return; }
      if (status !== 200) { $('cnMsg').textContent = d.reason || 'That did not work. Press Sign in in Audioctor again.'; return; }
      show(d.plan ? 'cnDone' : 'cnPlans');
    } catch (e) {
      $('cnMsg').textContent = 'Could not reach Snowstar. Check the connection and try again.';
    } finally { delete b.dataset.busy; }
  }

  async function buy(plan, button) {
    if (button.dataset.busy) return;
    button.dataset.busy = '1'; $('cnBuyMsg').textContent = '';
    try {
      const { status, d } = await post('/api/audioctor/checkout', { plan, connect: c });
      if (status === 401) { openAuth('login'); return; }
      if (d.creem && /^https:\/\//.test(d.creem.checkoutUrl || '')) { location.href = d.creem.checkoutUrl; return; }
      if (d.free || d.error === 'already_subscribed' || d.error === 'owns_it') { draw(); return; }
      $('cnBuyMsg').textContent = d.reason || 'Checkout could not open. Nothing was charged. Please try again.';
    } catch (e) {
      $('cnBuyMsg').textContent = 'Checkout could not open. Nothing was charged. Please try again.';
    } finally { delete button.dataset.busy; }
  }

  function openAuth(mode) {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(() => draw());
    open(mode, mode === 'signup' ? 'Make your Snowstar account to connect Audioctor.' : 'Sign in to connect Audioctor on your Mac.', 'audioctor');
  }

  $('cnSignin').addEventListener('click', () => openAuth('login'));
  $('cnSignup').addEventListener('click', () => openAuth('signup'));
  $('cnGo').addEventListener('click', connect);
  $('cnOther').addEventListener('click', () => {
    const M = acct();
    if (M && M.logout) M.logout().then(() => openAuth('login')); else openAuth('login');
  });
  document.querySelectorAll('#cnPlans [data-plan]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.plan, b)));

  draw();
  (function () { const M = acct(); if (M && M.onChange) M.onChange(() => { draw(); }); })();
})();
