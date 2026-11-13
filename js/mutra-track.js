/* ═══════════ Mutra — lightweight visit tracking ═══════════
   Sends events so the owner can see which tracks people actually play. The
   session id below is random and lives in sessionStorage (disappears when
   the tab closes) — that's the only identity THIS file ever sends. If the
   visitor happens to be signed in, the server attaches their real identity
   itself, off the same-origin session cookie this fetch already carries
   (credentials: 'same-origin') — never anything asserted here client-side.
   Respects Do Not Track / Global Privacy Control. */
(function () {
  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
              navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true;
  if (dnt) { window.mutraTrack = () => {}; return; }

  /* The owner's own machine (2026-11-13). The Worker already refuses to record
     an admin who is signed in; this is the other half, for when he is signed
     out or in a private window and is still just working on his own site.
     localStorage and not sessionStorage on purpose: the whole point is that it
     outlives the tab. ?notme=1 turns it on anywhere, ?notme=0 turns it off, so
     he can check what a real visitor records without clearing site data. */
  const OFF = 'sn_notrack';
  try {
    const q = new URLSearchParams(location.search).get('notme');
    if (q === '1') localStorage.setItem(OFF, '1');
    if (q === '0') localStorage.removeItem(OFF);
    if (localStorage.getItem(OFF) === '1') { window.mutraTrack = () => {}; return; }
  } catch { /* storage blocked: fall through and let the server decide */ }

  /* Signing in as an admin on this browser sets the flag for every visit after
     this one. The account module resolves after this file runs, so the first
     view of that first visit is still sent - and the Worker drops it, because
     by then the request carries an admin's cookie. */
  const markIfAdmin = () => {
    try {
      const a = window.SnowstarAccount;
      if (a && a.user && a.user.admin) localStorage.setItem(OFF, '1');
    } catch { /* nothing to do */ }
  };
  setTimeout(markIfAdmin, 2500);

  let sid;
  try {
    sid = sessionStorage.getItem('mutra_sid');
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now())
              .replace(/-/g, '').slice(0, 32);
      sessionStorage.setItem('mutra_sid', sid);
    }
  } catch {
    return; // storage blocked — don't track rather than fall back to anything persistent
  }

  const seen = new Set();   // one event per track per visit keeps counts honest

  function send(type, detail, opts = {}) {
    /* Nothing is measured until the visitor has said yes. Before a choice is
       made snowConsent.analytics() is false, so the pipeline is simply mute —
       no queue, no catch-up send afterwards. */
    if (window.snowConsent && !snowConsent.analytics()) return;
    if (opts.once) {
      const key = type + ':' + (detail || '');
      if (seen.has(key)) return;
      seen.add(key);
    }
    const payload = JSON.stringify({
      type, detail, sid,
      page: location.pathname,
      referrer: document.referrer || null,
      duration: opts.duration,
    });
    try {
      // keepalive so the request survives the page being closed
      fetch('/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
credentials: 'same-origin',
      }).catch(() => {});
    } catch {}
  }

  window.mutraTrack = send;
  send('view');
})();
