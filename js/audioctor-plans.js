/* ═══════════ Audioctor's plans, through Creem (2026-11-11) ══════════════════
   The Worker makes a Creem checkout (worker/src/audioctor-creem.js) and the page goes to Creem's checkout page,
   which comes back here with ?paid=1. Until /api/audioctor/prices says open and live the buttons stay on the
   waitlist; ?creem=test lets the owner try Creem's test mode.

   The two buy buttons on apps/audioctor.html ([data-plan]: year, monthly). Creem is the merchant of record.
   Nothing is granted on the page's word: the key comes once Creem tells the Worker the payment went through.
*/
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

  let sells = false, code = null;
  fetch('/api/audioctor/prices', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const cr = (d && d.creem) || {};
    sells = !!(d && d.billing === 'creem' && d.open && (cr.environment === 'live' || q.get('creem') === 'test'));
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

  const thanks = () => '<b>Audioctor is yours. Thank you.</b> Your receipt comes by email. ' + (forMac()
    ? 'Your key for this Mac comes by email in a minute: paste it in the licence line at the bottom left of Audioctor’s window.'
    : '<a href="audioctor-unlock.html">Get your key for a Mac</a>.');
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
      if (r.ok && d.creem && /^https:\/\//.test(d.creem.checkoutUrl || '')) { track('checkout_open', { plan }); location.href = d.creem.checkoutUrl; return; }
      say(esc(d.reason || 'Checkout could not open. Nothing was charged. Please try again.'), false);
    } catch (e) {
      say('Checkout could not open. Nothing was charged. Please try again.', false);
    } finally { delete button.dataset.busy; }
  }

  // Back from Creem's checkout page (its success URL): the key comes once Creem tells the Worker, by email in a minute.
  if (q.get('paid') === '1') {
    say(thanks(), true);
    track('checkout_done', {});
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

  // Before the waitlist's own listener: a plan that sells goes to checkout, anything else stays with it.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-plan]');
    if (!a || !sells) return;
    e.preventDefault(); e.stopImmediatePropagation();
    buy(a.dataset.plan, a);
  }, true);
})();
