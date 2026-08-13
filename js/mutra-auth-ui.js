/* ═══════════ Mutra — sign in / create account UI ═══════════
   A small modal driven by MutraMembers. The password never leaves this form
   except over HTTPS to /api; the session lives in an HttpOnly cookie we can't read. */
(function () {
  const M = window.MutraMembers;
  if (!M) return;

  const nav = document.getElementById('mnavLinks');
  const header = document.getElementById('mnav');
  if (!nav || !header) return;

  // ── entry point: lives in the header so it stays reachable when the nav
  //    collapses behind the burger on phones ──
  const authWrap = document.createElement('span');
  authWrap.className = 'mnav-auth';
  header.insertBefore(authWrap, header.querySelector('.mnav-burger'));

  function renderNav() {
    if (M.user) {
      const who = M.user.name || M.user.email.split('@')[0];
      authWrap.innerHTML = `<button class="auth-link" id="authAccount">${who}</button>` +
        `<button class="auth-link auth-out" id="authLogout">Sign out</button>`;
      authWrap.querySelector('#authLogout').addEventListener('click', () => M.logout());
      authWrap.querySelector('#authAccount').addEventListener('click', () => {
        const fav = document.getElementById('favToggle');
        if (fav && !fav.classList.contains('active')) fav.click();
        document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      authWrap.innerHTML = `<button class="auth-link" id="authOpen">Sign in</button>`;
      authWrap.querySelector('#authOpen').addEventListener('click', () => open('login'));
    }
  }

  // ── modal ──
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" aria-label="Close" title="Close">&times;</button>
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
  let mode = 'login';

  const MESSAGES = {
    invalid_credentials: 'That email and password don’t match.',
    email_taken: 'That email already has an account — try signing in.',
    weak_password: 'Use at least 8 characters.',
    invalid_email: 'That doesn’t look like a valid email.',
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    server_error: 'Something went wrong on our end. Please try again.',
  };

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    titleEl.textContent = signup ? 'Create an account' : 'Sign in';
    subEl.textContent = signup
      ? 'Save favorites across your devices.'
      : 'Save tracks to your favorites and pick up where you left off.';
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
    modal.hidden = true;
    document.body.style.overflow = '';
    form.reset();
    errEl.hidden = true;
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
      const who = (M.user && (M.user.name || M.user.email)) || '';
      close();
      if (window.mutraToast) mutraToast(mode === 'signup' ? `Account created — welcome${who ? ', ' + who : ''}` : `Signed in${who ? ' as ' + who : ''}`);
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
  window.MutraOpenAuth = open;

  M.onChange(renderNav);
  renderNav();
})();
