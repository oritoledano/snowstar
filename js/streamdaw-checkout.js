/* ═══════════ StreamDAW checkout lightbox (apps/streamdaw.html) ══════════════════
   Paying without leaving the page (2026-10-13, Ori: "what you get on one side, the card
   details on the other, in a lightbox"). Loaded by js/streamdaw-page.js, which calls
   window.SDCheckout.open() from its buy buttons; every bit of markup is made here.

   Left, what you get: the plan, the price in the visitor's currency with the shekel amount HYP
   actually charges, credit toward Pro from a pass bought before 2026-10-14, the coupon (Pro
   only), the features, what happens after paying, the terms and the refund line. Pro Monthly
   (2026-10-14, the 7-day pass gone): $8.99 a month, the shekels charged today and every month,
   that it renews until cancelled, how to cancel, the 14 days. Right, the card details: HYP's own
   payment page in an iframe. Hyp Pay documents its page in an iframe (developers.hyp.co.il/pay,
   checked 2026-10-13; see wip/checkout-lightbox-2026-10-13.md in the StreamDAW project).

   The payment never touches this page: card numbers are typed into HYP's frame, which this page
   cannot read. HYP then sends the frame to the Worker's return (/api/hyp/return), which grants
   the purchase and answers inside the frame with a page that posts {type:'sd-checkout', bought,
   ref, plan} to us. Only a message from our own origin and from that frame counts.

   A link under the frame always offers HYP's page in this tab instead, the way checkout worked
   before: HYP returns to ?bought=1, and streamdaw-page.js opens this lightbox on the result. */
