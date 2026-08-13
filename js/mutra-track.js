/* ═══════════ Mutra — lightweight visit tracking ═══════════
   Sends anonymous events so the owner can see which tracks people actually play.
   No cookies, no fingerprinting, no cross-visit identity: the id below is random
   and lives in sessionStorage, so it disappears when the tab closes.
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
