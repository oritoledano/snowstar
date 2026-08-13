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
      authWrap.innerHTML = `<button class="auth-link auth-who" id="authAccount">${who}</button>` +
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

  // let the rest of the page ask for the sign-in modal
  window.SnowstarOpenAuth = open;
  window.MutraOpenAuth = open;

  M.onChange(renderNav);
  renderNav();
})();
