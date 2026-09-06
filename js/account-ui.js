/* ═══════════ Snowstar account — sign in / create account UI ═══════════
   A small modal driven by SnowstarAccount, shared by every page. The password
   never leaves this form except over HTTPS to /api; the session lives in an
   HttpOnly cookie we can't read.

   The page says where the control belongs with data-account-mount — on Mutra
   that's the header itself, so it stays reachable when the nav collapses
   behind the burger on phones. */
(function () {
  const M = window.SnowstarAccount;
  if (!M) return;

  const host = document.querySelector('[data-account-mount]');
  if (!host) return;

  const authWrap = document.createElement('span');
  authWrap.className = 'mnav-auth';
  const before = host.getAttribute('data-account-before');
  const anchor = before ? host.querySelector(before) : null;
  anchor ? host.insertBefore(authWrap, anchor) : host.appendChild(authWrap);

  // M.onChange fires for reasons that AREN'T a sign-in/out — a profile save's
  // own M.refresh(), a favorite toggled elsewhere on the page. Only reset the
  // open panel when the signed-in identity actually changed; otherwise a
  // successful Save would slam the panel shut before its own confirmation
  // ever painted.
  let lastIdentity;
  function renderNav() {
    const identity = M.user ? M.user.email : null;
    const identityChanged = identity !== lastIdentity;
    lastIdentity = identity;
    const wasOpen = !panel.hidden;

    if (M.user) {
      authWrap.innerHTML = `<button class="auth-link auth-acct" id="authAccount"
        aria-haspopup="true" aria-expanded="false">Account</button>`;
      authWrap.querySelector('#authAccount').addEventListener('click', toggleAcctPanel);
      // the button itself is rebuilt every render (simplest, matches the old
      // code); keep its expanded state truthful if we're NOT about to close it
      if (wasOpen && !identityChanged) authWrap.querySelector('#authAccount').setAttribute('aria-expanded', 'true');
    } else {
      authWrap.innerHTML = `<button class="auth-link" id="authOpen">Sign in</button>`;
      authWrap.querySelector('#authOpen').addEventListener('click', () => open('login'));
    }

    if (identity && identityChanged && resumeFn) {
      const fn = resumeFn; resumeFn = null;
      // after the panel has settled, so the resumed UI is not opened behind a
      // modal that is still closing
      setTimeout(() => { try { fn(); } catch { /* resuming must never break sign-in */ } }, 120);
    }
    if (identityChanged) {
      // a stale user's panel content must never carry over to whoever's
      // looking at the header next
      closeAcctPanel();
      resetAcctDrawers();
    }
  }

  // ── modal ──
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" aria-label="Close" title="Close">&times;</button>
      <aside class="auth-sell" hidden aria-hidden="true">
        <div class="auth-sell-top">
          <div class="auth-sell-kicker">Free account</div>
          <ul class="auth-perks">
            <li>Save tracks and build shortlists</li>
            <li>Download watermarked previews for your edit</li>
            <li><b>10% off</b> your first licence</li>
            <li>First listen to unreleased music</li>
          </ul>
        </div>
        <div class="auth-sell-bot">
          <div class="auth-sell-kicker">When you're ready</div>
          <ul class="auth-perks auth-perks-dim">
            <li>Clean, un-watermarked files</li>
            <li>Cleared for commercial use, worldwide</li>
            <li>Your channels whitelisted \u2014 no Content ID claims</li>
          </ul>
          <p class="auth-sell-price">Licences from <b>\u20aa149</b> per track</p>
        </div>
      </aside>
      <div class="auth-body">
      <h3 id="authTitle">Sign in</h3>
      <p class="auth-sub">Save tracks to your favorites and pick up where you left off.</p>
      <form id="authForm" novalidate>
        <label class="auth-field auth-name" hidden>
          <span>Name</span>
          <input type="text" name="name" autocomplete="name" maxlength="80">
        </label>
        <label class="auth-field">
          <span>Email</span>
          <input type="email" name="email" autocomplete="email" required>
        </label>
        <label class="auth-field">
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required minlength="8">
        </label>
        <label class="auth-check auth-news" hidden>
          <input type="checkbox" name="newsletter">
          <span>Email me occasionally about new tracks and releases</span>
        </label>
        <p class="auth-error" role="alert" hidden></p>
        <button type="submit" class="mbtn mbtn-solid auth-submit">Sign in</button>
      </form>
      <p class="auth-forgot"><a href="/reset.html">Forgot your password?</a></p>
      <p class="auth-alt">or</p>
      <div class="auth-social">
        <a class="auth-soc auth-soc-g" id="socGoogle" href="/api/auth/google">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3 0-5.6-2-6.5-4.8H1.6v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.5 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.6a12 12 0 0 0 0 10.8l3.9-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.6 6.7l3.9 3.1C6.4 6.9 9 4.8 12 4.8z"/></svg>
          Continue with Google
        </a>
        <a class="auth-soc auth-soc-f" id="socFacebook" href="/api/auth/facebook" hidden>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
          Continue with Facebook
        </a>
      </div>
      <p class="auth-switch">
        <span class="auth-to-signup">New here? <button type="button">Create an account</button></span>
        <span class="auth-to-login" hidden>Already have an account? <button type="button">Sign in</button></span>
      </p>
      </div>
      <div class="auth-ok" hidden>
        <div class="auth-tick"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 12.5l5 5L20 7"/></svg></div>
        <h3 class="auth-ok-title">Signed in</h3>
        <p class="auth-ok-sub"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const form = modal.querySelector('#authForm');
  const errEl = modal.querySelector('.auth-error');
  const titleEl = modal.querySelector('#authTitle');
  const subEl = modal.querySelector('.auth-sub');
  const submitEl = modal.querySelector('.auth-submit');
  const nameField = modal.querySelector('.auth-name');
  const newsField = modal.querySelector('.auth-news');
  const forgotEl = modal.querySelector('.auth-forgot');
  const toSignup = modal.querySelector('.auth-to-signup');
  const toLogin = modal.querySelector('.auth-to-login');
  const bodyEl = modal.querySelector('.auth-body');
  const sellEl = modal.querySelector('.auth-sell');
  const okEl = modal.querySelector('.auth-ok');
  const okTitle = modal.querySelector('.auth-ok-title');
  const okSub = modal.querySelector('.auth-ok-sub');
  let mode = 'login';
  let okTimer = null;

  const MESSAGES = {
    invalid_credentials: 'That email and password don’t match.',
    email_taken: 'That email already has an account — try signing in.',
    weak_password: 'Use at least 8 characters.',
    invalid_email: 'That doesn’t look like a valid email.',
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    server_error: 'Something went wrong on our end. Please try again.',
  };

  const SUB = {
    login: 'One Snowstar account — for Mutra and everything else we make.',
    signup: 'No card. Takes about twenty seconds.',
  };

  /** Prefer the page's own toast (the catalog puts one above the player). */
  let toastEl;
  function toast(msg) {
    if (window.mutraToast) return window.mutraToast(msg);
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'acct-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    titleEl.textContent = signup ? 'Start with a free account' : 'Sign in';
    subEl.textContent = SUB[mode];
    submitEl.textContent = signup ? 'Create account' : 'Sign in';
    nameField.hidden = !signup;
    newsField.hidden = !signup;
    forgotEl.hidden = signup;
    toSignup.hidden = signup;
    toLogin.hidden = !signup;
    form.password.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    // The sell panel is for people who have NOT decided yet. Someone signing
    // in has already decided, and pitching them their own account is noise.
    sellEl.hidden = !signup;
    sellEl.setAttribute('aria-hidden', signup ? 'false' : 'true');
    modal.querySelector('.auth-card').classList.toggle('has-sell', signup);
    errEl.hidden = true;
  }

  /* Whatever was on screen when we interrupted them. Auth is always a response
     to something else — a licence half-configured, a download, a favourites
     shelf — and dumping someone back on a blank catalogue after they sign up
     makes them redo the work that triggered the prompt. */
  let resumeFn = null;
  window.SnowstarAuthResume = (fn) => { resumeFn = fn; };

  function open(next, reason) {
    setMode(next || 'login');
    if (reason) subEl.textContent = reason;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => form.email.focus(), 50);
  }

  function close() {
    clearTimeout(okTimer);
    modal.hidden = true;
    document.body.style.overflow = '';
    form.reset();
    errEl.hidden = true;
    okEl.hidden = true;      // back to the form for next time
    bodyEl.hidden = false;
  }

  /** Confirm in the card itself — that's where the eyes are — then close. */
  function succeed(kind, who) {
    okTitle.textContent = kind === 'signup' ? 'Account created' : 'Signed in';
    okSub.textContent = who ? `Welcome, ${who}` : 'You’re all set.';
    bodyEl.hidden = true;
    okEl.hidden = false;
    toast(kind === 'signup'
      ? `Account created — welcome${who ? ', ' + who : ''}`
      : `Signed in${who ? ' as ' + who : ''}`);
    okTimer = setTimeout(close, 1300);
  }

  modal.querySelector('.auth-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
  toSignup.querySelector('button').addEventListener('click', () => setMode('signup'));
  toLogin.querySelector('button').addEventListener('click', () => setMode('login'));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) { showErr('Please fill in both fields.'); return; }
    if (mode === 'signup' && password.length < 8) { showErr(MESSAGES.weak_password); return; }
    submitEl.disabled = true;
    submitEl.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    try {
      if (mode === 'signup') {
        await M.signup({ email, password, name: form.name.value.trim(), newsletter: form.newsletter.checked });
      } else {
        await M.login({ email, password });
      }
      const who = (M.user && (M.user.name || M.user.email.split('@')[0])) || '';
      succeed(mode, who);
    } catch (err) {
      if (err.code === 'email_taken') { offerSignIn(email); return; }
      showErr(MESSAGES[err.code] || 'Couldn’t complete that. Please try again.');
    } finally {
      submitEl.disabled = false;
      submitEl.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  });

  function showErr(msg) { errEl.textContent = msg; errEl.hidden = false; }

  /** Existing email on signup: switch to sign-in with it prefilled, rather than a dead end. */
  function offerSignIn(email) {
    setMode('login');
    form.email.value = email;
    form.password.value = '';
    showErr('You already have an account with that email — enter your password to sign in.');
    setTimeout(() => form.password.focus(), 50);
  }

  // Build the return URL when the link is clicked, not at load — at load the
  // address bar may still hold the previous attempt's parameters.
  modal.querySelectorAll('.auth-soc').forEach(a => {
    const base = a.getAttribute('href');
    a.addEventListener('click', () => {
      const here = new URL(location.href);
      ['auth', 'h', 'why'].forEach(k => here.searchParams.delete(k));
      const q = here.searchParams.toString();
      a.setAttribute('href', base + '?return=' +
        encodeURIComponent(here.pathname + (q ? '?' + q : '')));
    });
  });

  // let the rest of the page ask for the sign-in modal
  window.SnowstarOpenAuth = open;
  window.MutraOpenAuth = open;

  /* Coming back from Google or Facebook, the page just reloads — say what
     happened, and if the cookie somehow didn't stick, say that too. */
  (function reportOAuth() {
    const p = new URLSearchParams(location.search);
    const res = p.get('auth');
    if (!res) return;
    const handoff = p.getAll('h').pop();      // newest wins if an old one lingered
    ['auth', 'h', 'why'].forEach(k => p.delete(k));
    const clean = location.pathname + (p.toString() ? '?' + p : '') + location.hash;
    history.replaceState(null, '', clean);   // don't leave it in the URL
    const once = M.ready ? Promise.resolve() : new Promise(done => {
      const off = M.onChange(() => { off(); done(); });
    });
    once.then(async () => {
      // tell the server what this browser saw; the server half already logs
      try {
        navigator.sendBeacon('/api/track', JSON.stringify({
          type: 'view', sid: 'authdiag' + Math.random().toString(36).slice(2, 10),
          detail: 'auth=' + res + ' user=' + (M.user ? 'yes' : 'no') + ' code=' + (handoff ? 'yes' : 'no'),
          page: '/auth-diag',
        }));
      } catch {}
      if (res === 'ok') {
        // the redirect's cookie may not have survived; redeem the code instead
        if (!M.user && handoff) {
          try { await M.claim(handoff); } catch (e) { /* fall through to the message */ }
        }
        if (M.user) {
          const who = M.user.name || M.user.email.split('@')[0];
          toast('Signed in as ' + who);
        } else {
          open('login', 'That sign-in couldn\u2019t be completed in this browser. Try your password, or another browser.');
        }
      } else if (res === 'unavailable') {
        open('login', 'That sign-in method isn\u2019t switched on yet.');
      } else {
        open('login', 'That sign-in didn\u2019t complete. Please try again.');
      }
    });
  })();

  /* ═══════════ Account panel ═══════════
     One dropdown under the "Account" button: who's signed in, then Downloads
     / Favorites / User info as accordion drawers (fetched on first open, so
     signing in never costs three extra round-trips), then Dashboard (owner
     only) and Sign out. Built once; repainted on every M.onChange so an edit
     from elsewhere (e.g. the dashboard renaming this member) shows up live. */
  const COUNTRIES = ['Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia',
    'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus',
    'Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil',
    'Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon','Canada','Cape Verde',
    'Central African Republic','Chad','Chile','China','Colombia','Comoros','Costa Rica','Croatia',
    'Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominican Republic','Ecuador','Egypt',
    'El Salvador','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia',
    'Georgia','Germany','Ghana','Greece','Guatemala','Guinea','Guyana','Haiti','Honduras',
    'Hong Kong','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
    'Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kosovo','Kuwait','Kyrgyzstan',
    'Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
    'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico',
    'Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nepal',
    'Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia',
    'Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru',
    'Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal',
    'Serbia','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa',
    'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria',
    'Taiwan','Tajikistan','Tanzania','Thailand','Togo','Trinidad and Tobago','Tunisia','Turkey',
    'Turkmenistan','Uganda','Ukraine','United Arab Emirates','United Kingdom', 'United States',
    'Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe','Other'];

  const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  /* Root-absolute, always. The account panel is mounted on every page —
     including /apps/streamdaw.html — and a bare "mutra.html" there resolves to
     /apps/mutra.html, which is a 404. */
  const trackLink = (slug) => '/mutra.html?track=' + encodeURIComponent(slug);

  const panel = document.createElement('div');
  panel.className = 'acct-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="acct-head">
      <b class="acct-name"></b>
      <span class="acct-subline"></span>
    </div>
    <div class="acct-section">
      <p class="acct-label">My account</p>
      <div class="acct-acc" data-key="licences">
        <button class="acct-row" type="button">My licences <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="downloads">
        <button class="acct-row" type="button">Downloads <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="favorites">
        <button class="acct-row" type="button">Favorites <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="clearlist">
        <button class="acct-row" type="button">Clear my channels <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="artist" hidden>
        <button class="acct-row" type="button">My artist profile <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="apps" hidden>
        <button class="acct-row" type="button">My apps <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="snowstash" hidden>
        <button class="acct-row" type="button">Snowstash <span class="acct-count"></span>
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
      <div class="acct-acc" data-key="profile">
        <button class="acct-row" type="button">User info
          <svg class="acct-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="acct-drawer" hidden></div>
      </div>
    </div>
    <div class="acct-section acct-foot">
      <a class="acct-row acct-dashlink" href="/dashboard.html" hidden>Dashboard</a>
      <button class="acct-row acct-signout" type="button">Sign out</button>
    </div>`;
  document.body.appendChild(panel);

  function closeAcctPanel() {
    panel.hidden = true;
    const btn = document.getElementById('authAccount');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    panel.querySelectorAll('.acct-acc.open').forEach(a => {
      a.classList.remove('open');
      a.querySelector('.acct-drawer').hidden = true;
    });
  }

  /** Forget fetched drawer content — called whenever WHO is signed in changes,
   * so a second person on the same browser never sees the first person's list. */
  function resetAcctDrawers() {

    panel.querySelectorAll('.acct-drawer').forEach(d => { d.innerHTML = ''; });
    panel.querySelectorAll('.acct-count').forEach(c => { c.textContent = ''; });
  }

  function positionPanel() {
    const btn = document.getElementById('authAccount');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    let left = r.right - width;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    panel.style.width = width + 'px';
    panel.style.top = (r.bottom + 10) + 'px';
    panel.style.left = left + 'px';
  }

  async function toggleAcctPanel(e) {
    e.stopPropagation();
    if (!panel.hidden) { closeAcctPanel(); return; }
    paintAcctHead();
    revealSections();
    positionPanel();
    panel.hidden = false;
    document.getElementById('authAccount').setAttribute('aria-expanded', 'true');
  }

  function paintAcctHead() {
    if (!M.user) return;
    const who = M.user.name || M.user.email.split('@')[0];
    panel.querySelector('.acct-name').textContent = who;
    const via = { google: 'Google account', facebook: 'Facebook account' }[M.user.via];
    panel.querySelector('.acct-subline').textContent = via ? `${via} · ${M.user.email}` : M.user.email;
    panel.querySelector('.acct-dashlink').hidden = !M.user.admin;
  }

  // ── accordion: one drawer open at a time, content fetched on first open ──

  panel.querySelectorAll('.acct-acc > .acct-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.acct-acc');
      const key = acc.dataset.key;
      const opening = !acc.classList.contains('open');
      // [hidden] carries !important site-wide (account.css) specifically so a
      // stray class can never leave a panel stuck open — so drawer visibility
      // must be driven by the hidden PROPERTY, not just the .open class
      panel.querySelectorAll('.acct-acc.open').forEach(a => {
        a.classList.remove('open');
        a.querySelector('.acct-drawer').hidden = true;
      });
      if (opening) {
        acc.classList.add('open');
        acc.querySelector('.acct-drawer').hidden = false;
        positionPanel();
        // Always re-fetch. Loading once and caching meant a download or a
        // favourite made in the same session left the drawer showing what was
        // true when you first opened it, and only a page reload fixed it.
        // These lists are tens of rows; the fetch is cheaper than the confusion.
        loadDrawer(key);
      }
    });
  });


  /* ── the three cross-product rows ────────────────────────────────────────
     Each appears only for an account that actually has that thing: a menu
     offering "My apps" to somebody who owns none is a dead end, and a menu
     hiding "Snowstash" from somebody with three reports is a bug. Presence is
     decided once at open (revealSections) so the row never flickers in. */

  function paintArtistRow() {
    const el = drawerFor('artist');
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    Promise.all([
      fetch('/api/artist/uploads', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/credits', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([d, c]) => {
      const ups = (d && d.uploads) || [];
      const credits = (c && c.credits) || [];
      const name = (d && d.artist_name) || '';
      const live = ups.filter((u) => u.published_slug);
      el.innerHTML = `
        ${name ? `<div class="acct-artist-head"><b>${esc(name)}</b>
            <a class="acct-mini" href="/artist.html?name=${encodeURIComponent(name)}">View page</a>
            <a class="acct-mini" href="/artist.html?name=${encodeURIComponent(name)}#edit">Edit</a></div>` : ''}
        <div class="acct-statline">
          <span><b>${ups.length}</b> uploaded</span>
          <span><b>${live.length}</b> in the catalogue</span>
          ${credits.length ? `<span><b>${credits.length}</b> credited</span>` : ''}
        </div>
        ${ups.length ? `<ul class="acct-items">${ups.slice(0, 8).map((u) => `
          <li class="acct-item">
            <span class="acct-item-name">${esc(u.title || u.orig_name || 'Untitled')}</span>
            <span class="acct-item-date">${esc(u.published_slug ? 'live' : (u.status || 'in review'))}</span>
          </li>`).join('')}</ul>`
          : '<p class="acct-empty">Nothing uploaded yet.</p>'}
        <a class="acct-mini acct-mini-block" href="/artists.html">Upload more music →</a>`;
    });
  }

  function paintApps() {
    const el = drawerFor('apps');
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    fetch('/api/streamdaw/mine', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => {
        if (!d || !d.owned) {
          el.innerHTML = `<p class="acct-empty">No apps yet.</p>
            <a class="acct-mini acct-mini-block" href="/apps/streamdaw.html">See StreamDAW →</a>`;
          return;
        }
        const rel = d.release || {};
        el.innerHTML = `
          <ul class="acct-items"><li class="acct-item">
            <span class="acct-item-name">StreamDAW${rel.version ? ` <i>${esc(rel.version)}</i>` : ''}</span>
            <span class="acct-item-date">${d.since ? fmtDate(d.since) : ''}</span>
          </li></ul>
          <p class="acct-note">Your licence follows this account — sign in on a new machine and
          download again.</p>
          <a class="acct-mini acct-mini-block" href="/api/streamdaw/download">Download the installer →</a>`;
      });
  }

  function paintStash() {
    const el = drawerFor('snowstash');
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    fetch('/api/snowstash/mine', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => {
        const scans = (d && d.scans) || [];
        if (!scans.length) {
          el.innerHTML = `<p class="acct-empty">No reports yet.</p>
            <a class="acct-mini acct-mini-block" href="/snowstash.html">Run a check →</a>`;
          return;
        }
        el.innerHTML = `<ul class="acct-items">${scans.slice(0, 10).map((sc) => `
          <li class="acct-item">
            <a class="acct-item-name" href="/snowstash.html?scan=${encodeURIComponent(sc.id)}">${esc(sc.artist_name || 'Report')}</a>
            <span class="acct-item-date">${sc.created_at ? fmtDate(sc.created_at) : ''}${
              sc.unlocked ? ' · full' : (sc.status ? ' · ' + esc(sc.status) : '')}</span>
          </li>`).join('')}</ul>
          <a class="acct-mini acct-mini-block" href="/snowstash.html">Run another check →</a>`;
      });
  }

  /* Which of the three rows this account should even see. One pass at open,
     failing silent: a row that cannot be decided stays hidden rather than
     showing an empty drawer. */
  async function revealSections() {
    const show = (key, on, n) => {
      const row = panel.querySelector(`.acct-acc[data-key="${key}"]`);
      if (!row) return;
      row.hidden = !on;
      if (on && n) countFor(key, n);
    };
    try {
      const [up, app, st] = await Promise.all([
        fetch('/api/artist/uploads', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/streamdaw/mine', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/snowstash/mine', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const ups = (up && up.uploads) || [];
      show('artist', !!(up && (up.artist || ups.length)), ups.length);
      show('apps', !!(app && app.owned), 1);
      const scans = (st && st.scans) || [];
      show('snowstash', scans.length > 0, scans.length);
    } catch { /* leave them hidden */ }
  }

  function drawerFor(key) { return panel.querySelector(`.acct-acc[data-key="${key}"] .acct-drawer`); }
  function countFor(key, n) { panel.querySelector(`.acct-acc[data-key="${key}"] .acct-count`).textContent = n ? `(${n})` : ''; }

  const ICON_DL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16"/></svg>';
  const ICON_HEART = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 20.4l-1.4-1.3C5.6 14.6 2.7 12 2.7 8.7 2.7 6.1 4.7 4 7.3 4c1.5 0 2.9.7 3.8 1.8l.9 1.1.9-1.1C13.8 4.7 15.2 4 16.7 4c2.6 0 4.6 2.1 4.6 4.7 0 3.3-2.9 5.9-7.9 10.4L12 20.4z" fill="currentColor"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  async function loadDrawer(key) {
    if (key === 'licences') return paintLicences();
    if (key === 'profile') return paintProfileForm();
    if (key === 'clearlist') return paintClearlist();
    if (key === 'artist') return paintArtistRow();
    if (key === 'apps') return paintApps();
    if (key === 'snowstash') return paintStash();
    const el = drawerFor(key);
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    try {
      const path = key === 'downloads' ? '/downloads' : '/favorites/list?product=' + encodeURIComponent(M.product);
      const d = await M.api(path);
      const items = key === 'downloads' ? d.downloads : d.favorites;
      countFor(key, items.length);
      if (!items.length) {
        el.innerHTML = `<p class="acct-empty">${key === 'downloads' ? 'Nothing downloaded yet.' : 'Nothing favorited yet.'}</p>`;
        return;
      }
      const icon = key === 'downloads' ? ICON_DL : ICON_HEART;
      el.innerHTML = `<ul class="acct-list">${items.map(it => `
        <li data-slug="${esc(it.slug)}">
          <span class="acct-item-icon">${icon}</span>
          <a href="${trackLink(it.slug)}">${esc(it.title || it.slug)}</a>
          <span class="acct-item-date">${fmtDate(it.ts)}${key === 'downloads' && it.times > 1 ? ` · ${it.times}×` : ''}</span>
          ${key === 'favorites' ? `<button type="button" class="acct-item-remove" aria-label="Remove ${esc(it.title || it.slug)} from favorites" title="Remove from favorites">${ICON_X}</button>` : ''}
        </li>`).join('')}</ul>`;
      if (key === 'favorites') {
        el.querySelectorAll('.acct-item-remove').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const li = btn.closest('li');
            const slug = li.dataset.slug;
            btn.disabled = true;
            await M.toggleFavorite(slug); // optimistic — reconciles with the server itself
            loadDrawer('favorites'); // re-fetch so the list + count stay truthful
          });
        });
      }
    } catch {
      el.innerHTML = '<p class="acct-empty">Couldn’t load that right now.</p>';
    }
  }


  /* ═══════════ Licences ═══════════
     What somebody actually bought, and the three things they need after buying:
     the clean file, something to show a client, and a reminder before it runs
     out. A licence they cannot find is a licence they will email us about. */
  const CAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  function calLink(lic) {
    if (!lic.expires_at) return null;
    // All-day event on the expiry date, plus a reminder the week before is
    // Google's own default for all-day events — no need to fight it.
    const d = new Date(lic.expires_at * 1000);
    const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');
    const end = new Date(lic.expires_at * 1000 + 864e5);
    const q = new URLSearchParams({
      text: `Mutra licence expires — ${lic.slug}`,
      dates: `${ymd(d)}/${ymd(end)}`,
      details: `Licence ${lic.ref} for "${lic.slug}" expires today.\n\n`
        + `Renew before this date to keep using the track — including in work already published.\n`
        + `https://snowstar.company/mutra.html?license=${encodeURIComponent(lic.slug)}`,
    });
    return `${CAL}&${q}`;
  }

  async function paintLicences() {
    const el = drawerFor('licences');
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    let d;
    try { d = await M.api('/licence/mine'); }
    catch { el.innerHTML = '<p class="acct-empty">Couldn’t load that right now.</p>'; return; }

    const lics = d.licences || [];
    const open = (d.requests || []).filter((r) => r.status !== 'granted');
    /* "In review" means a person is deciding — which is only ever true of a
       quote. A self-serve request that has not been paid yet is not under
       review, it is unfinished, and calling it "in review" told a customer who
       had just been charged that somebody was still thinking about it. */
    const reqs = open.filter((r) => r.lane === 'quote');
    const unpaid = open.filter((r) => r.lane !== 'quote');
    countFor('licences', lics.length);

    if (!lics.length && !reqs.length) {
      el.innerHTML = '<p class="acct-empty">No licences yet.</p>';
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    el.innerHTML = `
      ${lics.length ? `<ul class="acct-lics">${lics.map((l) => {
        const expired = l.expires_at && l.expires_at < now;
        const revoked = !!l.revoked_at;
        const days = l.expires_at ? Math.ceil((l.expires_at - now) / 86400) : null;
        const cal = calLink(l);
        return `<li class="acct-lic${revoked ? ' is-revoked' : expired ? ' is-expired' : ''}">
          <div class="acct-lic-top">
            <a class="acct-lic-name" href="${trackLink(l.slug)}">${esc(l.slug)}</a>
            <span class="acct-lic-state">${revoked ? 'Revoked'
              : expired ? 'Expired'
              : l.expires_at ? `${days} day${days === 1 ? '' : 's'} left` : 'No end date'}</span>
          </div>
          <div class="acct-lic-ref">${esc(l.ref)}</div>
          <div class="acct-lic-acts">
            ${revoked || expired ? '' :
              `<a href="/api/download?slug=${encodeURIComponent(l.slug)}">Download</a>`}
            <a href="/api/licence/certificate?ref=${encodeURIComponent(l.ref)}" target="_blank" rel="noopener">Certificate</a>
            ${cal && !revoked ? `<a href="${cal}" target="_blank" rel="noopener noreferrer">Add reminder</a>` : ''}
          </div>
        </li>`;
      }).join('')}</ul>` : ''}
      ${reqs.length ? `<p class="acct-label acct-lic-pending">In review</p>
        <ul class="acct-list">${reqs.map((r) => `
          <li><a href="${trackLink(r.slug)}">${esc(r.slug)}</a>
            <span class="acct-item-date">${esc(r.status)}</span></li>`).join('')}</ul>` : ''}
      ${unpaid.length ? `<p class="acct-label">Not finished</p>
        <ul class="acct-list">${unpaid.map((r) => `
          <li><a href="${trackLink(r.slug)}">${esc(r.slug)}</a>
            <span class="acct-item-date">payment not completed</span></li>`).join('')}</ul>` : ''}`;
  }

  /* ═══════════ Clearlist ═══════════
     A licence does not stop Content ID: it matches audio, not paperwork. So a
     properly licensed track can still collect an automated claim. The fix is a
     whitelist — telling the platform in advance which channels are allowed.
     Channels stay "pending" until they have actually been cleared, because a
     premature "you're covered" is worse than promising nothing. */
  async function paintClearlist() {
    const el = drawerFor('clearlist');
    el.innerHTML = '<p class="acct-empty">Loading…</p>';
    let d;
    try { d = await M.api('/channels'); }
    catch { el.innerHTML = '<p class="acct-empty">Couldn’t load that right now.</p>'; return; }

    const P = d.platforms || {};
    const items = d.channels || [];
    countFor('clearlist', items.length);

    el.innerHTML = `
      <p class="cl-intro">Using our music on a channel? Add it here and we'll whitelist it,
        so an automated copyright claim never lands on your video.</p>
      ${items.length ? `<ul class="cl-list">${items.map(c => `
        <li data-id="${c.id}">
          <span class="cl-plat">${esc((P[c.platform] || {}).label || c.platform)}</span>
          <span class="cl-val">${esc(c.value)}</span>
          <span class="cl-status ${esc(c.status)}">${c.status === 'cleared' ? 'cleared'
            : c.status === 'rejected' ? 'not cleared' : 'pending'}</span>
          <button type="button" class="cl-rm" aria-label="Remove ${esc(c.value)}">&times;</button>
        </li>`).join('')}</ul>` : '<p class="acct-empty">No channels added yet.</p>'}
      <form class="cl-add">
        <select class="cl-p">${Object.entries(P).map(([k, v]) =>
          `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
        <input class="cl-v" maxlength="300" placeholder="${esc((P.youtube || {}).hint || '')}" required>
        <button type="submit" class="cl-go">Add</button>
      </form>
      <p class="cl-note">Pending means we've got it and haven't cleared it yet — we'll
        confirm once it's done.</p>`;

    const sel = el.querySelector('.cl-p'), val = el.querySelector('.cl-v');
    sel.addEventListener('change', () => {
      val.placeholder = (P[sel.value] || {}).hint || '';
    });

    el.querySelector('.cl-add').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = el.querySelector('.cl-go');
      btn.disabled = true;
      try {
        await M.api('/channels', { method: 'POST',
          body: JSON.stringify({ platform: sel.value, value: val.value }) });
        toast('Channel added');
        paintClearlist();
      } catch { btn.disabled = false; toast('Couldn’t add that'); }
    });

    el.querySelectorAll('.cl-rm').forEach(b => b.addEventListener('click', async () => {
      const id = Number(b.closest('li').dataset.id);
      b.disabled = true;
      try { await M.api('/channels/remove', { method: 'POST', body: JSON.stringify({ id }) }); paintClearlist(); }
      catch { b.disabled = false; }
    }));
  }

  // ── profile form ──
  function paintProfileForm() {
    const el = drawerFor('profile');
    const u = M.user;
    el.innerHTML = `
      <div class="acct-avatar">
        <div class="acct-av-img">${u.avatar
          ? `<img src="${esc(u.avatar)}" alt="">`
          : `<span>${esc((u.name || u.email || '?').trim().charAt(0).toUpperCase())}</span>`}</div>
        <div class="acct-av-acts">
          <label class="acct-av-btn">Upload<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${u.avatar ? '<button type="button" class="acct-av-rm">Remove</button>' : ''}
          <span class="acct-av-stat"></span>
        </div>
      </div>
      <form class="acct-form" id="acctForm">
        <div class="acct-2col">
          <label class="acct-field"><span>First name</span><input name="first_name" maxlength="60"></label>
          <label class="acct-field"><span>Last name</span><input name="last_name" maxlength="60"></label>
        </div>
        <label class="acct-field"><span>Country</span>
          <select name="country"><option value="">—</option>${COUNTRIES.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label class="acct-field"><span>Phone</span><input name="phone" type="tel" maxlength="30"></label>
        <label class="acct-field"><span>Email</span><input name="email" type="email" maxlength="254" ${u.has_password ? '' : 'disabled'}></label>
        <label class="acct-field acct-pw" hidden><span>Current password, to confirm the change</span>
          <input name="current_password" type="password" autocomplete="current-password"></label>
        <p class="acct-note">${u.has_password ? '' : `Managed by your ${{ google: 'Google', facebook: 'Facebook' }[u.via] || 'social'} sign-in.`}</p>
        <div class="acct-2col">
          <label class="acct-field"><span>Role</span><input name="role" maxlength="80" placeholder="e.g. Music Supervisor"></label>
          <label class="acct-field"><span>Company</span><input name="company" maxlength="80"></label>
        </div>
        <p class="acct-status" hidden></p>
        <button type="submit" class="acct-save">Save</button>
      </form>`;
    // ── profile picture ──
    const avStat = el.querySelector('.acct-av-stat');
    el.querySelector('.acct-av-btn input').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      avStat.textContent = 'Uploading…';
      try {
        const r = await fetch('/api/avatar', {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': f.type }, body: f,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'failed');
        M.user.avatar = d.avatar;
        await M.refresh();
        paintProfileForm();
        toast('Picture updated');
      } catch { avStat.textContent = 'Couldn’t upload that.'; }
    });
    const rm = el.querySelector('.acct-av-rm');
    if (rm) rm.addEventListener('click', async () => {
      avStat.textContent = 'Removing…';
      try {
        await M.api('/avatar/clear', { method: 'POST', body: JSON.stringify({}) });
        M.user.avatar = null;
        await M.refresh();
        paintProfileForm();
        toast('Picture removed');
      } catch { avStat.textContent = 'Couldn’t remove that.'; }
    });

    const form = el.querySelector('#acctForm');
    form.first_name.value = u.first_name || '';
    form.last_name.value = u.last_name || '';
    form.country.value = u.country || '';
    form.phone.value = u.phone || '';
    form.email.value = u.email || '';
    form.role.value = u.role || '';
    form.company.value = u.company || '';
    const originalEmail = u.email || '';
    const pwField = el.querySelector('.acct-pw');
    form.email.addEventListener('input', () => { pwField.hidden = form.email.value.trim().toLowerCase() === originalEmail; });

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const status = el.querySelector('.acct-status');
      status.hidden = true;
      const btn = el.querySelector('.acct-save');
      btn.disabled = true; btn.textContent = 'Saving…';
      const body = {
        first_name: form.first_name.value, last_name: form.last_name.value,
        country: form.country.value, phone: form.phone.value,
        role: form.role.value, company: form.company.value,
      };
      const newEmail = form.email.value.trim().toLowerCase();
      if (u.has_password && newEmail !== originalEmail) {
        body.email = newEmail;
        body.current_password = form.current_password.value;
      }
      try {
        const d = await M.api('/profile', { method: 'POST', body: JSON.stringify(body) });
        M.user = d.user;
        await M.refresh();
        paintAcctHead();
        status.textContent = 'Saved.'; status.className = 'acct-status ok'; status.hidden = false;
        toast('Profile saved');
      } catch (e2) {
        const msg = { wrong_password: 'That password isn’t right.', email_taken: 'That email is already in use.',
          invalid_email: 'That doesn’t look like a valid email.', email_locked_oauth: 'Email is managed by your social sign-in.' }[e2.code]
          || 'Couldn’t save that — try again.';
        status.textContent = msg; status.className = 'acct-status err'; status.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = 'Save';
      }
    });
  }

  panel.querySelector('.acct-signout').addEventListener('click', () => { closeAcctPanel(); M.logout(); });
  document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && e.target.id !== 'authAccount') closeAcctPanel(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closeAcctPanel(); });
  addEventListener('resize', () => { if (!panel.hidden) positionPanel(); });

  M.onChange(renderNav);
  renderNav();
})();
