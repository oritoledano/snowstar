/* ═══════════ StreamDAW: connect a Mac to the account (apps/streamdaw-connect.html) ═══════════
   The app opens this page at its first start, and from Settings › Licence until it is done
   (2026-10-15): #m=<machine ID>&v=<app version>, in the fragment so it never reaches a server
   log. Signed in, the page connects at once (POST /api/streamdaw/macs/link): the person came here
   from their own app. Signed out: sign in, then the same. The app's relay sees it within a minute
   (POST /api/streamdaw/macs/status) and stops asking. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  const MACHINE_RE = /^SD[0-9A-F]{12,20}$/;
  const f = new URLSearchParams(location.hash.replace(/^#/, ''));
  const machine = (f.get('m') || '').trim().toUpperCase(), app = (f.get('v') || '').trim();
  const PANELS = ['cnWait', 'cnAnon', 'cnDone', 'cnBad'];
  const show = (id) => PANELS.forEach((p) => { const el = $(p); if (el) el.hidden = p !== id; });
  const acct = () => window.SnowstarAccount;
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }

  let last = null, busy = false;
  async function go() {
    if (!MACHINE_RE.test(machine)) { show('cnBad'); return; }
    await ready();
    const M = acct(), user = M && M.user;
    const who = user ? (user.email || user.id || 'x') : '';
    if (who === last || busy) return;
    last = who;
    if (!user) { show('cnAnon'); return; }
    busy = true; show('cnWait');
    try {
      const r = await fetch('/api/streamdaw/macs/link', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ machine, app }) });
      if (r.status === 401) { last = null; show('cnAnon'); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { $('cnBadText').textContent = 'Could not connect this Mac (' + (d.error || r.status) + '). Reload the page to try again.'; show('cnBad'); return; }
      $('cnWho').textContent = d.name || user.name || user.email || '';
      show('cnDone');
      try { history.replaceState(null, '', location.pathname); } catch (e) {}   // the machine ID leaves the address bar
    } catch (e) {
      $('cnBadText').textContent = 'Could not reach your account. Check the connection and reload the page.'; show('cnBad');
    } finally { busy = false; }
  }
  $('cnSignin').addEventListener('click', () => {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    open('login', 'Sign in with the account you downloaded StreamDAW with.');
  });
  const M = acct(); if (M && M.onChange) M.onChange(() => go());
  go();
})();
