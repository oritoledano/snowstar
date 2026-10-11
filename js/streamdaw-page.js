/* ═══════════ StreamDAW sale page (apps/streamdaw.html) ══════════════════════
   1. the clips: hero, feature cards, stories (play on screen, pause off it)
   2. the feature rail's arrows, the burger menu, the drawn take on the review still
   3. buying: coupons (typed or ?c=), the Mac from the app (?buy=1&machine=), checkout
      through the shared sign-in, the return from the payment page (?bought / ?pay=)
   4. an owner on this page: the header button and a line above the plans point to
      the unlock page (apps/streamdaw-unlock.html), where keys are requested now. */
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
  const cIn = $('couponInput'), cMsg = $('couponMsg');
  const bigPrice = $('bigPrice'), priceSub = $('priceSub'), stamp = $('stamp'), buyBtn = $('buyBtn');
  const pricing = () => $('pricing');
  const toPricing = (ms) => { const pr = pricing(); if (pr) setTimeout(() => pr.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }), ms || 0); };
  function showMsg(t, ok) { cMsg.textContent = t; cMsg.className = 'msg ' + (ok ? 'ok' : 'bad'); cMsg.hidden = false; }
  // Money is loaded on this page; the fallback keeps the price readable if it is not.
  function ils(a) { return window.Money ? Money.fmt(a / 100) : '₪' + (a / 100).toFixed(0); }
  async function applyCoupon() {
    const code = (cIn.value || '').trim();
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
  if (cIn) {
    $('couponApply').addEventListener('click', applyCoupon);
    cIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });
  }

  // A coupon can arrive IN THE LINK (snowstar.company/apps/streamdaw.html?c=FRIEND100), so a
  // code can be handed out without asking anyone to type it. Applied on load, and the page
  // lands on the price, the only place the code means something.
  const q = new URLSearchParams(location.search);
  (function () {
    const code = (q.get('c') || q.get('coupon') || '').trim();
    if (!code || !cIn) return;
    cIn.value = code.toUpperCase();
    applyCoupon();
    toPricing(400);
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
    if (q.get('buy') === '1') toPricing(300);
  })();

  // ── success (a free grant, or back from a paid HYP checkout) ──
  function success(downloadUrl, free) {
    const t = $('ticket'); if (!t) return;
    t.innerHTML = '<span class="tag lime">You’re in</span>'
      + '<div class="price">Unlocked.</div>'
      + '<p class="note">' + (free ? 'No charge. Enjoy.' : 'Payment received. Thank you.') + ' Your private download link is in your inbox too.'
      + (forMac() ? ' The Pro key for this Mac is being made and arrives by email: paste it into StreamDAW › Settings › Licence.' : ' Next, get the key for your Mac: it takes a minute.') + '</p>'
      + '<div class="cta">'
      + (downloadUrl ? '<a class="btn lime" href="' + downloadUrl + '">Download StreamDAW</a>' : '')
      + '<a class="btn ' + (downloadUrl ? 'ghost' : 'lime') + '" href="streamdaw-unlock.html"' + (downloadUrl ? ' style="color:var(--paper);border-color:rgba(239,233,218,.5)"' : '') + '>Unlock your Mac</a>'
      + '</div>'
      + '<p class="after">Signed in? It is in your Snowstar account too: download it again any time.</p>';
  }

  // ── account: the SAME sign-in lightbox as Mutra and the homepage ──
  const acct = () => window.SnowstarAccount;
  const signedIn = () => { const M = acct(); return !!(M && M.user); };
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }

  async function doCheckout() {
    // Signed in → the server reads the email from the session; no prompt, no typing.
    const btns = document.querySelectorAll('[data-buy]'); btns.forEach((b) => { b.disabled = true; b.style.opacity = 0.6; });
    try {
      const r = await fetch('/api/streamdaw/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ plan: 'lifetime', coupon: coupon && coupon.code, machine: forMac() }) });
      const d = await r.json();
      if (d && d.free) { success(d.download, true); toPricing(0); return; }
      if (d && d.url) { location.href = d.url; return; }               // → HYP payment page
      if (d && d.error === 'email_required') { openAuth(); return; }   // session lost: sign in again
      if (d && d.error === 'coupon') { showMsg(d.reason || 'That coupon can’t be used.', false); return; }
      alert(d && d.error === 'hyp_not_configured'
        ? 'Checkout isn’t switched on yet: the payment terminal still needs its keys.'
        : 'Could not start checkout' + (d && d.error ? ': ' + d.error : '') + '. Please try again.');
    } catch (err) { alert('Network error starting checkout. Please try again.'); }
    finally { btns.forEach((b) => { b.disabled = false; b.style.opacity = 1; }); }
  }
  function openAuth() {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(() => doCheckout()); // resume the purchase after sign-in
    open('signup', 'Create your Snowstar account to get StreamDAW Pro: one login for Mutra and everything by Snowstar.');
  }
  async function buy() {
    await ready();
    if (signedIn()) return doCheckout();   // straight to HYP (or a free grant)
    openAuth();                            // the shared lightbox; resumes to checkout after
  }
  document.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); buy(); }));

  // Back from the payment page. The Worker sends ?bought=1 (paid, or a free grant),
  // ?pay=failed&reason=… or ?pay=confirming (charged, still being verified).
  if (q.get('bought') === '1') {
    toPricing(0);
    success(null, q.get('free') === '1');
  } else if (q.get('pay') === 'failed' && cMsg) {
    showMsg(q.get('reason') === 'declined'
      ? 'The card was declined, so nothing went through. Try again, or use another card.'
      : 'The payment did not go through. Try again, or write to hello@snowstar.company and we will sort it out.', false);
    toPricing(300);
  } else if (q.get('pay') === 'confirming' && cMsg) {
    showMsg('Your payment is being confirmed. We will email you as soon as it is, with your download. Nothing to do now.', true);
    toPricing(300);
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
      if (!d || !d.owned) return;
      const cta = $('navCta');
      if (cta) { cta.href = 'streamdaw-unlock.html'; cta.removeAttribute('data-free-dl'); cta.innerHTML = 'Unlock<span class="long">a Mac</span>'; }
      const o = $('owned'); if (o) o.hidden = false;
    } catch (e) {}
  }
  ownerCheck();
  (function () { const M = acct(); if (M && M.onChange) M.onChange(() => { ownerCheck(); }); })();
})();
