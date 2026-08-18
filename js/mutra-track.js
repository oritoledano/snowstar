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
