/* ═══════════ StreamDAW sale page (apps/streamdaw.html) ══════════════════════
   1. the clips: hero, feature cards, stories (play on screen, pause off it)
   2. the feature rail's arrows, the burger menu, the drawn take on the review still
   3. buying: Pro (once) and Pro Monthly (2026-10-14; the 7-day pass is gone), coupons (typed or
      ?c=, Pro only), the Mac from the app (?buy=1&machine=, &plan=monthly), checkout through the
      shared sign-in, the return from the payment page (?bought / ?pay=), the month's price in
      shekels from the Worker (/api/streamdaw/prices)
   3b. by product (2026-10-27): once the Worker sells by product (/api/streamdaw/prices →
      products.open), every [data-product] button checks that product out on HYP's page,
      [data-when="products"] shows and [data-when="pro"] hides; until then Pro sells as before
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
  // A remade clip: its figure's data-v becomes ?v=… on its poster and sources (the cache-buster).
  const ver = (fig) => (fig.dataset.v ? '?v=' + encodeURIComponent(fig.dataset.v) : '');

  // Near the screen: the poster only, through an Image first and set once it has loaded, so a
  // missing poster never paints a broken frame over the background.
  function hydrate(fig) {
    if (fig.dataset.ready) return;
    fig.dataset.ready = '1';
    const v = fig.querySelector('video'), name = fig.dataset.media;
    if (!v) return;
    const img = new Image();
    img.onload = () => { v.poster = img.src; fig.classList.add('has-poster'); showBtn(fig); };
    img.src = MEDIA + name + '-poster.jpg' + ver(fig);
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
      s.src = MEDIA + name + '.' + ext + ver(fig); s.type = type;
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
  // Sound on (2026-10-29): a narrated reel plays muted like the rest; the first press plays it from the start with
  // its voice and music, the next one mutes it again. Shown once the video can play.
  reels.forEach((fig) => {
    const sb = fig.querySelector('.sbtn'), v = fig.querySelector('video'); if (!sb || !v) return;
    const label = sb.querySelector('span');
    v.addEventListener('playing', () => { if (!fig.dataset.noClip) sb.hidden = false; });
    if (fig.classList.contains('has-poster')) sb.hidden = false;
    sb.addEventListener('click', () => {
      const on = v.muted;
      v.muted = !on;
      sb.setAttribute('aria-pressed', on ? 'true' : 'false');
      label.textContent = on ? 'Sound off' : 'Sound on';
      if (on) { try { v.currentTime = 0; } catch (e) {} fig._wanted = true; attach(fig); const p = v.play(); if (p && p.catch) p.catch(() => {}); paint(fig); }
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
  const escT = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Pro Monthly in shekels, as the Worker charges it today ($8.99 at the day's rate, fixed for a
  // subscriber once they start): every "₪…" of the month, and its big price in shekels, show the
  // server's own figure, never an agora off the card's.
  let monthPrice = null;   // {amount (agorot), usdCents}
  // ── 3b. by product (2026-10-27) ──
  // One switch on the Worker (STREAMDAW_PRODUCTS_OPEN) flips every page: a product's button buys
  // that product, the Pro plans step aside. A year is one payment (no card kept), so these go to
  // HYP's own page in this tab, not the Pro lightbox; the way back lands on this page's #productMsg.
  const PRODUCT_NAMES = { splits: 'Splits', station: 'Station', record: 'Record', compare: 'Compare', party: 'Party', all: 'All products' };
  const isProductPlan = (p) => /^(splits|station|record|compare|party|all):(year|once)$/.test(String(p || ''));
  const periodOf = (id) => (id === 'compare' ? 'once' : 'year');
  let productsOpen = false, productsKnown = null;
  const productsAsked = new Promise((r) => { productsKnown = r; });
  function paintProducts(open) {
    productsOpen = open;
    document.querySelectorAll('[data-when="products"]').forEach((el) => { el.hidden = !open; });
    document.querySelectorAll('[data-when="pro"]').forEach((el) => { el.hidden = open; });
    productsKnown(open);
  }
  fetch('/api/streamdaw/prices', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    paintProducts(!!(d && d.products && d.products.open));
    if (!d || !d.monthly || !(d.monthly.amount > 0)) return;
    monthPrice = d.monthly;
    // Not taking monthly payments yet (HYP's card tokens not switched on): the card offers the
    // free trial as its button, and says monthly billing opens soon.
    if (d.monthly.open === false) {
      const b = $('buyMonthly'), t = document.querySelector('#monthlyCard .trial-link');
      if (b) b.hidden = true;
      if (t) { t.className = 'btn ink'; t.textContent = 'Try Pro free for 7 days'; }
      const n = document.createElement('p'); n.className = 'after'; n.textContent = 'Monthly billing opens in a few days. Start the free week now.';
      if (t && t.parentNode) t.parentNode.insertBefore(n, t.nextSibling);
    }
    document.querySelectorAll('[data-usd="8.99"]').forEach((el) => el.setAttribute('data-ils-fixed', (d.monthly.amount / 100).toFixed(2)));
    if (window.Money) window.Money.paint();
  }).catch(() => { productsKnown(false); });
  const monthBox = $('monthMsg');
  function monthMsg(html, good) { if (!monthBox) return; monthBox.innerHTML = html; monthBox.className = 'msg ' + (good ? 'ok' : 'bad'); monthBox.hidden = false; }
  // What the Worker says when a month cannot be started for this account (worker/src/streamdaw-subs.js).
  function monthlyWhy(d) {
    const manage = ' <a href="../account.html#apps">Your account</a>.';
    if (!d || !d.error) return '';
    if (d.error === 'already_subscribed') return 'You have Pro Monthly already: manage or cancel it in your account.' + manage;
    if (d.error === 'resume_instead') return 'Your Pro Monthly is cancelled but runs until ' + escT(new Date(d.until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
      + (d.canResume ? ': resume it instead, nothing is charged before then.' : '.') + manage;
    if (d.error === 'owns_pro') return 'You own StreamDAW Pro: there is nothing to subscribe to.';
    if (d.error === 'monthly_not_ready') return 'Pro Monthly isn’t switched on yet. Nothing was charged.';
    if (d.error === 'plan_retired') return escT(d.reason || 'That plan is no longer sold.');
    return '';
  }
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
    priceSub.innerHTML = '<b>One payment. Yours forever.</b> No subscription. Every StreamDAW 1 update included.';
    buyBtn.textContent = 'Get StreamDAW Pro';
  }
  // A coupon can arrive IN THE LINK (snowstar.company/apps/streamdaw.html?c=FRIEND100), so a
  // code can be handed out without asking anyone to type it. Applied on load, the page lands on
  // the price, and the code rides into checkout (HYP's page in this tab, or the lightbox).
  const q = new URLSearchParams(location.search);
  // The plans through Paddle (2026-10-29, js/streamdaw-plans.js) take codes, ?buy=1 and checkout on a page with #plans.
  const PLANS_PAGE = !!$('plans');
  const couponFromLink = (function () {
    const code = (q.get('c') || q.get('coupon') || '').trim();
    if (!code || PLANS_PAGE) return Promise.resolve();
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
    // ?buy=1 (the app's "Get Pro", or "Pro Monthly" with &plan=monthly): the checkout opens on that
    // plan by itself, with the page behind it at the price. Signed out, the shared sign-up opens first,
    // lightbox or not (2026-10-15), and the purchase carries on with this plan and this Mac once they are in.
    // &plan=pass is what apps up to 0.5.5 send for the 7-day pass, which is gone: the plans, with
    // Pro Monthly ready to press, and nothing opened for them.
    const asked = q.get('plan');
    // &product= (the app's product picker, 2026-10-27): that product once the Worker sells by
    // product; before that, Pro as always (it holds every product).
    if (PLANS_PAGE) { if (q.get('buy') === '1' || asked) toPricing(300); }
    else if (q.get('buy') === '1' && asked !== 'pass') {
      const want = String(q.get('product') || '').toLowerCase();
      productsAsked.then((open) => {
        if (!open) { toPricing(300); setTimeout(() => buy(asked === 'monthly' ? 'monthly' : 'lifetime'), 450); return; }
        toPricing(300);
        if (PRODUCT_NAMES[want]) setTimeout(() => buyProduct(want), 450);
      });
    } else if (asked === 'monthly' || asked === 'pass') {
      toPricing(300);
      setTimeout(() => { const p = $('buyMonthly'); if (p) p.focus({ preventScroll: true }); }, 700);
    }
  })();

  // ── success (a free grant, or back from a paid HYP checkout) ──
  // The Pro card turns into the ticket, and the checkout lightbox shows the result (from the
  // full-page return, ?bought=1); `quiet` when the lightbox itself reported it.
  const planOf = (p) => (p === 'monthly' ? 'monthly' : isProductPlan(p) ? p : 'lifetime');
  function success(downloadUrl, free, plan, quiet) {
    plan = planOf(plan);
    if (isProductPlan(plan)) { productDone({ bought: true, free, plan, download: downloadUrl }); return; }
    const monthly = plan === 'monthly';
    // The paid card turns into the ticket: Pro Monthly's or Pro's.
    const t = monthly ? $('monthlyCard') : $('ticket');
    if (!quiet) {
      // The Pro list goes along before the card below is rewritten: the lightbox lists it too.
      const pro = $('ticket');
      const features = pro ? Array.from(pro.querySelectorAll('.list li:not(.plus)'))
        .map((li) => (li.firstChild && li.firstChild.nodeType === 3 ? li.firstChild.textContent : li.textContent).trim()).filter(Boolean) : null;
      checkoutUI().then((ui) => { if (ui) ui.result({ bought: true, free: !!free, plan, download: downloadUrl || null }, checkoutOpts(plan, { features })); });
    }
    if (!t) return;
    t.innerHTML = '<span class="tag lime">You’re in</span>'
      + '<div class="price">' + (monthly ? 'Pro Monthly is on.' : 'Unlocked.') + '</div>'
      + '<p class="note">' + (free ? 'No charge. Enjoy.' : 'Payment received. Thank you.') + ' Your private download link is in your inbox too.'
      + (forMac() ? ' The key for this computer is being made and arrives by email: paste everything in its box into StreamDAW › Settings › Licence.' : ' Next, get the key for your computer: it takes a minute.')
      + (monthly ? ' It renews every month until you cancel in <a href="../account.html#apps">your account</a>.' : '') + '</p>'
      + '<div class="cta">'
      + (downloadUrl ? '<a class="btn lime" href="' + downloadUrl + '">Download StreamDAW</a>' : '')
      + '<a class="btn ' + (downloadUrl ? 'ghost' : 'lime') + '" href="streamdaw-unlock.html"' + (downloadUrl && !monthly ? ' style="color:var(--paper);border-color:rgba(239,233,218,.5)"' : '') + '>Unlock your computer</a>'
      + '</div>'
      + '<p class="after">Signed in? It is in your Snowstar account too: download it again any time. '
      + 'Open the installer when it lands: <a href="streamdaw-install.html">how to install</a>.</p>';
  }

  // ── account: the SAME sign-in lightbox as Mutra and the homepage ──
  const acct = () => window.SnowstarAccount;
  const signedIn = () => { const M = acct(); return !!(M && M.user); };
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }

  // ── checkout: the lightbox (js/streamdaw-checkout.js, loaded from next to this file) ──
  // What you get on the left, HYP's payment page in a frame on the right; the result comes back
  // into it. If its script cannot load, the whole tab goes to HYP as it always did.
  const CHECKOUT_JS = (function () {
    try { return new URL('streamdaw-checkout.js?v=5', document.currentScript.src).href; } catch (e) { return '../js/streamdaw-checkout.js?v=4'; }
  })();
  // THE SWITCH. false: every purchase goes to HYP's own page in this tab, as before, and `?lb=1`
  // turns the lightbox on for one tab, to test. true: the lightbox for everyone (`?lb=0` turns it
  // off for one tab). Off until a live payment has gone through it on HYP's terminal (2026-10-13:
  // Ori's ₪1 test with a coupon); flip this one constant, nothing else.
  const LIGHTBOX_FOR_EVERYONE = true;    // on 2026-10-15, after a ₪1 live payment verified on its own (SD-8DUODDH1XG)
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
      plan, machine: forMac(), signedIn, monthly: monthPrice,
      coupon: plan === 'lifetime' && coupon ? coupon : null,
      signIn: (resume) => openAuth(plan, resume),
      onCoupon: (c) => { if (!c) { if (coupon) applyCoupon(''); return; } if (c.code && (!coupon || coupon.code !== c.code)) applyCoupon(c.code); },
      onBought: (r) => success(r.download || null, !!r.free, r.plan, true),
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
    plan = planOf(plan);
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
      if (d && d.free) { success(d.download, true, plan); toPricing(0); return; }
      if (d && d.url) { location.href = d.url; return; }               // → HYP payment page
      if (needsSignIn(d)) { openAuth(plan); return; }                 // session lost: sign in again
      if (d && d.error === 'coupon') { showMsg(d.reason || 'That coupon can’t be used.', false); return; }
      const why = monthlyWhy(d);
      if (why) { monthMsg(why, false); toPricing(0); return; }
      alert(d && d.error === 'hyp_not_configured'
        ? 'Checkout isn’t switched on yet: the payment terminal still needs its keys.'
        : 'Could not start checkout' + (d && d.error ? ': ' + d.error : '') + '. Please try again.');
    } catch (err) { alert('Network error starting checkout. Please try again.'); }
    finally { btns.forEach((b) => { b.disabled = false; b.style.opacity = 1; }); }
  }
  function openAuth(plan, resume) {
    const open = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    keepBuy(planOf(plan)); keepFree(false);
    if (wishOff) { wishOff(); wishOff = null; }       // this press is the wish now
    // Resume the purchase after sign-in, once: the kept wish goes with it.
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(() => { keepBuy(null); (resume || (() => doCheckout(plan)))(); });
    open('signup', isProductPlan(plan)
      ? 'A free Snowstar account first, then StreamDAW ' + PRODUCT_NAMES[plan.split(':')[0]] + '. Your key and receipt go to its email.'
      : planOf(plan) === 'monthly'
      ? 'A free Snowstar account first, then Pro Monthly. Your key and receipts go to its email, and you cancel from it any time.'
      : 'A free Snowstar account first, then StreamDAW Pro. Your key and receipt go to its email.', 'app');
  }
  // The checkout lightbox, signed in or not: signed out, the shared sign-up opens over it at once
  // (a click, or the app's ?buy=1 on arrival, as with the lightbox off) and the payment form follows.
  async function buy(plan) {
    if (isProductPlan(plan)) { const [id, period] = plan.split(':'); return buyProduct(id, period); }
    await ready();
    await couponFromLink;                 // a ?c= code is checked before checkout starts
    return doCheckout(plan, { askSignIn: true });
  }
  // A product, for a year (Compare: for good). Signed in first, then HYP's page in this tab.
  async function buyProduct(id, period) {
    const plan = id + ':' + (period || periodOf(id));
    if (!isProductPlan(plan)) return;
    await ready();
    await couponFromLink;
    try { sessionStorage.setItem('sd_plan', plan); } catch (e) {}   // read back on the way home from HYP
    if (!signedIn()) { openAuth(plan, () => buyProduct(id, period)); return; }
    keepBuy(null);
    const btns = document.querySelectorAll('[data-product]'); btns.forEach((b) => { b.disabled = true; b.style.opacity = 0.6; });
    try {
      const r = await fetch('/api/streamdaw/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ product: id, period: plan.split(':')[1], coupon: coupon ? coupon.code : null, machine: forMac() }) });
      const d = await r.json().catch(() => null);
      if (d && d.free) { productDone({ bought: true, free: true, plan, download: d.download || null }); return; }
      if (d && d.url) { location.href = d.url; return; }                 // → HYP's payment page
      if (needsSignIn(d)) { openAuth(plan, () => buyProduct(id, period)); return; }
      productDone({ bought: false, plan, text: (d && d.reason) || 'Checkout did not open' + (d && d.error ? ' (' + d.error + ')' : '') + '. Nothing was charged. Please try again.' });
    } catch (err) { productDone({ bought: false, plan, text: 'No connection: checkout could not be reached. Nothing was charged.' }); }
    finally { btns.forEach((b) => { b.disabled = false; b.style.opacity = 1; }); }
  }
  // What came of it, in #productMsg (the hub's prices); on a page without one, the hub's.
  function productDone(r) {
    const box = $('productMsg');
    if (!box) { if (r.text) alert(r.text); return; }
    const name = PRODUCT_NAMES[String(r.plan || '').split(':')[0]] || 'StreamDAW';
    const once = /:once$/.test(r.plan || '');
    let h;
    if (r.bought) {
      h = '<b>' + escT(name) + (name === 'All products' ? ' are yours ' : ' is yours ') + (once ? 'for good.' : 'for a year.') + '</b> '
        + (r.free ? 'No charge. Enjoy.' : 'Payment received. Thank you.') + ' '
        + (forMac() ? 'The key for this computer is being made and arrives by email: paste everything in its box into StreamDAW › Settings › Licence.'
                    : 'Next, get the key for your computer on the <a href="streamdaw-unlock.html">unlock page</a>: it takes a minute.')
        + (r.download ? ' <a href="' + escT(r.download) + '">Download StreamDAW</a>' : '');
    } else if (r.pay === 'confirming') h = 'Your payment is being confirmed. We will email you as soon as it is, with your key. Nothing to do now.';
    else if (r.pay === 'failed') h = r.reason === 'declined' ? 'The card was declined, so nothing went through. Try again, or use another card.'
      : 'The payment did not go through. Try again, or write to hello@snowstar.company and we will sort it out.';
    else h = escT(r.text || 'Checkout did not open. Nothing was charged.');
    box.innerHTML = h;
    box.className = 'msg ' + (r.bought || r.pay === 'confirming' ? 'ok' : 'bad');
    box.hidden = false;
    setTimeout(() => box.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' }), 300);
  }
  document.querySelectorAll('[data-product]').forEach((el) => el.addEventListener('click', (e) => {
    if (!productsOpen) return;                    // not sold by product yet: the link goes to Pro, as before
    e.preventDefault();
    buyProduct(el.getAttribute('data-product'), el.getAttribute('data-period') || null);
  }));
  document.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    if (el.dataset.manage) { location.href = '../account.html#apps'; return; }   // a subscriber's "Manage subscription"
    buy(el.getAttribute('data-buy'));
  }));

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
    top.postMessage({ type: 'sd-checkout', bought: q.get('bought') === '1', ref: q.get('ref'), plan: planOf(plan),
      pay: q.get('pay'), reason: q.get('reason') }, location.origin);
    document.documentElement.style.visibility = 'hidden';
    return true;
  })();
  const showResult = (r) => checkoutUI().then((ui) => { if (ui) ui.result(r, checkoutOpts(r.plan)); });
  const lastPlan = () => { try { return planOf(sessionStorage.getItem('sd_plan')); } catch (e) { return 'lifetime'; } };
  if (framedReturn) {
    /* the lightbox around this frame shows it */
  } else if ((q.get('bought') === '1' || q.get('pay')) && isProductPlan(lastPlan())) {
    toPricing(0);       // back from HYP with a product: the answer goes under the products' prices
    productDone({ bought: q.get('bought') === '1', free: q.get('free') === '1', plan: lastPlan(), pay: q.get('pay'), reason: q.get('reason') });
  } else if (q.get('bought') === '1') {
    toPricing(0);
    success(null, q.get('free') === '1', lastPlan());
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
  // button turns into "Unlock a computer" and a line shows above the plans. Asked only when
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
      // Pro Monthly: a line above the plans, and its card's button manages it instead of selling it.
      const sub = d && d.subscription;
      if (sub && ['active', 'past_due', 'cancelled'].includes(sub.status)) {
        const when = (t) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const line = sub.status === 'active' ? 'You have StreamDAW Pro Monthly. It renews on ' + when(sub.renewsAt) + '.'
          : sub.status === 'past_due' ? 'Your Pro Monthly payment didn’t go through: we try again on ' + when(sub.nextTryAt) + '.'
          : 'Your Pro Monthly is cancelled: Pro until ' + when(sub.paidThrough) + '.';
        const o = $('owned');
        if (o) { o.innerHTML = escT(line) + ' <a href="../account.html#apps">Manage subscription</a> <a href="streamdaw-unlock.html">Unlock a computer</a>'; o.hidden = false; }
        const b = $('buyMonthly'); if (b) { b.textContent = 'Manage subscription'; b.dataset.manage = '1'; }
        const cta = $('navCta');
        if (cta && sub.status !== 'cancelled') { cta.href = 'streamdaw-unlock.html'; cta.removeAttribute('data-free-dl'); cta.innerHTML = 'Unlock<span class="long">a Mac</span>'; }
        return;
      }
      if (!d || !d.owned) return;
      if (d.plan === 'lifetime') { const b = $('buyMonthly'); if (b) { b.disabled = true; b.textContent = 'You own Pro'; } }
      if (d.plan === 'pass') {                      // a pass: keep the buy buttons, say until when
        const o = $('owned');
        if (o) { o.innerHTML = 'You have a Pro pass until ' + new Date(d.expiresAt * 1000).toISOString().slice(0, 10) + '. <a href="streamdaw-unlock.html">Unlock a computer</a> <a href="streamdaw-install.html?dl=pro">Download the installer</a>'; o.hidden = false; }
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
  // Mac or PC (2026-10-30). A labelled link says which file it is (data-os="mac" | "win"); an
  // unlabelled Download button follows the browser, so nobody on a PC lands on the Mac .pkg. The
  // wish survives a Google sign-in's reload beside the wish itself, and travels to the install
  // guide as &os=win, which starts that file and shows that platform's steps.
  const OS_KEY = 'sd_free_os';
  const winUA = () => { try { const d = navigator.userAgentData; return d ? /win/i.test(d.platform || '') : /Windows|Win64|WOW64/i.test(navigator.userAgent || ''); } catch (e) { return false; } };
  const osFor = (a) => { const o = a && a.dataset ? a.dataset.os : ''; return o === 'win' || o === 'mac' ? o : (winUA() ? 'win' : 'mac'); };
  const osWish = () => { try { return sessionStorage.getItem(OS_KEY) === 'win' ? 'win' : (winUA() ? 'win' : 'mac'); } catch (e) { return 'mac'; } };
  const wantFree = () => { try { const t = +sessionStorage.getItem(FREE_KEY) || 0; return t > 0 && Date.now() - t < FREE_FOR; } catch (e) { return false; } };
  const keepFree = (on, os) => { try { if (on) { sessionStorage.setItem(FREE_KEY, String(Date.now())); sessionStorage.setItem(OS_KEY, os === 'win' ? 'win' : 'mac'); } else { sessionStorage.removeItem(FREE_KEY); sessionStorage.removeItem(OS_KEY); } } catch (e) {} };
  // Once per wish: the sign-in's resume and the account's change can both call this. (2026-10-18)
  // The install guide opens at once and starts the file itself, so the steps are
  // in front of the buyer while it downloads. installHint stays for a page that cannot leave.
  function startFree(os) { const o = os === 'win' || os === 'mac' ? os : osWish(); keepFree(false); location.href = 'streamdaw-install.html?dl=free' + (o === 'win' ? '&os=win' : ''); }
  function installHint() {
    const h = $('dlHint'), x = $('dlHintX');
    if (!h) return;
    // Above the cookie bar (js/consent.js) while that is still waiting for an answer.
    const cc = document.querySelector('.cc-bar.in');
    h.style.bottom = cc ? (cc.offsetHeight + 28) + 'px' : '';
    h.hidden = false;
    if (x && !x.dataset.on) { x.dataset.on = '1'; x.addEventListener('click', () => { h.hidden = true; }); }
  }
  function freeIfWanted() { if (wantFree() && signedIn()) startFree(osWish()); }
  function askFree(os) {
    const open = window.SnowstarOpenAuth;
    if (!open) { alert('Sign-in is loading. One moment, then try again.'); return; }
    keepFree(true, os); keepBuy(null);
    if (wishOff) { wishOff(); wishOff = null; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(freeIfWanted);
    open('signup', 'Your free Snowstar account, then the download starts. It includes 7 days of every Pro feature, no card.', 'app');
  }
  async function freeDownload(os) {
    await ready();
    if (signedIn()) return startFree(os);
    askFree(os);
  }
  document.querySelectorAll('[data-free-dl]').forEach((a) => a.addEventListener('click', (e) => {
    if (!a.hasAttribute('data-free-dl')) return;      // an owner's header button points elsewhere now
    e.preventDefault(); freeDownload(osFor(a));
  }));
  document.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => keepFree(false)));
  (async function () {
    const direct = q.get('get') === 'free';
    if (direct) {                                       // tidy the address; the wish is kept above
      keepFree(true, winUA() ? 'win' : 'mac');
      const u = new URL(location.href); u.searchParams.delete('get');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    }
    if (!wantFree()) return;
    await ready();
    const M = acct(); if (M && M.onChange) M.onChange(freeIfWanted);   // e.g. back from Google
    if (signedIn()) startFree(osWish()); else if (direct) askFree(osWish());
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

// The hero's use cases, typed one by one (2026-10-29, the founder): type a line, hold it, delete it, type the
// next. The lines are #hero .tw-src (the site editor's streamdaw.hero.lines, one a line), read again before
// each line so an edit shows at once. Each line gets the drawing its words point to (a mix, a voice, the
// radio…), so a line written in the editor still finds one. Reduced motion: whole lines, no typing.
(function () {
  const box = document.querySelector('#hero .tw'), src = document.querySelector('#hero .tw-src');
  if (!box || !src) return;
  const t = box.querySelector('.tw-t'), ic = box.querySelector('.tw-ic');
  const S = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const ART = [
    [/radio|station|broadcast|on air/i, S('<circle cx="12" cy="10" r="2"/><path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.6 3.6a9 9 0 0 0 0 12.8M18.4 3.6a9 9 0 0 1 0 12.8M12 12v9"/>')],
    [/voice|record|sing|take/i, S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>')],
    [/compare|a\/b|cuts|pictures|notes/i, S('<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/><path d="M6 12h2M16 10.5l1.5 3 1.5-3"/>')],
    [/click|metronome|count|stage/i, S('<path d="M9 3h6l3.5 18h-13z"/><path d="M12 15l4-9"/><circle cx="12" cy="15" r="1"/>')],
    [/phone|sound system|party|disco|room/i, S('<rect x="2.5" y="6" width="5" height="10" rx="1"/><rect x="9.5" y="4" width="5" height="12" rx="1"/><rect x="16.5" y="6" width="5" height="10" rx="1"/><path d="M3 20c3-2 5-2 9 0s6 2 9 0"/>')],
    [/fans|live|play your|track to/i, S('<circle cx="12" cy="12" r="4.5"/><path d="M11 10v4l3-2z"/><circle cx="4" cy="5" r="1.4"/><circle cx="20" cy="5" r="1.4"/><circle cx="4" cy="19" r="1.4"/><circle cx="20" cy="19" r="1.4"/>')],
    [/mix|fader|team|player/i, S('<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="13" width="4" height="3" rx=".8"/><rect x="10" y="6" width="4" height="3" rx=".8"/><rect x="16" y="10" width="4" height="3" rx=".8"/>')],
  ];
  const artFor = (line, i) => { const hit = ART.find(([re]) => re.test(line)); return (hit || ART[i % ART.length])[1]; };
  // From the markup, not innerText: the list is display:none, and a hidden element's innerText has no line breaks.
  const tmp = document.createElement('div');
  const lines = () => src.innerHTML.split(/<br\s*\/?>|<\/div>|<\/p>|\n|\s\/\s/i)
    .map((x) => { tmp.innerHTML = x; return tmp.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // A screen reader gets every line once, not a stream of letters.
  const sr = document.createElement('p'); sr.className = 'sr-only'; sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
  box.after(sr);
  (async function run() {
    for (let i = 0; ; i++) {
      const all = lines(); if (!all.length) { await wait(1000); continue; }
      sr.textContent = all.join(' ');
      const line = all[i % all.length];
      ic.classList.add('swap'); ic.innerHTML = artFor(line, i); requestAnimationFrame(() => ic.classList.remove('swap'));
      if (calm) { t.textContent = line; await wait(3200); continue; }
      for (let k = 1; k <= line.length; k++) { t.textContent = line.slice(0, k); await wait(38 + Math.random() * 40); }
      await wait(1700);
      for (let k = line.length; k >= 0; k--) { t.textContent = line.slice(0, k); await wait(18); }
      await wait(260);
    }
  })();
})();
