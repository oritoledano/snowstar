/* ═══════════ Audioctor's free download (2026-11-10) ═══════════════════════════
   Every [data-free-dl] on apps/audioctor.html. The Free plan is the app itself, so the button is the download:
   signed in, the installer (GET /api/audioctor/download/free, worker/src/audioctor.js); signed out, the shared
   sign-up first (its newsletter box unticked: consent is theirs to give), then the file. The Worker sends a
   signed-out visitor who opens the URL itself back here with ?get=free, and the demo links here the same way
   (&from=demo). A Google sign-in reloads the page, so the wish is kept in this tab for 15 minutes; pressing a
   plan drops it. As StreamDAW's (js/streamdaw-page.js § 5).
   Mac or PC (2026-11-21, Ori on a PC got the Mac .pkg): a labelled button says which file it is (data-os="mac" | "win");
   an unlabelled one follows the browser, so nobody on a PC lands on the Mac installer. Whichever this computer wants is
   the solid button. The wish survives a Google sign-in's reload beside the wish itself; ?os=win on the URL asks for
   Windows (the Worker's sign-up redirect, and the Windows app's Update button). */
(function () {
  'use strict';
  const FREE_DL = '/api/audioctor/download/free', KEY = 'ad_free_dl', FROM = 'ad_free_from', OS = 'ad_free_os', FOR = 15 * 60 * 1000;
  const q = new URLSearchParams(location.search);
  const winUA = () => { try { const d = navigator.userAgentData; return d ? /win/i.test(d.platform || '') : /Windows|Win64|WOW64/i.test(navigator.userAgent || ''); } catch (e) { return false; } };
  const osFor = (a) => { const o = a && a.dataset ? a.dataset.os : ''; return o === 'win' || o === 'mac' ? o : (winUA() ? 'win' : 'mac'); };
  const osWish = () => { try { const o = sessionStorage.getItem(OS); return o === 'win' || o === 'mac' ? o : (winUA() ? 'win' : 'mac'); } catch (e) { return winUA() ? 'win' : 'mac'; } };
  const $ = (id) => document.getElementById(id);
  const acct = () => window.SnowstarAccount;
  const signedIn = () => { const M = acct(); return !!(M && M.user); };
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }
  const track = (name, props) => {
    try { dispatchEvent(new CustomEvent('audioctor:track', { detail: { name, props: Object.assign({ view: 'landing' }, props) } })); } catch (e) {}
  };
  const clean = (s) => (/^[a-z0-9-]{1,20}$/.test(s || '') ? s : '');
  const wants = () => { try { const t = +sessionStorage.getItem(KEY) || 0; return t > 0 && Date.now() - t < FOR; } catch (e) { return false; } };
  const from = () => { try { return clean(sessionStorage.getItem(FROM)); } catch (e) { return ''; } };
  function keep(on, src, os) {
    try {
      if (on) { sessionStorage.setItem(KEY, String(Date.now())); sessionStorage.setItem(FROM, clean(src) || 'page'); sessionStorage.setItem(OS, os === 'win' ? 'win' : 'mac'); }
      else { sessionStorage.removeItem(KEY); sessionStorage.removeItem(FROM); sessionStorage.removeItem(OS); }
    } catch (e) {}
  }

  // Once per wish: the sign-in's resume and the account's change can both call this.
  let started = false;
  function start(src, os) {
    if (started) return;
    started = true;
    const o = os === 'win' || os === 'mac' ? os : osWish();
    track('free_download', { from: clean(src) || from() || 'page', os: o });
    keep(false);
    location.href = FREE_DL + (o === 'win' ? '?os=win' : '');
    hint(o);
  }
  function hint(os) {
    const h = $('dlHint'), x = $('dlHintX');
    if (!h) return;
    h.querySelectorAll('[data-hint-os]').forEach((p) => { p.hidden = p.dataset.hintOs !== os; });
    const cc = document.querySelector('.cc-bar.in');   // above the cookie bar while it still waits for an answer
    h.style.bottom = cc ? (cc.offsetHeight + 28) + 'px' : '';
    h.hidden = false;
    if (x && !x.dataset.on) { x.dataset.on = '1'; x.addEventListener('click', () => { h.hidden = true; }); }
  }
  function ifWanted() { if (wants() && signedIn()) start(); }
  function ask(src, os) {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    keep(true, src || from(), os || osWish());
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(ifWanted);
    open('signup', 'Your free Snowstar account, then the download starts. No card.', 'app');
  }
  async function go(src, os) {
    started = false;
    await ready();
    if (signedIn()) start(src, os); else ask(src, os);
  }
  (function () {   // the solid button is the file this computer wants; the other stays an outline
    if (!winUA()) return;
    document.querySelectorAll('.os-dl').forEach((g) => {
      const m = g.querySelector('[data-os="mac"]'), w = g.querySelector('[data-os="win"]');
      if (!m || !w) return;
      const solid = [...m.classList].find((c) => c === 'lime' || c === 'ink');
      if (!solid) return;
      m.classList.replace(solid, 'ghost'); w.classList.replace('ghost', solid);
      g.insertBefore(w, m);
    });
  })();

  document.querySelectorAll('[data-free-dl]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const d = a.closest('dialog'); if (d && d.open) d.close();   // the waitlist card's link: the sign-up can't open under a modal
    go('page', osFor(a));
  }));
  document.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => keep(false)));
  (async function () {
    const direct = q.get('get') === 'free';
    if (direct) {                                       // tidy the address; the wish is kept above
      keep(true, q.get('from') || 'link', q.get('os') === 'win' ? 'win' : q.get('os') === 'mac' ? 'mac' : (winUA() ? 'win' : 'mac'));
      const u = new URL(location.href); u.searchParams.delete('get'); u.searchParams.delete('from'); u.searchParams.delete('os');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    }
    if (!wants()) return;
    await ready();
    const M = acct(); if (M && M.onChange) M.onChange(ifWanted);   // e.g. back from Google
    if (signedIn()) start(); else if (direct) ask();
  })();
})();
