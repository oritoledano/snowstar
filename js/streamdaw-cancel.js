/* ═══════════ Cancel StreamDAW Pro Monthly (apps/streamdaw-cancel.html) ═══════════
   Three ways in, one way out:
   - signed in: GET /api/streamdaw/mine says the subscription; cancel with the session;
   - ?t=… (the link from "email me a cancel link"): POST /api/streamdaw/subscription/by-token says
     it, and the token cancels it (once, within 24 hours);
   - signed out: sign in, or type the email: POST /api/streamdaw/subscription/cancel-link. The
     answer is the same whether or not that email has a subscription.
   The person chooses how it ends: at the end of the month paid for, or now with the unused days
   refunded (worker/src/streamdaw-subs.js). Either way nothing more is charged. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const ils = (a) => '₪' + (Number(a || 0) / 100).toFixed(2);
  const show = (id) => ['cxWait', 'cxSub', 'cxAnon', 'cxNone', 'cxDone'].forEach((p) => { const el = $(p); if (el) el.hidden = p !== id; });
  const post = (p, b) => fetch('/api' + p, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })
    .then((r) => r.json().catch(() => ({})).then((d) => Object.assign({ status: r.status }, d))).catch(() => ({ error: 'network' }));
  const q = new URLSearchParams(location.search);
  const token = /^[A-Za-z0-9_-]{24,64}$/.test(q.get('t') || '') ? q.get('t') : null;
  if (token) history.replaceState(null, '', location.pathname);         // the token stays out of the address bar
  const M = () => window.SnowstarAccount;
  let sub = null;

  function paintSub(s, who) {
    sub = s;
    const head = s.status === 'active' ? `${ils(s.amount)} a month, renews on ${day(s.renewsAt)}`
      : s.status === 'past_due' ? `the last payment didn’t go through; next try ${day(s.nextTryAt)}`
      : s.cancelWhen === 'now' ? 'already ended' : `already cancelled: Pro until ${day(s.paidThrough)}`;
    $('cxSum').innerHTML = `<b>StreamDAW Pro Monthly</b>${who ? ` for ${who}` : ''}: ${head}.`;
    $('cxEnd').innerHTML = `At the end of the month you paid for: Pro stays on until <b>${day(s.paidThrough)}</b>.`;
    $('cxNow').innerHTML = `Now: Pro ends today${s.refundIfNow ? `, and we refund <b>${ils(s.refundIfNow)}</b> for the unused days within 14 days` : ''}.`;
    const already = s.status === 'cancelled';
    const endBox = document.querySelector('input[name="cxWhen"][value="end"]');
    if (endBox) { endBox.disabled = already; endBox.closest('label').style.opacity = already ? 0.5 : 1; }
    if (already) { const n = document.querySelector('input[name="cxWhen"][value="now"]'); if (n) n.checked = true; }
    show('cxSub');
  }

  async function look() {
    if (token) {
      const d = await post('/streamdaw/subscription/by-token', { token });
      if (d && d.ok && d.subscription) return paintSub(d.subscription, d.email);
      show('cxAnon');
      $('cxSent').textContent = 'That link has expired or was used already. Ask for a new one below.';
      return;
    }
    const A = M();
    if (A && !A.ready) { await new Promise((r) => { const off = A.onChange(() => { off(); r(); }); setTimeout(r, 4000); }); }
    if (!(A && A.user)) return show('cxAnon');
    try {
      const r = await fetch('/api/streamdaw/mine', { credentials: 'include' });
      const d = r.ok ? await r.json() : null;
      const s = d && d.subscription;
      if (s && (s.status === 'active' || s.status === 'past_due' || (s.status === 'cancelled' && s.cancelWhen !== 'now'))) return paintSub(s, null);
      $('cxNoneText').textContent = `There is no running Pro Monthly under ${A.user.email || 'this account'}.`;
      show('cxNone');
    } catch (e) { show('cxAnon'); }
  }

  $('cxGo').addEventListener('click', async () => {
    const when = (document.querySelector('input[name="cxWhen"]:checked') || {}).value === 'now' ? 'now' : 'end';
    const go = $('cxGo'), msg = $('cxMsg');
    go.disabled = true; msg.textContent = 'Cancelling…';
    const d = await post('/streamdaw/subscription/cancel', token ? { token, when } : { when });
    if (d && d.ok) {
      const s = d.subscription || sub || {};
      $('cxDoneText').innerHTML = 'Nothing more will be charged. ' + (s.cancelWhen === 'now'
        ? (d.refund ? `Pro ended today; we refund <b>${ils(d.refund)}</b> for the unused days to your card within 14 days.` : 'Pro ended today.')
        : `Pro stays on until <b>${day(s.paidThrough)}</b>.`);
      show('cxDone');
      return;
    }
    go.disabled = false;
    msg.textContent = d && d.error === 'link_expired' ? 'This link has expired or was used already. Ask for a new one.'
      : 'That didn’t go through. Try again, or write to hello@snowstar.company: we cancel within 3 business days and confirm by email.';
  });
  $('cxSignin').addEventListener('click', () => {
    const open = window.SnowstarOpenAuth;
    if (!open) return;
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(() => { show('cxWait'); look(); });
    open('login', 'Sign in to cancel StreamDAW Pro Monthly.');
  });
  $('cxSend').addEventListener('click', async () => {
    const email = ($('cxEmail').value || '').trim(), said = $('cxSent');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { said.textContent = 'Type the email you subscribed with.'; return; }
    $('cxSend').disabled = true;
    const d = await post('/streamdaw/subscription/cancel-link', { email });
    $('cxSend').disabled = false;
    said.textContent = d && d.ok ? 'If there is a Pro Monthly under that email, a link to cancel it is on its way (it works for 24 hours).'
      : d && d.error === 'slow_down' ? 'Too many tries: wait a little, or write to hello@snowstar.company.' : 'That didn’t go through. Try again.';
  });
  const useEmail = $('cxUseEmail');
  if (useEmail) useEmail.addEventListener('click', (e) => { e.preventDefault(); show('cxAnon'); $('cxEmail').focus(); });
  const A = M(); if (A && A.onChange && !token) A.onChange(() => { if (!$('cxDone').hidden) return; look(); });
  look();
})();
