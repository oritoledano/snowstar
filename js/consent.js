/* ═══════════ Cookie / analytics consent ═══════════════════════════════════
   Proportionate to what this site actually does.

   ESSENTIAL, never asked about: the sign-in session cookie, and the local
   preferences that make the site usable (theme, volume, favourites kept before
   you have an account). Consent is not required for those and pretending
   otherwise trains people to click through banners without reading them.

   OPTIONAL, off until accepted: analytics — our own event pipeline
   (mutra-track.js) and Microsoft Clarity if a project id is configured.
   Nothing analytic runs before a choice is made, which is the compliant
   default rather than the convenient one.

   Do-Not-Track and Global Privacy Control are honoured as a decision already
   taken: those visitors are never asked and never measured. */
(function () {
  const KEY = 'snow-consent';           // 'all' | 'essential'
  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1'
           || navigator.globalPrivacyControl === true;

  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

  let state = dnt ? 'essential' : read();

  window.snowConsent = {
    /** The only question the rest of the site asks. */
    analytics: () => state === 'all',
    state: () => state,
    onChange: (fn) => subs.push(fn),
  };
  const subs = [];
  function decide(v) {
    state = v; write(v);
    subs.forEach((fn) => { try { fn(v); } catch {} });
    if (bar) { bar.classList.remove('in'); setTimeout(() => bar.remove(), 260); }
  }

  if (state) return;                    // already decided, or DNT — no banner

  const bar = document.createElement('div');
  bar.className = 'cc-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookies and analytics');
  bar.innerHTML = `
    <p>We keep a sign-in cookie and remember your settings — that part is needed for the
       site to work. May we also measure how the site is used, so we can improve it?
       <a href="/privacy.html">How we handle data</a></p>
    <div class="cc-btns">
      <button type="button" class="cc-no">Essential only</button>
      <button type="button" class="cc-yes">Allow analytics</button>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
    .cc-bar{position:fixed;left:50%;bottom:16px;transform:translate(-50%,140%);z-index:300;
      width:min(720px,calc(100vw - 24px));display:flex;gap:16px;align-items:center;flex-wrap:wrap;
      justify-content:space-between;padding:14px 18px;border-radius:14px;
      background:rgba(18,18,20,.96);color:#eef3fb;border:1px solid rgba(235,225,210,.16);
      box-shadow:0 20px 50px rgba(0,0,0,.5);backdrop-filter:blur(10px);
      font:400 13.5px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      transition:transform .3s cubic-bezier(.2,.8,.3,1)}
    .cc-bar.in{transform:translate(-50%,0)}
    .cc-bar p{margin:0;flex:1 1 320px;color:#c8cfdd}
    .cc-bar a{color:#e0b48b}
    .cc-btns{display:flex;gap:8px;flex:none}
    .cc-bar button{font:600 13px/1 inherit;border-radius:99px;padding:10px 16px;cursor:pointer;
      border:1px solid rgba(235,225,210,.28);background:none;color:#eef3fb;white-space:nowrap}
    .cc-bar button:hover{border-color:rgba(224,180,139,.7)}
    .cc-bar .cc-yes{background:linear-gradient(96deg,#efe7d8,#e0b48b);border-color:transparent;color:#17140d}
    @media (prefers-reduced-motion:reduce){.cc-bar{transition:none}}
    @media (max-width:560px){.cc-bar{bottom:8px;padding:13px 15px}.cc-btns{width:100%}
      .cc-bar button{flex:1}}`;
  document.head.appendChild(css);

  const show = () => {
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('in'));
    bar.querySelector('.cc-yes').addEventListener('click', () => decide('all'));
    bar.querySelector('.cc-no').addEventListener('click', () => decide('essential'));
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', show);
  else show();
})();
