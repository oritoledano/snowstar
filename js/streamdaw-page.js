/* ═══════════ StreamDAW sale page (apps/streamdaw.html) ══════════════════════
   1. the clips: hero, feature cards, stories (play on screen, pause off it)
   2. the feature rail's arrows, the burger menu, the drawn take on the review still
   3. buying: coupons (typed or ?c=), the Mac from the app (?buy=1&machine=), checkout
      through the shared sign-in, the return from the payment page (?bought / ?pay=)
   4. an owner on this page: the header button and a line above the plans point to
      the unlock page (apps/streamdaw-unlock.html), where keys are requested now.
   5. the free download: a Snowstar account first (the shared sign-up), then the file, then
      the way to the install guide (apps/streamdaw-install.html): macOS stops the installer once. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();

  // ── 1. clips ────────────────────────────────────────────────────────────
  // Files: media/streamdaw/<name>.webm, <name>.mp4, <name>-poster.jpg, <name> from the
  // figure's data-media. Nothing loads until a frame is near the screen; a clip plays only
  // while at least a fifth of it shows and the tab is visible; reduced motion gets the poster
  // and a Play button. A missing file leaves the frame's own background: never a broken image.
  const MEDIA = '../media/streamdaw/';
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(still && still.matches);
  const reels = Array.from(document.querySelectorAll('.reel[data-media]'));

  // Near the screen: the poster only, through an Image first and set once it has loaded, so a
  // missing poster never paints a broken frame over the background.
  function hydrate(fig) {
    if (fig.dataset.ready) return;
    fig.dataset.ready = '1';
    const v = fig.querySelector('video'), name = fig.dataset.media;
    if (!v) return;
    const img = new Image();
    img.onload = () => { v.poster = img.src; fig.classList.add('has-poster'); showBtn(fig); };
    img.src = MEDIA + name + '-poster.jpg';
    v.addEventListener('playing', () => { fig.classList.add('playing'); showBtn(fig); paint(fig); });
    v.addEventListener('pause', () => paint(fig));
  }
  // The first time a clip should play: its sources. Not before, because Chrome fetches a
  // whole file once it has a source, preload="none" or not (measured: a still card pulled
  // its 650 kB clip), and a visitor who asked for less motion may never press Play.
  function attach(fig) {
    if (fig.dataset.src) return;
    fig.dataset.src = '1';
    const v = fig.querySelector('video'), name = fig.dataset.media;
    [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(([ext, type]) => {
      const s = document.createElement('source');
      s.src = MEDIA + name + '.' + ext; s.type = type;
      v.appendChild(s);
    });
    // The last <source> failing means no clip at all: say so, and keep the button away.
    const last = v.querySelector('source:last-of-type');
    if (last) last.addEventListener('error', () => { fig.classList.add('no-clip'); fig.dataset.noClip = '1'; hideBtn(fig); try { v.pause(); } catch (e) {} });
    v.load();
  }
  function btn(fig) { return fig.querySelector('.vbtn'); }
  function showBtn(fig) { const b = btn(fig); if (b && !fig.dataset.noClip) b.hidden = false; }
  function hideBtn(fig) { const b = btn(fig); if (b) b.hidden = true; }
  function paint(fig) {
    const b = btn(fig), v = fig.querySelector('video'); if (!b || !v) return;
    const paused = v.paused;
    b.classList.toggle('is-paused', paused);
    b.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  }
  function sync(fig) {
    const v = fig.querySelector('video'); if (!v || !fig.dataset.ready || fig.dataset.noClip) return;
    const want = fig._seen && !document.hidden && (fig._wanted === true || (fig._wanted !== false && !calm()));
    if (want && v.paused) { attach(fig); const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    else if (!want && !v.paused) v.pause();
    paint(fig);
  }

  if ('IntersectionObserver' in window) {
    // Near the screen: fetch the poster (no bytes of video yet).
    const near = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      near.unobserve(e.target); hydrate(e.target); sync(e.target);
    }), { rootMargin: '600px 600px' });
    // On the screen: a fifth of the frame showing (the hero peeking under the fold counts).
    // The rail clips horizontally, so a card off to the side counts as off.
    const seen = new IntersectionObserver((es) => es.forEach((e) => {
      e.target._seen = e.isIntersecting && e.intersectionRatio >= 0.2; sync(e.target);
    }), { threshold: [0, 0.2, 0.5] });
    reels.forEach((f) => { near.observe(f); seen.observe(f); });
  } else {
    reels.forEach((f) => { hydrate(f); f._seen = true; sync(f); });
  }
  document.addEventListener('visibilitychange', () => reels.forEach(sync));
  if (still && still.addEventListener) still.addEventListener('change', () => reels.forEach(sync));
  // The button: the visitor's choice wins over autoplay until they change it again.
  reels.forEach((fig) => {
    const b = btn(fig); if (!b) return;
    if (calm()) b.classList.add('is-paused');
    b.addEventListener('click', () => {
      const v = fig.querySelector('video'); if (!v) return;
      fig._wanted = v.paused;            // paused → they want it playing, and the reverse
      sync(fig);
    });
  });

  // ── 2. the rail, the menu, the take ────────────────────────────────────
  const rail = $('featRail');
  if (rail) {
    const arrows = document.querySelectorAll('[data-rail]');
    const step = () => { const c = rail.querySelector('.feat'); return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap || 16) : 320; };
    arrows.forEach((a) => a.addEventListener('click', () => {
      const smooth = calm() ? 'auto' : 'smooth';
      rail.scrollBy({ left: step() * Number(a.dataset.rail), behavior: smooth });
    }));
    const ends = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      arrows.forEach((a) => { a.disabled = Number(a.dataset.rail) < 0 ? rail.scrollLeft <= 2 : rail.scrollLeft >= max; });
    };
    rail.addEventListener('scroll', () => requestAnimationFrame(ends), { passive: true });
    window.addEventListener('resize', ends);
    ends();
  }

  (function menu() {
    const b = $('sdBurger'), m = $('sdMenu'); if (!b || !m) return;
    function set(o) {
      document.body.classList.toggle('sd-menu-open', o);
      b.setAttribute('aria-expanded', o ? 'true' : 'false'); m.setAttribute('aria-hidden', o ? 'false' : 'true');
    }
    b.addEventListener('click', () => set(!document.body.classList.contains('sd-menu-open')));
    m.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  })();

  // The voice-over take on its DAW track, in the review still: drawn once, the same every time.
  (function wave() {
    const svg = $('wave'); if (!svg) return;
    let n = 96, w = 400 / n, s = 7, out = '';
    for (let i = 0; i < n; i++) {
      s = (s * 9301 + 49297) % 233280;
      const env = Math.sin(Math.PI * i / n) * (0.55 + 0.45 * Math.abs(Math.sin(i / 6)));
      const h = Math.max(2, 52 * env * (0.35 + 0.65 * s / 233280));
      out += '<rect x="' + (i * w + w * 0.2).toFixed(2) + '" y="' + (30 - h / 2).toFixed(2) + '" width="' + (w * 0.6).toFixed(2) + '" height="' + h.toFixed(2) + '" rx="1" fill="#c8f23a" opacity=".85"/>';
    }
    svg.innerHTML = out;
  })();

  // ── 3. buying ───────────────────────────────────────────────────────────
  // Checkout asks the Worker to sign a HYP pay page, then sends the buyer to it.
  let coupon = null; // {code, free, amount, label}
  // No coupon field on the page (2026-10-13, Ori): a code arrives in a link (?c=, below) or is typed
  // behind the lightbox's "Have a code?". Either way it is checked here and shown on the Pro card.
  const cMsg = $('couponMsg');
  const bigPrice = $('bigPrice'), priceSub = $('priceSub'), stamp = $('stamp'), buyBtn = $('buyBtn');
  const pricing = () => $('pricing');
  const toPricing = (ms) => { const pr = pricing(); if (pr) setTimeout(() => pr.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }), ms || 0); };
  function showMsg(t, ok) { cMsg.textContent = t; cMsg.className = 'msg ' + (ok ? 'ok' : 'bad'); cMsg.hidden = false; }
  // Money is loaded on this page; the fallback keeps the price readable if it is not.
  function ils(a) { return window.Money ? Money.fmt(a / 100) : '₪' + (a / 100).toFixed(0); }
  async function applyCoupon(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) { coupon = null; resetPrice(); cMsg.hidden = true; return; }
    try {
      const r = await fetch('/api/streamdaw/coupon/check', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }) });
      const d = await r.json();
      if (!d.ok) { coupon = null; resetPrice(); showMsg(d.reason || 'That code can’t be used.', false); return; }
      coupon = { code: d.code, free: d.free, amount: d.amount, label: d.label };
      if (d.free) {
        bigPrice.innerHTML = 'Free<small>with ' + d.code + '</small>'; stamp.textContent = 'Coupon';
        priceSub.textContent = 'No payment: the download unlocks right away.';
        buyBtn.textContent = 'Get StreamDAW Pro free';
        showMsg('100% off applied. It’s on the house.', true);
      } else {
        bigPrice.innerHTML = ils(d.amount) + '<small>once · ' + d.label + '</small>'; stamp.textContent = d.label;
        priceSub.textContent = 'Discount applied at checkout.';
        buyBtn.textContent = 'Get StreamDAW Pro · ' + ils(d.amount);
        showMsg(d.label + ' applied: you pay ' + ils(d.amount) + '.', true);
      }
    } catch (e) { showMsg('Could not check that code. Try again.', false); }
  }
  function resetPrice() {
    bigPrice.innerHTML = '<span data-ils="249">' + ils(24900) + '</span><small>one payment · VAT included</small>'; stamp.textContent = 'StreamDAW Pro';
    priceSub.textContent = 'No subscription. Every StreamDAW 1 update included.';
    buyBtn.textContent = 'Get StreamDAW Pro';
  }
  // A coupon can arrive IN THE LINK (snowstar.company/apps/streamdaw.html?c=FRIEND100), so a
  // code can be handed out without asking anyone to type it. Applied on load, the page lands on
  // the price, and the code rides into checkout (HYP's page in this tab, or the lightbox).
  const q = new URLSearchParams(location.search);
  const couponFromLink = (function () {
    const code = (q.get('c') || q.get('coupon') || '').trim();
    if (!code) return Promise.resolve();
    toPricing(400);
    return applyCoupon(code);
  })();

  // Bought from inside the app: "Upgrade" opens this page with ?buy=1&machine=SD…. The Mac
  // rides along to checkout (kept in this tab through the payment page and back, and read by
  // the unlock page too), so the key request files itself once the money is in.
  const MACHINE_RE = /^SD[0-9A-F]{12,20}$/;
  function forMac() { try { const m = sessionStorage.getItem('sd_machine'); return MACHINE_RE.test(m || '') ? m : null; } catch (e) { return null; } }
  (function () {
    const m = (q.get('machine') || '').trim().toUpperCase();
    if (MACHINE_RE.test(m)) { try { sessionStorage.setItem('sd_machine', m); } catch (e) {} }
    const mac = forMac(), box = $('forMac');
    if (mac && box) { box.textContent = 'For this Mac (' + mac + '): the key is made for it after you pay, and arrives by email.'; box.hidden = false; }
    // ?buy=1 (the app's "Upgrade", or "7-day pass" with &plan=pass): the checkout lightbox opens
    // on that plan by itself, with the page behind it at the price. Signed out, the lightbox asks
    // for the sign-in on its own button rather than throwing the sign-up form at them on arrival.
    if (q.get('buy') === '1') {
      toPricing(300);
      setTimeout(() => buy(q.get('plan') === 'pass' ? 'pass' : 'lifetime', { landing: true }), 450);
    } else if (q.get('plan') === 'pass') {
      // ?plan=pass alone: the pass line, ready to press.
      setTimeout(() => { const p = document.querySelector('.pass-btn'); if (p) p.focus({ preventScroll: true }); }, 700);
    }
  })();

  // ── success (a free grant, or back from a paid HYP checkout) ──
  // The Pro card turns into the ticket, and the checkout lightbox shows the result (from the
  // full-page return, ?bought=1); `quiet` when the lightbox itself reported it.
  function success(downloadUrl, free, pass, quiet) {
    const t = $('ticket');
    if (!quiet) {
      // The Pro list goes along before the card below is rewritten: the lightbox lists it too.
      const features = t ? Array.from(t.querySelectorAll('.list li:not(.plus)'))
        .map((li) => (li.firstChild && li.firstChild.nodeType === 3 ? li.firstChild.textContent : li.textContent).trim()).filter(Boolean) : null;
      checkoutUI().then((ui) => { if (ui) ui.result({ bought: true, free: !!free, plan: pass ? 'pass' : 'lifetime', download: downloadUrl || null }, checkoutOpts(pass ? 'pass' : 'lifetime', { features })); });
    }
    if (!t) return;
    const what = pass ? 'pass key' : 'Pro key';
    t.innerHTML = '<span class="tag lime">You’re in</span>'
      + '<div class="price">' + (pass ? 'Pro for 7 days.' : 'Unlocked.') + '</div>'
      + '<p class="note">' + (free ? 'No charge. Enjoy.' : 'Payment received. Thank you.') + ' Your private download link is in your inbox too.'
      + (forMac() ? ' The ' + what + ' for this Mac is being made and arrives by email: paste it into StreamDAW › Settings › Licence.' : ' Next, get the key for your Mac: it takes a minute.')
      + (pass ? ' Buy Pro within 30 days and what you paid comes off.' : '') + '</p>'
      + '<div class="cta">'
      + (downloadUrl ? '<a class="btn lime" href="' + downloadUrl + '">Download StreamDAW</a>' : '')
      + '<a class="btn ' + (downloadUrl ? 'ghost' : 'lime') + '" href="streamdaw-unlock.html"' + (downloadUrl ? ' style="color:var(--paper);border-color:rgba(239,233,218,.5)"' : '') + '>Unlock your Mac</a>'
      + '</div>'
      + '<p class="after">Signed in? It is in your Snowstar account too: download it again any time. '
      + 'macOS asks you to allow the installer once: <a href="streamdaw-install.html">how to install</a>.</p>';
  }

  // ── account: the SAME sign-in lightbox as Mutra and the homepage ──
  const acct = () => window.SnowstarAccount;
  const signedIn = () => { const M = acct(); return !!(M && M.user); };
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }

  // ── checkout: the lightbox (js/streamdaw-checkout.js, loaded from next to this file) ──
  // What you get on the left, HYP's payment page in a frame on the right; the result comes back
  // into it. If its script cannot load, the whole tab goes to HYP as it always did.
  const CHECKOUT_JS = (function () {
    try { return new URL('streamdaw-checkout.js?v=3', document.currentScript.src).href; } catch (e) { return '../js/streamdaw-checkout.js?v=3'; }
  })();
  // THE SWITCH. false: every purchase goes to HYP's own page in this tab, as before, and `?lb=1`
  // turns the lightbox on for one tab, to test. true: the lightbox for everyone (`?lb=0` turns it
  // off for one tab). Off until a live payment has gone through it on HYP's terminal (2026-10-13:
  // Ori's ₪1 test with a coupon); flip this one constant, nothing else.
  const LIGHTBOX_FOR_EVERYONE = false;
  const LIGHTBOX = (function () {
    let tab = null;                        // this tab's own choice, kept through HYP and back
    try {
      if (q.get('lb') === '1' || q.get('lb') === '0') sessionStorage.setItem('sd_lb', q.get('lb'));
      tab = sessionStorage.getItem('sd_lb');
    } catch (e) { tab = q.get('lb'); }
    return tab === '1' ? true : tab === '0' ? false : LIGHTBOX_FOR_EVERYONE;
  })();
  let checkoutLoad = null;
  function checkoutUI() {
    if (!LIGHTBOX) return Promise.resolve(null);
    if (window.SDCheckout) return Promise.resolve(window.SDCheckout);
    if (!checkoutLoad) checkoutLoad = new Promise((res) => {
      const s = document.createElement('script');
      const t = setTimeout(() => res(window.SDCheckout || null), 8000);
      s.src = CHECKOUT_JS; s.async = true;
      s.onload = () => { clearTimeout(t); res(window.SDCheckout || null); };
      s.onerror = () => { clearTimeout(t); checkoutLoad = null; res(null); };
      document.head.appendChild(s);
    });
    return checkoutLoad;
  }
  if (LIGHTBOX) window.addEventListener('load', () => setTimeout(checkoutUI, 600));   // ready before the first click
  function checkoutOpts(plan, extra) {
    return Object.assign({
      plan, machine: forMac(), signedIn,
      coupon: plan === 'lifetime' && coupon ? coupon : null,
      signIn: (resume) => openAuth(plan, resume),
      onCoupon: (c) => { if (!c) { if (coupon) applyCoupon(''); return; } if (c.code && (!coupon || coupon.code !== c.code)) applyCoupon(c.code); },
      onBought: (r) => success(r.download || null, !!r.free, r.plan === 'pass', true),
    }, extra || {});
  }

  // Every purchase needs a Snowstar account first (2026-10-13, Ori). Signed out, a buy button opens
  // the shared sign-up and the purchase carries on once they are in; the Worker refuses a checkout
  // without a session too (sign_in_required). A Google sign-in reloads the page, so the wish is
  // kept in this tab for a while and honoured once the account shows up (section 5 below).
  const BUY_KEY = 'sd_buy_wish', BUY_FOR = 15 * 60 * 1000;
  const wantBuy = () => { try { const w = JSON.parse(sessionStorage.getItem(BUY_KEY) || 'null'); return w && Date.now() - w.t < BUY_FOR ? w.plan : null; } catch (e) { return null; } };
  const keepBuy = (plan) => { try { if (plan) sessionStorage.setItem(BUY_KEY, JSON.stringify({ plan, t: Date.now() })); else sessionStorage.removeItem(BUY_KEY); } catch (e) {} };
  const needsSignIn = (d) => !!d && (d.error === 'sign_in_required' || d.error === 'email_required');

  async function doCheckout(plan, o) {
    plan = plan === 'pass' ? 'pass' : 'lifetime';
    try { sessionStorage.setItem('sd_plan', plan); } catch (e) {}   // read back on a return from HYP's own page
    if (signedIn()) keepBuy(null);
    const ui = await checkoutUI();
    if (ui) { ui.open(checkoutOpts(plan, o)); return; }
    // No lightbox: straight to HYP's page in this tab, signed in first.
    if (!signedIn()) { openAuth(plan); return; }
    // Signed in → the server reads the email from the session; no prompt, no typing.
    const btns = document.querySelectorAll('[data-buy]'); btns.forEach((b) => { b.disabled = true; b.style.opacity = 0.6; });
    try {
      const r = await fetch('/api/streamdaw/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ plan, coupon: plan === 'lifetime' && coupon ? coupon.code : null, machine: forMac() }) });
      const d = await r.json();
      if (d && d.free) { success(d.download, true, plan === 'pass'); toPricing(0); return; }
      if (d && d.url) { location.href = d.url; return; }               // → HYP payment page
      if (needsSignIn(d)) { openAuth(plan); return; }                 // session lost: sign in again
      if (d && d.error === 'coupon') { showMsg(d.reason || 'That coupon can’t be used.', false); return; }
      alert(d && d.error === 'hyp_not_configured'
        ? 'Checkout isn’t switched on yet: the payment terminal still needs its keys.'
        : 'Could not start checkout' + (d && d.error ? ': ' + d.error : '') + '. Please try again.');
    } catch (err) { alert('Network error starting checkout. Please try again.'); }
    finally { btns.forEach((b) => { b.disabled = false; b.style.opacity = 1; }); }
  }
  function openAuth(plan, resume) {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    keepBuy(plan === 'pass' ? 'pass' : 'lifetime'); keepFree(false);
    if (wishOff) { wishOff(); wishOff = null; }       // this press is the wish now
    // Resume the purchase after sign-in, once: the kept wish goes with it.
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(() => { keepBuy(null); (resume || (() => doCheckout(plan)))(); });
    open('signup', plan === 'pass'
      ? 'A free Snowstar account first, then the 7-day pass. Your key and receipt go to its email.'
      : 'A free Snowstar account first, then StreamDAW Pro. Your key and receipt go to its email.', 'app');
  }
  // The checkout lightbox, signed in or not: signed out, the shared sign-in opens over it at once
  // (after a click) and the payment form follows; `landing` (from the app) waits for their press.
  async function buy(plan, o) {
    await ready();
    await couponFromLink;                 // a ?c= code is checked before checkout starts
    return doCheckout(plan, { askSignIn: !(o && o.landing) });
  }
  document.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); buy(el.getAttribute('data-buy')); }));

  // Back from a Google sign-in (the page reloaded on the way): the purchase they pressed carries on.
  // Honoured only if the account is there on arrival or within 20 s (the sign-in's own code
  // redemption); otherwise the wish is dropped, so a later sign-in never opens a payment by surprise.
  // The app's ?buy=1 carries itself through the reload in the address.
  let wishOff = null;
  (async function () {
    if (!wantBuy()) return;
    if (q.get('buy') === '1') { keepBuy(null); return; }
    await ready();
    const go = () => { const p = wantBuy(); if (p && signedIn()) { keepBuy(null); toPricing(0); buy(p); } };
    if (signedIn()) { go(); return; }
    const M = acct(); if (!M || !M.onChange) { keepBuy(null); return; }
    wishOff = M.onChange(() => { if (!signedIn()) return; if (wishOff) { wishOff(); wishOff = null; } go(); });
    setTimeout(() => { if (wishOff) { wishOff(); wishOff = null; keepBuy(null); } }, 20000);
  })();

  // Back from the payment page. The Worker sends ?bought=1 (paid, or a free grant),
  // ?pay=failed&reason=… or ?pay=confirming (charged, still being verified).
  // Inside the lightbox's payment frame (a browser that did not tell the Worker it was framed
  // got the 302, so this whole page loaded in the frame): the result goes to the page around it,
  // our own origin only, and this copy stays out of sight.
  const framedReturn = (function () {
    if (!(q.get('bought') === '1' || q.get('pay'))) return false;
    let top = null; try { top = window.parent !== window && window.parent.location.origin === location.origin ? window.parent : null; } catch (e) { top = null; }
    if (!top) return false;
    let plan = ''; try { plan = sessionStorage.getItem('sd_plan') || ''; } catch (e) {}
    top.postMessage({ type: 'sd-checkout', bought: q.get('bought') === '1', ref: q.get('ref'), plan: plan === 'pass' ? 'pass' : 'lifetime',
      pay: q.get('pay'), reason: q.get('reason') }, location.origin);
    document.documentElement.style.visibility = 'hidden';
    return true;
  })();
  const showResult = (r) => checkoutUI().then((ui) => { if (ui) ui.result(r, checkoutOpts(r.plan)); });
  const lastPlan = () => { try { return sessionStorage.getItem('sd_plan') === 'pass' ? 'pass' : 'lifetime'; } catch (e) { return 'lifetime'; } };
  if (framedReturn) {
    /* the lightbox around this frame shows it */
  } else if (q.get('bought') === '1') {
    toPricing(0);
    let plan = ''; try { plan = sessionStorage.getItem('sd_plan') || ''; } catch (e) {}
    success(null, q.get('free') === '1', plan === 'pass');
  } else if (q.get('pay') === 'failed' && cMsg) {
    showMsg(q.get('reason') === 'declined'
      ? 'The card was declined, so nothing went through. Try again, or use another card.'
      : 'The payment did not go through. Try again, or write to hello@snowstar.company and we will sort it out.', false);
    toPricing(300);
    showResult({ bought: false, pay: 'failed', reason: q.get('reason'), plan: lastPlan() });
  } else if (q.get('pay') === 'confirming' && cMsg) {
    showMsg('Your payment is being confirmed. We will email you as soon as it is, with your download. Nothing to do now.', true);
    toPricing(300);
    showResult({ bought: false, pay: 'confirming', plan: lastPlan() });
  }

  // ── 4. an owner on the sale page ───────────────────────────────────────
  // Keys are requested on the unlock page now. Someone who owns Pro and lands here (an old
  // email says "sign in at snowstar.company/apps/streamdaw") gets pointed there: the header
  // button turns into "Unlock a Mac" and a line shows above the plans. Asked only when
  // signed in, so a visitor never triggers a 401.
  let ownerChecked = null;
  async function ownerCheck() {
    await ready();
    const M = acct(), who = M && M.user ? (M.user.email || M.user.id || 'x') : null;
    if (!who || who === ownerChecked) return;
    ownerChecked = who;
    try {
      const r = await fetch('/api/streamdaw/mine', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      // Pass money paid recently comes off Pro: show this buyer their price.
      // In the visitor's currency like every price here ($ by default); ₪ is what is charged.
      if (d && d.proPrice && d.proPrice < 24900) {
        const big = $('bigPrice'), sub = $('priceSub'), sh = d.proPrice / 100;
        if (big) big.innerHTML = '<span data-ils="' + sh + '">' + ils(d.proPrice) + '</span><small>for you: your pass comes off · VAT included</small>';
        if (sub) sub.textContent = 'Was ' + ils(24900) + ', charged as ₪' + sh + ' incl. VAT. What you paid for your pass is taken off.';
      }
      if (!d || !d.owned) return;
      if (d.plan === 'pass') {                      // a pass: keep the buy buttons, say until when
        const o = $('owned');
        if (o) { o.innerHTML = 'You have a Pro pass until ' + new Date(d.expiresAt * 1000).toISOString().slice(0, 10) + '. <a href="streamdaw-unlock.html">Unlock a Mac</a> <a href="/api/streamdaw/download">Download the installer</a>'; o.hidden = false; }
        return;
      }
      const cta = $('navCta');
      if (cta) { cta.href = 'streamdaw-unlock.html'; cta.removeAttribute('data-free-dl'); cta.innerHTML = 'Unlock<span class="long">a Mac</span>'; }
      const o = $('owned'); if (o) o.hidden = false;
    } catch (e) {}
  }
  ownerCheck();
  (function () { const M = acct(); if (M && M.onChange) M.onChange(() => { ownerCheck(); }); })();

  // ── 5. the free download: a Snowstar account first (2026-10-13) ─────────
  // Every [data-free-dl] link. Signed in: the file. Signed out: the shared sign-up (its
  // newsletter box unticked: consent is theirs to give), and the file once they are in. The
  // Worker sends a signed-out visitor who opens the URL itself back here with ?get=free.
  // A Google sign-in reloads the page, so the wish is kept in this tab for a while
  // (sessionStorage) and honoured once the account shows up; pressing a buy button drops it.
  const FREE_DL = '/api/streamdaw/download/free', FREE_KEY = 'sd_free_dl', FREE_FOR = 15 * 60 * 1000;
  const wantFree = () => { try { const t = +sessionStorage.getItem(FREE_KEY) || 0; return t > 0 && Date.now() - t < FREE_FOR; } catch (e) { return false; } };
  const keepFree = (on) => { try { if (on) sessionStorage.setItem(FREE_KEY, String(Date.now())); else sessionStorage.removeItem(FREE_KEY); } catch (e) {} };
  // Once per wish: the sign-in's resume and the account's change can both call this. The file
  // comes as an attachment, so this page stays, and a strip points to the install guide.
  function startFree() { keepFree(false); location.href = FREE_DL; setTimeout(installHint, 600); }
  function installHint() {
    const h = $('dlHint'), x = $('dlHintX');
    if (!h) return;
    // Above the cookie bar (js/consent.js) while that is still waiting for an answer.
    const cc = document.querySelector('.cc-bar.in');
    h.style.bottom = cc ? (cc.offsetHeight + 28) + 'px' : '';
    h.hidden = false;
    if (x && !x.dataset.on) { x.dataset.on = '1'; x.addEventListener('click', () => { h.hidden = true; }); }
  }
  function freeIfWanted() { if (wantFree() && signedIn()) startFree(); }
  function askFree() {
    const open = window.SnowstarOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    keepFree(true); keepBuy(null);
    if (wishOff) { wishOff(); wishOff = null; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(freeIfWanted);
    open('signup', 'Your free Snowstar account, then the download starts. It includes 7 days of every Pro feature, no card.', 'app');
  }
  async function freeDownload() {
    await ready();
    if (signedIn()) return startFree();
    askFree();
  }
  document.querySelectorAll('[data-free-dl]').forEach((a) => a.addEventListener('click', (e) => {
    if (!a.hasAttribute('data-free-dl')) return;      // an owner's header button points elsewhere now
    e.preventDefault(); freeDownload();
  }));
  document.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => keepFree(false)));
  (async function () {
    const direct = q.get('get') === 'free';
    if (direct) {                                       // tidy the address; the wish is kept above
      keepFree(true);
      const u = new URL(location.href); u.searchParams.delete('get');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    }
    if (!wantFree()) return;
    await ready();
    const M = acct(); if (M && M.onChange) M.onChange(freeIfWanted);   // e.g. back from Google
    if (signedIn()) startFree(); else if (direct) askFree();
  })();
})();

// The feature cards' clips sit level whatever a title's length (2026-10-14): a title the site
// editor made longer wraps to a third line at some widths, so every card's caption band takes
// the tallest one's height. Again after the editor's texts, the fonts, and on resize.
(function () {
  function level() {
    const tops = Array.from(document.querySelectorAll('#featRail .feat-top'));
    if (!tops.length) return;
    tops.forEach((t) => { t.style.minHeight = ''; });
    const h = Math.max.apply(null, tops.map((t) => t.getBoundingClientRect().height));
    tops.forEach((t) => { t.style.minHeight = Math.ceil(h) + 'px'; });
  }
  let pend = 0;
  const soon = () => { cancelAnimationFrame(pend); pend = requestAnimationFrame(level); };
  window.addEventListener('resize', soon);
  window.addEventListener('load', () => { soon(); setTimeout(soon, 800); setTimeout(soon, 2500); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
  const rail = document.getElementById('featRail');
  if (rail && window.MutationObserver) new MutationObserver(soon).observe(rail, { subtree: true, characterData: true, childList: true });
})();
