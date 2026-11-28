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
   Windows (the Worker's sign-up redirect, and the Windows app's Update button).
   A phone or a tablet (2026-11-21, Ori): the stores instead of the two files ([data-for="mobile"]), the device's own
   first. An unlabelled Download button there opens the App Store on an iPhone or iPad, and the stores on Android.
   Android (2026-11-26, Ori: "Yes, free beta"): until Google Play has it, the site's APK (data-os="android", ?os=android),
   the same free account first. On an Android phone the unlabelled buttons lead to its section (#android), where the
   install steps are; the APK itself is not for a computer to run, but a computer may take it to pass on. */
(function () {
  'use strict';
  const FREE_DL = '/api/audioctor/download/free', KEY = 'ad_free_dl', FROM = 'ad_free_from', OS = 'ad_free_os', FOR = 15 * 60 * 1000;
  const q = new URLSearchParams(location.search);
  const APP_STORE = 'https://apps.apple.com/app/audioctor/id6833722693';
  // an iPad asks for the desktop site and says "Macintosh", but a Mac has no touch screen
  const device = () => { const ua = navigator.userAgent || ''; if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'; return /Android/i.test(ua) ? 'android' : ''; };
  const dev = device();
  const winUA = () => { try { const d = navigator.userAgentData; return d ? /win/i.test(d.platform || '') : /Windows|Win64|WOW64/i.test(navigator.userAgent || ''); } catch (e) { return false; } };
  const OSES = ['win', 'mac', 'android'];
  const osOk = (o) => OSES.includes(o);
  const osFor = (a) => { const o = a && a.dataset ? a.dataset.os : ''; return osOk(o) ? o : (winUA() ? 'win' : 'mac'); };
  const osWish = () => { try { const o = sessionStorage.getItem(OS); return osOk(o) ? o : (winUA() ? 'win' : 'mac'); } catch (e) { return winUA() ? 'win' : 'mac'; } };
  const query = (o) => (o === 'win' || o === 'android' ? '?os=' + o : '');
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
      if (on) { sessionStorage.setItem(KEY, String(Date.now())); sessionStorage.setItem(FROM, clean(src) || 'page'); sessionStorage.setItem(OS, osOk(os) ? os : 'mac'); }
      else { sessionStorage.removeItem(KEY); sessionStorage.removeItem(FROM); sessionStorage.removeItem(OS); }
    } catch (e) {}
  }

  // Once per wish: the sign-in's resume and the account's change can both call this.
  let started = false;
  function start(src, os) {
    if (started) return;
    started = true;
    const o = osOk(os) ? os : osWish();
    track('free_download', { from: clean(src) || from() || 'page', os: o });
    keep(false);
    location.href = FREE_DL + query(o);
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
  (function () {   // a phone or a tablet: the stores, and this device's store first
    if (!dev) return;
    document.querySelectorAll('.os-dl[data-for="desktop"]').forEach((g) => { g.hidden = true; });
    document.querySelectorAll('.os-dl[data-for="mobile"]').forEach((g) => {
      g.hidden = false;
      const i = g.querySelector('[data-store="ios"]'), a = g.querySelector('[data-store="android"]');
      // !a.hidden (2026-11-28): while the Android button is hidden, promoting it would still demote the App
      // Store button to an outline, leaving an Android phone with no solid button at all.
      if (dev === 'android' && i && a && !a.hidden) { g.insertBefore(a, i); if (i.classList.replace('lime', 'ghost')) a.classList.replace('ghost', 'lime'); }
    });
  })();
  (function () {   // the solid button is the file this computer wants; the other stays an outline
    if (dev || !winUA()) return;
    document.querySelectorAll('.os-dl').forEach((g) => {
      const m = g.querySelector('[data-os="mac"]'), w = g.querySelector('[data-os="win"]');
      if (!m || !w) return;
      const solid = [...m.classList].find((c) => c === 'lime' || c === 'ink');
      if (!solid) return;
      m.classList.replace(solid, 'ghost'); w.classList.replace('ghost', solid);
      g.insertBefore(w, m);
    });
  })();

  function toStores() {
    if (dev === 'ios') { location.href = APP_STORE; return; }
    const d = $('android'), t = dev === 'android' && d ? d : $('download');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: t === d ? 'start' : 'center' });
  }
  document.querySelectorAll('[data-free-dl]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const d = a.closest('dialog'); if (d && d.open) d.close();   // the waitlist card's link: the sign-up can't open under a modal
    const os = osFor(a);
    if (dev && os !== 'android') { toStores(); return; }   // a phone can't run the Mac or Windows file
    go('page', os);
  }));
  document.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => keep(false)));
  (async function () {
    const direct = q.get('get') === 'free';
    if (direct) {                                       // tidy the address; the wish is kept above
      keep(true, q.get('from') || 'link', osOk(q.get('os')) ? q.get('os') : (winUA() ? 'win' : 'mac'));
      const u = new URL(location.href); u.searchParams.delete('get'); u.searchParams.delete('from'); u.searchParams.delete('os');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    }
    if (!wants()) return;
    if (dev && osWish() !== 'android') { keep(false); if (direct) toStores(); return; }   // a phone can't run the Mac or Windows file
    await ready();
    const M = acct(); if (M && M.onChange) M.onChange(ifWanted);   // e.g. back from Google
    if (signedIn()) start(); else if (direct) ask();
  })();
})();