(function () {
  'use strict';
  if (window.SDCheckout) return;

  // HYP's page sits in the frame. false = the "Pay securely on HYP" step instead (the whole tab
  // goes to HYP and comes back): the fallback if HYP ever stops serving its page in a frame.
  const EMBED = true;
  const PRO = 24900;                           // agorot incl. VAT; the Worker's PRICE_GROSS
  const MONTH_USD = 8.99;                      // Pro Monthly, a month (worker/src/streamdaw-subs.js)
  const FRESH = 9 * 60 * 1000;                 // a signed HYP page is good for about ten minutes
  const MACHINE_RE = /^SD[0-9A-F]{12,20}$/;

  // The Pro list as the page shows it (its words can be edited in place), as the page handed it
  // over (opts.features) or read from its Pro card; this copy only if neither is there.
  const FEATURES = [
    'Up to 32 stems, and a mix for every listener',
    'Anyone’s mix, set from your desk',
    'Sync mode: every phone in time, the room lined up',
    'Camera, up to three screens (a window or an app) and talkback',
    'Record up to 16 people into your DAW, in time',
    'Any app or input into the stream',
    'Presets, sign-in-only sessions, and your Mac’s speakers in time with the phones',
    'No 60-minute limit',
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const M = () => window.Money;
  const cur = (a) => (M() ? M().fmt(a / 100) : '₪' + Math.round(a / 100));                   // the visitor's currency
  const ils = (a) => (M() ? M().ils(a / 100) : '₪' + Math.round(a / 100));                   // what the card is charged
  const shekelsShown = () => !M() || M().isSettlement();
  // Pro Monthly: exactly $8.99 in dollars; in shekels the Worker's figure (opts.monthly, from
  // /api/streamdaw/prices), else the page's rate, until checkout answers with the amount itself.
  const monthAgorot = () => (total != null ? total : opts.monthly && opts.monthly.amount > 0 ? opts.monthly.amount
    : Math.round(MONTH_USD * 100 / ((M() && M().rates.USD) || 0.3252)));
  const monthCur = () => (!M() || M().code === 'USD' ? '$' + MONTH_USD.toFixed(2) : M().fmt(monthAgorot() / 100, { decimals: 2 }));
  const ils2 = (a) => (M() ? M().ils(a / 100, { decimals: 2 }) : '₪' + (a / 100).toFixed(2));
  const dayN = (d) => d + ([, 'st', 'nd', 'rd'][d % 100 >> 3 ^ 1 && d % 10] || 'th');

  let opts = {};          // from the page: plan, coupon, machine, signedIn(), signIn(resume), onBought(info)
  let plan = 'lifetime';
  let coupon = null;      // {code, free, amount, label}
  let credit = 0;         // pass money that comes off Pro (agorot), from /api/streamdaw/mine, then checkout
  let total = null;       // exactly what HYP charges, once the Worker has priced it
  let live = null;        // the signed page in the frame: {plan, code, url, at}
  let state = 'loading';
  let result = null;      // {bought, free, plan, download, pay, reason}
  let back = null;        // focus to return to on close
  let busy = 0;           // a checkout in flight; a newer one wins
  let codeOpen = false;   // the coupon field, behind a small "Have a code?" until asked for (2026-10-13, Ori)

  // ── the markup ─────────────────────────────────────────────────────────────
  let box = null, el = {};
  function build() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'sdco'; box.hidden = true;
    box.innerHTML =
      '<div class="sdco-card" role="dialog" aria-modal="true" aria-labelledby="sdcoTitle">'
      + '<button type="button" class="sdco-x" aria-label="Close">×</button>'
      + '<div class="sdco-left">'                 // divs, not sections: the page pads every <section>
      +   '<div class="sdco-sum" role="region" aria-label="What you get"></div>'
      +   '<div class="sdco-more"></div>'
      + '</div>'
      + '<div class="sdco-pay" role="region" aria-label="Card details" aria-live="polite"></div>'
      + '</div>';
    document.body.appendChild(box);
    el = { card: box.firstChild, sum: box.querySelector('.sdco-sum'), more: box.querySelector('.sdco-more'), pay: box.querySelector('.sdco-pay') };
    box.querySelector('.sdco-x').addEventListener('click', close);
    box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
    window.addEventListener('message', onMessage);
    if (M() && M().onChange) M().onChange(() => { if (!box.hidden) { paintSum(); paintPay(); } });
  }

  const itemText = (li) => (li.firstChild && li.firstChild.nodeType === 3 ? li.firstChild.textContent : li.textContent).trim();
  function features() {
    if (Array.isArray(opts.features) && opts.features.length >= 4) return opts.features.map(String);
    const page = Array.from(document.querySelectorAll('.plan.pro .list li:not(.plus)')).map(itemText).filter(Boolean);
    return page.length >= 4 ? page : FEATURES;
  }
  const machine = () => (MACHINE_RE.test(opts.machine || '') ? opts.machine : null);
  const isMonthly = () => plan === 'monthly';
  // Before the Worker answers: the list price, less an old pass's credit, less a code (its check priced it
  // against the full price). After: the Worker's own figure, which is what HYP will charge.
  function due() {
    if (total != null) return total;
    if (isMonthly()) return monthAgorot();
    if (coupon && coupon.free) return 0;
    return Math.max(0, (coupon ? coupon.amount : PRO) - credit);
  }

  // ── left: what you get ─────────────────────────────────────────────────────
  function paintSum() {
    if (isMonthly()) return paintSumMonthly();
    const d = due();
    const settled = state === 'done' && result && (result.bought || result.pay === 'confirming');   // no price or code to change now
    const cut = Math.max(0, PRO - credit - d);                  // what the code took off
    const rows = [];
    if (credit || (coupon && cut)) {
      rows.push('<div><span>StreamDAW Pro</span><b>' + cur(PRO) + '</b></div>');
      if (credit) rows.push('<div class="cut"><span>Your pass</span><b>−' + cur(credit) + ' from your pass</b></div>');
      if (coupon && cut) rows.push('<div class="cut"><span>' + esc(coupon.label || 'Coupon') + ' · ' + esc(coupon.code) + '</span><b>−' + cur(cut) + '</b></div>');
    }
    el.sum.innerHTML =
      '<span class="tag lime">StreamDAW Pro</span>'
      + '<h2 id="sdcoTitle">Pro, once.</h2>'
      + '<p class="sdco-what"><b>One payment. Yours forever.</b> No subscription. Every StreamDAW 1 update included.</p>'
      + (settled ? '' : (rows.length ? '<div class="sdco-rows">' + rows.join('') + '</div>' : '')
      + '<div class="sdco-price">' + (d === 0 ? 'Free' : cur(d)) + '<small>' + (d === 0 ? 'nothing to pay' : 'once') + '</small></div>'
      + (d > 0 ? '<p class="sdco-ils">' + (shekelsShown() ? 'Incl. VAT. HYP charges in shekels.' : 'Charged ' + ils(d) + ' incl. VAT. HYP charges in shekels.') + '</p>' : ''))
      // A code: a small link, not a field, so nobody goes hunting for one. Open when a code is on
      // (a ?c= link brought it, or they typed one) or once they ask for it.
      + (settled ? '' : !(coupon || codeOpen)
        ? '<button type="button" class="sdco-code-link" aria-expanded="false">Have a code?</button><p class="msg" hidden></p>'
        : '<form class="coupon sdco-coupon" novalidate><input type="text" name="code" placeholder="Coupon code" autocomplete="off" spellcheck="false" autocapitalize="characters" aria-label="Coupon code" value="' + esc(coupon ? coupon.code : '') + '">'
        + '<button type="submit">' + (coupon ? 'Change' : 'Apply') + '</button></form><p class="msg" hidden></p>');
    const f = el.sum.querySelector('.sdco-coupon');
    if (f) f.addEventListener('submit', (e) => { e.preventDefault(); applyCode(f.code.value); });
    const link = el.sum.querySelector('.sdco-code-link');
    if (link) link.addEventListener('click', () => {
      codeOpen = true; paintSum();
      const i = el.sum.querySelector('.sdco-coupon input'); if (i) i.focus({ preventScroll: true });
    });
  }

  function paintSumMonthly() {
    const settled = state === 'done' && result && (result.bought || result.pay === 'confirming');
    const a = monthAgorot(), today = new Date().getDate();
    el.sum.innerHTML =
      '<span class="tag lime">Pro Monthly</span>'
      + '<h2 id="sdcoTitle">Pro, monthly.</h2>'
      + '<p class="sdco-what">Every Pro feature. Renews every month until you cancel; cancel any time in your account, no fee.</p>'
      + (settled ? '' : '<div class="sdco-price">' + esc(monthCur()) + '<small>a month</small></div>'
        + '<p class="sdco-ils">Charged <b>' + esc(ils2(a)) + '</b> today, then ' + esc(ils2(a)) + ' on the ' + dayN(today)
        + ' of every month until you cancel. VAT included; HYP charges in shekels.</p>');
  }

  function paintMore() {
    if (isMonthly()) return paintMoreMonthly();
    const mac = machine();
    el.more.innerHTML =
      '<p class="sdco-h">Everything in Free, plus</p>'
      + '<ul class="list sdco-list">' + features().map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      + '<p class="sdco-h">After you pay</p>'
      + '<ol class="sdco-next">'
      +   '<li><b>Your download link</b>, right here and in your inbox.</li>'
      +   (mac ? '<li><b>The key for this Mac</b> (' + esc(mac) + ') by email, within minutes: paste it into StreamDAW › Settings › Licence.</li>'
               : '<li><b>The key for your Mac</b>: request it on the <a href="streamdaw-unlock.html">unlock page</a>, it takes a minute. It arrives by email.</li>')
      + '</ol>'
      + '<p class="sdco-fine">Buying means you accept the <a href="streamdaw-terms.html">StreamDAW licence terms</a>. '
      + 'Once your key is issued it isn’t refundable, except for a double charge or a key that never arrives. <a href="streamdaw-terms.html#refunds">Refunds</a>.</p>';
  }

  function paintMoreMonthly() {
    const mac = machine();
    el.more.innerHTML =
      '<p class="sdco-h">Every Pro feature, every month</p>'
      + '<ul class="list sdco-list">' + features().map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      + '<p class="sdco-h">After you pay</p>'
      + '<ol class="sdco-next">'
      +   '<li><b>Your download link</b>, right here and in your inbox, with the receipt.</li>'
      +   (mac ? '<li><b>The key for this Mac</b> (' + esc(mac) + ') by email, within minutes: paste everything in its box, the key and its Renewal line, into StreamDAW › Settings › Licence.</li>'
               : '<li><b>The key for your Mac</b>: request it on the <a href="streamdaw-unlock.html">unlock page</a>, it takes a minute. It arrives by email.</li>')
      +   '<li>Each month StreamDAW fetches its new key by itself while it is online, and you get a receipt for every charge.</li>'
      +   '<li>Cancel any time in <a href="../account.html#apps">your account</a> (Apps): nothing more is charged, and Pro stays on to the end of the month you paid for.</li>'
      + '</ol>'
      + '<p class="sdco-fine">Not sure yet? <a href="/api/streamdaw/download/free" data-free-dl>The 7-day trial</a> in the app needs no card and no subscription. '
      + 'Starting Pro Monthly means you accept the <a href="streamdaw-terms.html#monthly">StreamDAW licence terms</a>. Within 14 days you can cancel and get back what you paid for the days you did not use.</p>';
  }

  // ── right: the card details ────────────────────────────────────────────────
  const lock = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor"/></svg>';
  function head(t) {
    const d = due();
    return '<header class="sdco-pay-h"><p class="kicker">' + esc(t || 'Card details') + '</p>'
      + '<p class="sdco-secure">' + lock + '<span>Secure payment by <b>HYP</b></span>' + (d > 0 ? '<b class="sdco-amt">' + (isMonthly() ? ils2(d) : ils(d)) + '</b>' : '') + '</p></header>';
  }
  function paintPay() {
    const p = el.pay; p.dataset.state = state;
    if (state === 'frame') {                     // the frame is kept as is: repainting it would reload HYP
      if (!p.querySelector('iframe')) mountFrame();
      const h = p.querySelector('.sdco-pay-h'); if (h) h.outerHTML = head();
      return;
    }
    if (state === 'loading') p.innerHTML = head() + '<div class="sdco-wait"><span class="sdco-spin" aria-hidden="true"></span><p>Opening the secure payment form…</p></div>';
    else if (state === 'signin') {
      p.innerHTML = head('Pay') + '<div class="sdco-step"><h3>Sign in to pay</h3><p>One Snowstar account for StreamDAW, Mutra and everything else. Your download and your key go to its email.</p>'
        + '<button type="button" class="btn lime" data-go="signin">Sign in or create an account</button></div>';
    } else if (state === 'free') {
      p.innerHTML = head('Nothing to pay') + '<div class="sdco-step"><h3>' + (coupon && coupon.free ? 'Your code covers it all.' : 'Nothing left to pay.') + '</h3><p>No card. The download unlocks right away.</p>'
        + '<button type="button" class="btn lime" data-go="start">Get StreamDAW Pro free</button></div>';
    } else if (state === 'away') {               // the fallback: HYP's page in this tab
      p.innerHTML = head('Pay') + '<div class="sdco-step"><h3>Pay securely on HYP</h3><p>Card details are typed on HYP’s own payment page (pay.hyp.co.il), then you come back here to your download.</p>'
        + '<button type="button" class="btn lime" data-go="away">Pay securely on HYP · ' + (isMonthly() ? ils2(due()) : ils(due())) + '</button></div>';
    } else if (state === 'error') {
      p.innerHTML = head() + '<div class="sdco-step"><h3>' + esc(result && result.title || 'Checkout didn’t open') + '</h3><p>' + esc(result && result.text || 'Please try again.') + '</p>'
        + '<div class="cta"><button type="button" class="btn lime" data-go="start">Try again</button>'
        + (result && result.drop ? '<button type="button" class="btn ghost" data-go="drop">Continue without the code</button>' : '') + '</div></div>';
    } else if (state === 'done') p.innerHTML = doneView();
    p.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  }

  function mountFrame() {
    const p = el.pay;
    p.innerHTML = head() + '<div class="sdco-frame"><span class="sdco-spin" aria-hidden="true"></span></div>'
      + '<p class="sdco-alt">Card details go straight to HYP; Snowstar never sees them. Form not showing? <button type="button" data-go="away">Pay on HYP’s page instead</button></p>';
    const f = document.createElement('iframe');
    f.title = 'Card details: HYP secure payment page';
    f.setAttribute('allow', 'payment');          // Google Pay inside a frame (HYP's wallet notes)
    f.setAttribute('allowpaymentrequest', '');
    f.addEventListener('load', () => p.querySelector('.sdco-frame').classList.add('ready'));
    f.src = live.url;
    p.querySelector('.sdco-frame').appendChild(f);
    p.querySelector('[data-go="away"]').addEventListener('click', () => go('away'));
  }
  const frame = () => (el.pay ? el.pay.querySelector('iframe') : null);

  function doneView() {
    const r = result || {}, monthly = r.plan === 'monthly', mac = machine();
    if (r.bought) {
      const dl = r.download || '/api/streamdaw/download';
      return '<div class="sdco-done ok"><span class="sdco-check" aria-hidden="true"></span>'
        + '<p class="kicker">You’re in</p><h3>' + (monthly ? 'Pro Monthly is on.' : 'StreamDAW Pro is yours.') + '</h3>'
        + '<p>' + (r.free ? 'No charge. Enjoy.' : 'Payment received. Thank you.') + ' The download link is in your inbox too.</p>'
        + '<p>' + (mac ? 'The key for this Mac is being made and arrives by email within minutes: paste everything in its box into StreamDAW › Settings › Licence.'
                       : 'Next, get the key for your Mac on the unlock page: it takes a minute.') + '</p>'
        + (monthly ? '<p>It renews every month until you cancel in <a href="../account.html#apps">your account</a>.</p>' : '')
        + '<div class="cta"><a class="btn lime" href="' + esc(dl) + '">Download StreamDAW</a>'
        + '<a class="btn ghost" href="streamdaw-unlock.html">Unlock your Mac</a></div>'
        + '<p class="sdco-alt">Signed in? It is in your Snowstar account too: download it again any time. '
        + 'Open the installer when it lands: <a href="streamdaw-install.html">how to install</a>.</p></div>';
    }
    if (r.pay === 'confirming') {
      return '<div class="sdco-done"><p class="kicker">Almost there</p><h3>Your payment is being confirmed.</h3>'
        + '<p>We will email you as soon as it is, with your download. Nothing to do now.</p>'
        + '<div class="cta"><button type="button" class="btn ink" data-go="close">Close</button></div></div>';
    }
    return '<div class="sdco-done bad"><p class="kicker">Not paid</p><h3>' + (r.reason === 'declined' ? 'The card was declined.' : 'The payment did not go through.') + '</h3>'
      + '<p>' + (r.reason === 'declined' ? 'Nothing went through. Try again, or use another card.' : 'Try again, or write to hello@snowstar.company and we will sort it out.') + '</p>'
      + '<div class="cta"><button type="button" class="btn lime" data-go="start">Try again</button></div></div>';
  }

  function set(s) { state = s; paintPay(); }

  // ── what the buttons do ────────────────────────────────────────────────────
  function go(what) {
    if (what === 'start') { live = null; total = null; start(); }
    else if (what === 'drop') { coupon = null; live = null; total = null; paintSum(); start(); }
    else if (what === 'signin') signIn();
    else if (what === 'close') close();
    else if (what === 'away' && live && live.url) location.href = live.url;   // same tab; HYP returns to ?bought=1
    else if (what === 'away') start();
  }
  function signIn() {
    if (typeof opts.signIn !== 'function') return;
    opts.signIn(() => { credit = 0; total = null; mine().then(() => { paintSum(); start(); }); });
  }

  // Pass money that comes off Pro, for the buyer who is signed in.
  async function mine() {
    if (plan !== 'lifetime' || !(opts.signedIn && opts.signedIn())) return;
    try {
      const r = await fetch('/api/streamdaw/mine', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      if (d && d.proPrice && d.proPrice < PRO) credit = PRO - d.proPrice;
    } catch (e) { /* the Worker's checkout says it again */ }
  }

  async function applyCode(raw) {
    const code = String(raw || '').trim().toUpperCase();
    const msg = el.sum.querySelector('.msg');
    const say = (t, good) => { if (!msg) return; msg.textContent = t; msg.className = 'msg ' + (good ? 'ok' : 'bad'); msg.hidden = false; };
    if (!code) {
      if (coupon) { coupon = null; live = null; total = null; paintSum(); if (typeof opts.onCoupon === 'function') opts.onCoupon(null); if (ready()) start(); }
      return;
    }
    if (coupon && coupon.code === code) return;
    try {
      const r = await fetch('/api/streamdaw/coupon/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const d = await r.json();
      if (!d.ok) { say(d.reason || 'That code can’t be used.', false); return; }
      coupon = { code: d.code, free: d.free, amount: d.amount, label: d.label };
      live = null; total = null;
      paintSum();
      say(d.free ? '100% off applied. It’s on the house.' : (d.label || 'Code') + ' applied.', true);
      if (typeof opts.onCoupon === 'function') opts.onCoupon(coupon);
      if (ready()) start();
    } catch (e) { say('Could not check that code. Try again.', false); }
  }
  const ready = () => !!(opts.signedIn && opts.signedIn());

  // Ask the Worker to price this and sign HYP's page, then put that page in the frame.
  async function start() {
    if (!ready()) { set('signin'); return; }
    if (plan === 'lifetime' && due() === 0 && state !== 'free' && state !== 'error' && state !== 'done') { set('free'); return; }
    const n = ++busy;
    set('loading');
    let d = null;
    try {
      const r = await fetch('/api/streamdaw/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ plan, coupon: plan === 'lifetime' && coupon ? coupon.code : null, machine: machine() }) });
      d = await r.json();
    } catch (e) { d = { error: 'network' }; }
    if (n !== busy) return;                 // the buyer changed something meanwhile
    if (d && d.free) { done({ bought: true, free: true, plan, download: d.download || null }); return; }
    if (d && d.url) {
      if (typeof d.amount_gross === 'number') total = d.amount_gross;
      if (typeof d.credit === 'number') credit = d.credit;
      live = { plan, code: coupon ? coupon.code : null, url: d.url, at: Date.now() };
      paintSum();
      set(EMBED ? 'frame' : 'away');
      return;
    }
    if (d && (d.error === 'sign_in_required' || d.error === 'email_required')) { set('signin'); return; }   // no session: the Worker refuses
    if (d && d.error === 'coupon') { result = { title: 'That code can’t be used', text: d.reason || 'Remove it, or try another.', drop: true }; set('error'); return; }
    if (d && d.error === 'already_subscribed') { result = { title: 'You have Pro Monthly already', text: 'Manage or cancel it in your account, under Apps. Nothing was charged.' }; set('error'); return; }
    if (d && d.error === 'resume_instead') { result = { title: 'Your Pro Monthly is still running', text: 'It is cancelled but runs to the end of the month you paid for: resume it in your account instead. Nothing was charged.' }; set('error'); return; }
    if (d && d.error === 'owns_pro') { result = { title: 'You own StreamDAW Pro', text: 'Pro is yours for good: there is nothing to subscribe to. Nothing was charged.' }; set('error'); return; }
    if (d && d.error === 'monthly_not_ready') { result = { title: 'Pro Monthly isn’t switched on yet', text: 'Nothing was charged. Pro (once) works now.' }; set('error'); return; }
    result = d && d.error === 'hyp_not_configured'
      ? { title: 'Checkout isn’t switched on yet', text: 'The payment terminal still needs its keys. Nothing was charged.' }
      : d && d.error === 'network'
        ? { title: 'No connection', text: 'Checkout could not be reached. Check the connection and try again.' }
        : { title: 'Checkout didn’t open', text: 'Nothing was charged. Please try again' + (d && d.error ? ' (' + d.error + ')' : '') + '.' };
    set('error');
  }

  // ── the answer from the frame ──────────────────────────────────────────────
  // The Worker's return page posts to https://snowstar.company only; here it must come from this
  // page's own origin AND from the payment frame itself, or it is someone else's message.
  function onMessage(e) {
    if (e.origin !== location.origin) return;
    const f = frame();
    if (!f || e.source !== f.contentWindow) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.type !== 'sd-checkout') return;
    live = null;
    done({ bought: m.bought === true, plan: m.plan === 'monthly' || m.plan === 'lifetime' ? m.plan : plan,
           pay: m.pay === 'confirming' ? 'confirming' : m.bought === true ? null : 'failed',
           reason: typeof m.reason === 'string' ? m.reason.slice(0, 40) : null, ref: typeof m.ref === 'string' ? m.ref.slice(0, 40) : null });
  }

  function done(r) {
    result = r;
    if (r.plan) plan = r.plan;
    state = 'done';
    show();
    paintSum(); paintMore(); paintPay();
    if (r.bought && typeof opts.onBought === 'function') { try { opts.onBought(r); } catch (e) {} }
    const b = el.pay.querySelector('.btn'); if (b) b.focus({ preventScroll: true });
  }

  // ── open and close ─────────────────────────────────────────────────────────
  function show() {
    build();
    if (box.hidden) back = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add('sdco-lock');
  }
  // Closing hides: a frame mid-payment stays loaded, so a payment that completes while the
  // lightbox is shut still lands, and opens it again on the result.
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.documentElement.classList.remove('sdco-lock');
    if (back && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) {} }
  }

  async function open(o) {
    opts = o || {};
    const nextPlan = opts.plan === 'monthly' ? 'monthly' : 'lifetime';
    const code = nextPlan === 'lifetime' && opts.coupon && opts.coupon.code ? opts.coupon : null;
    build();
    // The same purchase, still signed and in the frame: show it again rather than start over.
    const same = live && live.plan === nextPlan && (live.code || null) === (code ? code.code : null) && Date.now() - live.at < FRESH && state === 'frame';
    if (!same) {
      plan = nextPlan; coupon = code; total = null; result = null; live = null; credit = 0; codeOpen = false;
      const f = frame(); if (f) f.remove();
      state = ready() ? 'loading' : 'signin';
    }
    show();
    paintSum(); paintMore(); paintPay();
    const x = box.querySelector('.sdco-x'); if (x) x.focus({ preventScroll: true });
    if (same) return;
    if (!ready()) { if (opts.askSignIn) signIn(); return; }
    await mine();
    paintSum();
    start();
  }

  window.SDCheckout = {
    open,
    close,
    /** A result from outside the frame: the full-page return (?bought=1 / ?pay=…). */
    result(r, o) { if (o) opts = o; plan = r && r.plan === 'monthly' ? 'monthly' : 'lifetime'; build(); done(r || {}); },
    get state() { return state; },
  };
})();
