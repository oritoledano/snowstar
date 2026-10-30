/* ═══════════ Audioctor's plans, through Paddle (2026-10-30) ══════════════════
   The two buy buttons on apps/audioctor.html ([data-plan]: year, monthly). Paddle is the merchant of record: the Worker
   makes a Paddle transaction for the plan (POST /api/audioctor/checkout, worker/src/audioctor-paddle.js) and Paddle.js
   opens it. Nothing is granted on the page's word: the key comes once Paddle tells the Worker the payment went through.
   Until Paddle sells for real (/api/audioctor/prices: open, production) the buttons stay on the waitlist; ?paddle=test
   lets the owner try the sandbox. ?c=CODE in a link carries a code for the first year. ?machine=AD… comes from the
   app ("See plans"), and that Mac's key is made the moment the money is in. */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const box = document.getElementById('planMsg');
  const MACHINE_RE = /^AD[0-9A-F]{12,20}$/;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(html, good) {
    if (!box) return;
    box.innerHTML = html; box.className = 'planmsg ' + (good ? 'ok' : 'bad'); box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
  }
  const track = (name, props) => {
    try { dispatchEvent(new CustomEvent('audioctor:track', { detail: { name, props: Object.assign({ view: 'landing' }, props) } })); } catch (e) {}
  };

  (function () {
    const m = String(q.get('machine') || '').trim().toUpperCase();
    if (MACHINE_RE.test(m)) { try { sessionStorage.setItem('ad_machine', m); } catch (e) {} }
  })();
  const forMac = () => { try { const m = sessionStorage.getItem('ad_machine'); return MACHINE_RE.test(m || '') ? m : null; } catch (e) { return null; } };

  let sells = false, cfg = null, code = null;
  fetch('/api/audioctor/prices', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    cfg = d && d.paddle;
    sells = !!(d && d.open && cfg && (cfg.environment === 'production' || q.get('paddle') === 'test'));
    if (sells && q.get('c')) checkCode(q.get('c'));
  }).catch(() => {});

  function checkCode(c) {
    fetch('/api/audioctor/coupon/check', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ code: c }) }).then((r) => r.json()).then((d) => {
      if (d && d.ok) { code = d.code; say(`<b>${esc(d.code)}</b>: ${esc(d.label)}. It applies when you get a year.`, true); }
      else say(esc((d && d.reason) || 'That code isn’t valid.'), false);
    }).catch(() => {});
  }

  // ── the account ──
  const acct = () => window.SnowstarAccount;
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }
  function signUp(resume) {
    const openAuth = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!openAuth) { say('Sign-in is loading. One moment, then try again.', false); return; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(resume);
    openAuth('signup', 'Your plan and your keys are kept with a free Snowstar account.', 'app');
  }

  // ── Paddle.js, loaded on the first purchase ──
  let paddleLoad = null;
  function paddleJs() {
    if (paddleLoad) return paddleLoad;
    paddleLoad = new Promise((resolve, reject) => {
      if (window.Paddle) return resolve(window.Paddle);
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = () => resolve(window.Paddle); s.onerror = () => { paddleLoad = null; reject(new Error('paddle.js')); };
      document.head.appendChild(s);
    }).then((P) => {
      if (cfg.environment === 'sandbox') P.Environment.set('sandbox');
      P.Initialize({ token: cfg.clientToken, eventCallback: onPaddle });
      return P;
    });
    return paddleLoad;
  }
  const thanks = () => '<b>Audioctor is yours. Thank you.</b> Paddle emails your receipt. ' + (forMac()
    ? 'Your key for this Mac comes by email in a minute: paste it in the licence line at the bottom left of Audioctor’s window.'
    : '<a href="audioctor-unlock.html">Get your key for a Mac</a>.');
  function onPaddle(ev) {
    if (!ev || ev.name !== 'checkout.completed') return;
    setTimeout(() => { try { window.Paddle.Checkout.close(); } catch (e) {} }, 2600);
    say(thanks(), true);
    track('checkout_done', {});
  }

  async function buy(plan, button) {
    await ready();
    const M = acct();
    if (!(M && M.user)) { signUp(() => buy(plan, button)); return; }
    if (button.dataset.busy) return;
    button.dataset.busy = '1';
    try {
      const r = await fetch('/api/audioctor/checkout', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, machine: forMac(), ...(code && plan === 'year' ? { coupon: code } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { signUp(() => buy(plan, button)); return; }
      if (d.free) { say(thanks(), true); return; }
      if (d.error === 'owns_it' || d.error === 'already_subscribed') { say(`${esc(d.reason)} <a href="/account.html#apps">Your account</a>.`, false); return; }
      if (!r.ok || !d.paddle) { say(esc(d.reason || 'Checkout could not open. Nothing was charged. Please try again.'), false); return; }
      const P = await paddleJs();
      P.Checkout.open({ transactionId: d.paddle.transactionId, settings: { displayMode: 'overlay', theme: 'dark' } });
      track('checkout_open', { plan });
    } catch (e) {
      say('Checkout could not open. Nothing was charged. Please try again.', false);
    } finally { delete button.dataset.busy; }
  }

  // Before the waitlist's own listener: a plan that sells goes to checkout, anything else stays with it.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-plan]');
    if (!a || !sells) return;
    e.preventDefault(); e.stopImmediatePropagation();
    buy(a.dataset.plan, a);
  }, true);
})();
