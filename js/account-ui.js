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

  function renderNav() {
    if (M.user) {
      const who = M.user.name || M.user.email.split('@')[0];
      authWrap.innerHTML =
        (M.user.admin ? `<a class="auth-link auth-dash" href="dashboard.html">Dashboard</a>` : '') +
        `<button class="auth-link auth-who" id="authAccount">${who}</button>` +
        `<button class="auth-link auth-out" id="authLogout">Sign out</button>`;
      authWrap.querySelector('#authLogout').addEventListener('click', () => M.logout());
      authWrap.querySelector('#authAccount').addEventListener('click', onAccountClick);
    } else {
      authWrap.innerHTML = `<button class="auth-link" id="authOpen">Sign in</button>`;
      authWrap.querySelector('#authOpen').addEventListener('click', () => open('login'));
    }
  }

  /** On the catalog, "my account" means "show me my saved tracks". */
  function onAccountClick() {
    const fav = document.getElementById('favToggle');
    const catalog = document.getElementById('catalog');
    if (fav && catalog) {
      if (!fav.classList.contains('active')) fav.click();
      catalog.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // ── modal ──
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" aria-label="Close" title="Close">&times;</button>
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
    signup: 'One Snowstar account — for Mutra and everything else we make.',
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
    titleEl.textContent = signup ? 'Create an account' : 'Sign in';
    subEl.textContent = SUB[mode];
    submitEl.textContent = signup ? 'Create account' : 'Sign in';
    nameField.hidden = !signup;
    newsField.hidden = !signup;
    forgotEl.hidden = signup;
    toSignup.hidden = signup;
    toLogin.hidden = !signup;
    form.password.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    errEl.hidden = true;
  }

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

  M.onChange(renderNav);
  renderNav();
})();
