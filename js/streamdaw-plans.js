/* ═══════════ StreamDAW plans, through Paddle (2026-10-29) ═══════════════════
   apps/streamdaw.html #pricing: Free, One product (picked), All products; billed yearly (the default, shown as its
   monthly figure) or monthly. Paddle is the merchant of record: the Worker makes a Paddle transaction for the plan
   (POST /api/streamdaw/checkout, worker/src/streamdaw-paddle.js) and Paddle.js opens it inline, in our own pay sheet. Nothing is
   granted on the page's word: the key comes once Paddle tells the Worker the payment went through.
   Until Paddle sells (/api/streamdaw/prices → paddle.open false) every buy button starts the free week instead.
   Codes: ?c=CODE in the link, or "Have a code?". The offer: 15% off a first purchase (WELCOME15), shown once to a
   visitor weighing it up (leaving the page, or back from a product page), only while that code works. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = $('plans');
  if (!root) return;
  const q = new URLSearchParams(location.search);
  const LINES = {
    splits: 'Every track to every ear, in personal mixes. Click and guide on stage.',
    station: 'Your radio station in a browser: two decks, a crossfader, your voice and guests.',
    record: 'Record anyone, anywhere. The take lands on your track, in time.',
    compare: 'A/B mixes, cuts and pictures with a client. Notes land on the moment.',
    party: 'Every phone in the room on one beat. A silent disco, or one big sound system.',
  };
  const NAMES = { splits: 'Splits', station: 'Station', record: 'Record', compare: 'Compare', party: 'Party', all: 'All products' };
  // What the page says before the Worker answers (the same figures: worker/src/streamdaw-products.js).
  let plans = { splits: { month: 700, year: 6000 }, all: { month: 1500, year: 14400 } };
  let open = false, paddleCfg = null, period = 'year', pick = 'splits', code = null;
  const dollars = (c) => '$' + Math.round(c / 100);
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const msgBox = $('planMsg');
  function say(html, good) { if (!msgBox) return; msgBox.innerHTML = html; msgBox.className = 'msg ' + (good ? 'ok' : 'bad'); msgBox.hidden = false; }
  const toPlans = () => setTimeout(() => { const s = $('pricing'); if (s) s.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }); }, 250);

  // ── prices on the cards ──
  function paint() {
    for (const which of ['one', 'all']) {
      const p = plans[which === 'one' ? pick : 'all'] || plans.splits;
      const el = root.querySelector(`[data-plan-price="${which}"]`), per = root.querySelector(`[data-plan-per="${which}"]`);
      if (!el || !per) continue;
      el.textContent = period === 'year' ? dollars(p.year / 12) : dollars(p.month);
      per.textContent = period === 'year' ? `a month, billed ${dollars(p.year)} a year` : 'a month, billed monthly';
    }
    document.querySelectorAll('#bill [data-bill]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.bill === period)));
    document.querySelectorAll('#picks [data-pick]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pick === pick)));
    const line = $('pickLine'); if (line) line.textContent = LINES[pick];
    const one = $('buyOne'); if (one) one.textContent = open ? 'Get ' + NAMES[pick] : 'Try ' + NAMES[pick] + ' free for 7 days';
    const all = $('buyAll'); if (all) all.textContent = open ? 'Get All products' : 'Try everything free for 7 days';
    if (code) say(`<b>${esc(code.code)}</b>: ${esc(code.label)}${code.products && code.products.length ? ' (' + code.products.map((x) => NAMES[x] || x).join(', ') + ')' : ''}. It comes off at checkout.`, true);
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.querySelectorAll('#bill [data-bill]').forEach((b) => b.addEventListener('click', () => { period = b.dataset.bill; paint(); }));
  document.querySelectorAll('#picks [data-pick]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.pick; paint(); }));
  // Arrow keys move inside each radio group.
  for (const g of ['bill', 'picks']) {
    const box = $(g); if (!box) continue;
    box.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const bs = [...box.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.focus(); n.click(); e.preventDefault();
    });
  }
  // A product page's "Get it" sends ?product=record: that one is picked.
  const asked = String(q.get('product') || '').toLowerCase();
  if (LINES[asked]) pick = asked;
  if (q.get('period') === 'month') period = 'month';
  paint();

  const pricesAsked = fetch('/api/streamdaw/prices', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const p = d && d.paddle;
    if (p && p.plans) plans = p.plans;
    open = !!(p && p.open);
    paddleCfg = p && p.paddle;
    paint();
  }).catch(() => {});

  // ── the account ──
  const acct = () => window.SnowstarAccount;
  const signedIn = () => { const M = acct(); return !!(M && M.user); };
  async function ready() { const M = acct(); if (!M || M.ready) return; await new Promise((r) => { const off = M.onChange(() => { off(); r(); }); }); }
  function signUp(reason, resume) {
    const openAuth = window.SnowstarOpenAuth || window.MutraOpenAuth;
    if (!openAuth) { say('Sign-in is loading. One moment, then try again.', false); return; }
    if (window.SnowstarAuthResume) window.SnowstarAuthResume(resume);
    openAuth('signup', reason, 'app');
  }
  const MACHINE_RE = /^SD[0-9A-F]{12,20}$/;
  const forMac = () => { try { const m = sessionStorage.getItem('sd_machine') || String(q.get('machine') || '').toUpperCase(); return MACHINE_RE.test(m) ? m : null; } catch (e) { return null; } };

  // ── Paddle.js, loaded on the first purchase ──
  let paddleLoad = null;
  function paddleJs() {
    if (paddleLoad) return paddleLoad;
    paddleLoad = new Promise((resolve, reject) => {
      if (window.Paddle) return resolve(window.Paddle);
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = () => resolve(window.Paddle); s.onerror = () => { paddleLoad = null; reject(new Error('paddle.js')); };
      document.head.appendChild(s);
    }).then((P) => {
      if (paddleCfg && paddleCfg.environment === 'sandbox') P.Environment.set('sandbox');
      P.Initialize({ token: paddleCfg && paddleCfg.token, eventCallback: onPaddle });
      return P;
    });
    return paddleLoad;
  }
  let buying = null;

  // ── the pay sheet: Paddle's form inline, inside our own card (what you buy beside it, in the page's language) ──
  let sheet = null;
  function money(n, cur) {
    try { return new Intl.NumberFormat(navigator.language || 'en', { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return cur + ' ' + n; }
  }
  function closeSheet() {
    if (!sheet || !sheet.classList.contains('on')) return;
    try { window.Paddle && window.Paddle.Checkout.close(); } catch (e) {}
    sheet.classList.remove('on'); document.documentElement.classList.remove('pay-open');
    const back = sheet._from; setTimeout(() => { sheet.hidden = true; if (back && back.focus) back.focus(); }, calm() ? 0 : 320);
  }
  function openSheet(id) {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'pay'; sheet.hidden = true;
      sheet.innerHTML = `<div class="pay-card" role="dialog" aria-modal="true" aria-labelledby="payName">
        <button class="x" type="button" aria-label="Close the checkout">×</button>
        <div class="pay-sum">
          <span class="pay-kick">StreamDAW</span>
          <h3 id="payName" data-p="name"></h3>
          <p class="pay-line" data-p="line"></p>
          <p class="pay-price"><b data-p="price"></b> <span data-p="per"></span></p>
          <p class="pay-code" data-p="code" hidden></p>
          <ul class="pay-pts">
            <li>Your key comes by email the moment the payment goes through.</li>
            <li>Cancel any time in your account: it runs to the end of what you paid for.</li>
            <li>Changed your mind? The first payment comes back in full within 14 days.</li>
          </ul>
          <p class="pay-fine">Paddle.com is our reseller: it takes the payment, adds your country’s tax and emails the invoice.</p>
        </div>
        <div class="pay-form"><div class="sd-pay-frame"></div><p class="pay-wait" data-p="wait">Opening the secure checkout…</p></div>
      </div>`;
      document.body.appendChild(sheet);
      sheet.querySelector('.x').addEventListener('click', closeSheet);
      sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    }
    const p = plans[id] || plans.splits, f = (k) => sheet.querySelector(`[data-p="${k}"]`);
    f('name').textContent = NAMES[id];
    f('line').textContent = id === 'all' ? 'Splits, Station, Record, Compare and Party, on one key.' : LINES[id];
    f('price').textContent = period === 'year' ? dollars(p.year) : dollars(p.month);
    f('per').textContent = period === 'year' ? 'a year' : 'a month';
    f('code').hidden = !code; if (code) f('code').innerHTML = `<b>${esc(code.code)}</b> · ${esc(code.label)}`;
    f('wait').hidden = false;
    sheet.querySelector('.sd-pay-frame').innerHTML = '';
    sheet._from = document.activeElement;
    sheet.hidden = false; document.documentElement.classList.add('pay-open');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('on')));
    sheet.querySelector('.x').focus();
  }
  // Paddle's own figures (with the buyer's tax) replace ours once the form knows the country.
  function sheetTotals(d) {
    if (!sheet || !d) return;
    const t = d.totals, cur = d.currency_code, f = (k) => sheet.querySelector(`[data-p="${k}"]`);
    if (t && cur && typeof t.total === 'number') f('price').textContent = money(t.total, cur);
    const it = d.items && d.items[0], cyc = it && it.billing_cycle;
    if (cyc && cyc.interval) f('per').textContent = cyc.interval === 'year' ? 'a year' : 'a month';
    if (d.discount && t && t.discount > 0 && cur) { const c = f('code'); c.hidden = false; c.innerHTML = `${esc(d.discount.code || 'Code')} · ${esc(money(t.discount, cur))} off`; }
  }

  function onPaddle(ev) {
    if (!ev || !ev.name) return;
    if (ev.name === 'checkout.loaded' && sheet) { const w = sheet.querySelector('[data-p="wait"]'); if (w) w.hidden = true; }
    if (/^checkout\.(loaded|items\.updated|customer\.(created|updated)|payment\.selected|discount\.applied)$/.test(ev.name)) sheetTotals(ev.data);
    if (ev.name === 'checkout.completed') {
      setTimeout(closeSheet, 2600);
      say(`<b>${esc(NAMES[buying] || 'StreamDAW')} is yours. Thank you.</b> Paddle emails your receipt. `
        + (forMac() ? 'The key for this Mac arrives by email within a minute: paste everything in its box into StreamDAW › Settings › Licence.'
                    : 'Next, get the key for your Mac on the <a href="streamdaw-unlock.html">unlock page</a>: it takes a minute.'), true);
      toPlans();
    }
  }

  async function buy(which) {
    const id = which === 'all' ? 'all' : pick;
    await pricesAsked;
    if (!open) { const dl = document.querySelector('a[data-free-dl]'); if (dl) dl.click(); return; }
    await ready();
    if (!signedIn()) { signUp(`A free Snowstar account first, then StreamDAW ${NAMES[id]}. Your key and receipts go to its email.`, () => buy(which)); return; }
    const btns = root.querySelectorAll('[data-plan-buy]'); btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await fetch('/api/streamdaw/checkout', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: id, period, coupon: code ? code.code : null, machine: forMac() }) });
      const d = await r.json().catch(() => null);
      if (d && d.error === 'sign_in_required') { signUp('Sign in first, then the checkout opens.', () => buy(which)); return; }
      if (d && d.free) {
        const until = d.until ? new Date(d.until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        say(`<b>${esc(NAMES[id])}: yours${until ? ' until ' + esc(until) : ''}, with ${esc(code.code)}.</b> No charge. `
          + (forMac() ? 'The key for this Mac arrives by email within a minute.' : 'Get the key for your Mac on the <a href="streamdaw-unlock.html">unlock page</a>.')
          + (d.download ? ' <a href="' + esc(d.download) + '">Download StreamDAW</a>' : ''), true);
        code = null; toPlans(); return;
      }
      if (!d || !d.paddle || !d.paddle.transactionId) {
        say(esc((d && d.reason) || 'Checkout did not open. Nothing was charged. Please try again.'), false); toPlans(); return;
      }
      if (d.paddle.token || !paddleCfg) paddleCfg = { environment: d.paddle.environment, token: d.paddle.token || (paddleCfg && paddleCfg.token) };
      const P = await paddleJs();
      buying = id;
      openSheet(id);
      P.Checkout.open({ transactionId: d.paddle.transactionId,
        settings: { displayMode: 'inline', frameTarget: 'sd-pay-frame', frameInitialHeight: 450, variant: 'one-page',
          frameStyle: 'width:100%;min-width:286px;background-color:transparent;border:none;',
          theme: 'light', showAddDiscounts: false, allowLogout: false, locale: (navigator.language || 'en').slice(0, 2) } });
    } catch (e) {
      closeSheet();
      say('Checkout could not be reached. Nothing was charged. Please try again.', false);
    } finally { btns.forEach((b) => { b.disabled = false; }); }
  }
  root.querySelectorAll('[data-plan-buy]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); buy(b.dataset.planBuy); }));

  // ── codes ──
  async function useCode(raw, quiet) {
    const c = String(raw || '').trim().toUpperCase();
    if (!c) return false;
    try {
      const r = await fetch('/api/streamdaw/coupon/check', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: c }) });
      const d = await r.json();
      if (!d.ok) { if (!quiet) say(esc(d.reason || 'That code can’t be used.'), false); return false; }
      code = d;
      if (d.products && d.products.length === 1 && LINES[d.products[0]]) pick = d.products[0];
      paint();
      return true;
    } catch (e) { if (!quiet) say('Could not check that code. Try again.', false); return false; }
  }
  const linkCode = (q.get('c') || q.get('coupon') || '').trim();
  if (linkCode) { toPlans(); useCode(linkCode); }
  const have = $('haveCode');
  if (have) have.addEventListener('click', (e) => {
    e.preventDefault();
    if (document.querySelector('.code-row')) { document.querySelector('.code-row input').focus(); return; }
    const row = document.createElement('div'); row.className = 'code-row';
    row.innerHTML = '<input aria-label="Code" placeholder="Your code" maxlength="40" autocomplete="off"><button class="btn ink" type="button">Apply</button>';
    have.parentNode.insertAdjacentElement('afterend', row);
    const inp = row.querySelector('input'), go = () => useCode(inp.value).then((okk) => { if (okk) row.remove(); });
    row.querySelector('button').addEventListener('click', go);
    inp.addEventListener('keydown', (e2) => { if (e2.key === 'Enter') go(); });
    inp.focus();
  });

  // ── the buyer's subscriptions: a line above the plans, and Paddle's own page to manage them ──
  async function mine() {
    await ready();
    if (!signedIn()) return;
    try {
      const d = await (await fetch('/api/streamdaw/mine', { credentials: 'include' })).json();
      const subs = (d && d.subscriptions) || [];
      const live = subs.filter((s) => ['active', 'past_due', 'trialing'].includes(s.status));
      if (!live.length) return;
      const when = (t) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const o = $('owned');
      if (o) {
        o.innerHTML = live.map((s) => esc(s.name) + (s.cancelAt ? ': cancelled, yours until ' + when(s.cancelAt) : s.status === 'past_due' ? ': the last payment didn’t go through' : ': renews ' + when(s.nextBilledAt || s.periodEnd))).join(' · ')
          + ' <a href="#" data-manage>Manage</a> <a href="streamdaw-unlock.html">Unlock a Mac</a>';
        o.hidden = false;
      }
      const m = $('manageCta'); if (m) m.hidden = false;
    } catch (e) {}
  }
  mine();
  async function manage(e) {
    e.preventDefault();
    try {
      const d = await (await fetch('/api/streamdaw/paddle/portal', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
      if (d && d.url) { location.href = d.url; return; }
      say(esc((d && d.reason) || 'Could not open your subscriptions. Please try again.'), false);
    } catch (err) { say('Could not open your subscriptions. Please try again.', false); }
  }
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('[data-manage], #manageSub'); if (a) manage(e); });

  // ── the offer: 15% off a first purchase, for a visitor weighing it up ──
  // Once per visitor (localStorage), never with a code already in hand, never to someone signed in who has bought,
  // only while the code itself works (asked first: a code switched off in the dashboard shows nothing).
  const OFFER = 'WELCOME15', SEEN = 'sd_offer_seen';
  const seen = () => { try { return !!localStorage.getItem(SEEN); } catch (e) { return true; } };
  const mark = () => { try { localStorage.setItem(SEEN, String(Date.now())); } catch (e) {} };
  try { if (/\/apps\/streamdaw-[a-z]+\.html/.test(document.referrer) && new URL(document.referrer).origin === location.origin) sessionStorage.setItem('sd_back', '1'); } catch (e) {}
  let offerShown = false;
  async function offer() {
    if (offerShown || seen() || code || linkCode || q.get('buy') === '1') return;
    offerShown = true;
    const r = await fetch('/api/streamdaw/coupon/check', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: OFFER }) }).then((x) => x.json()).catch(() => null);
    if (!r || !r.ok) return;
    mark();
    const box = document.createElement('div');
    box.className = 'offer'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '15% off your first purchase');
    box.innerHTML = '<button class="x" type="button" aria-label="Close">×</button>'
      + '<h3>15% off your first purchase.</h3>'
      + '<p>Make a free Snowstar account now and your code is <code>' + OFFER + '</code>. It comes off any plan, monthly or yearly.</p>'
      + '<button class="btn lime" type="button" data-take>' + (signedIn() ? 'Use it now' : 'Sign up and take 15% off') + '</button>';
    document.body.appendChild(box);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('on')));
    const close = () => { box.classList.remove('on'); setTimeout(() => box.remove(), 400); };
    box.querySelector('.x').addEventListener('click', close);
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    box.querySelector('[data-take]').addEventListener('click', () => {
      const take = () => { useCode(OFFER, true).then(() => { close(); toPlans(); }); };
      if (signedIn()) take(); else signUp('A free Snowstar account, and 15% off your first StreamDAW purchase with ' + OFFER + '.', take);
    });
  }
  // When: back on this page from a product page; or the pointer leaves for the tabs (a desktop, after 10 s here);
  // or after 45 s, having scrolled to the plans and away without pressing anything.
  if (!seen()) {
    const t0 = Date.now();
    let back = false; try { back = sessionStorage.getItem('sd_back') === '1'; } catch (e) {}
    if (back) setTimeout(offer, 4000);
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY <= 0 && Date.now() - t0 > 10000) offer(); });
    let sawPlans = false;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const x of es) if (x.isIntersecting) sawPlans = true; }) : null;
    if (io) io.observe(root);
    setTimeout(() => { if (sawPlans && !document.querySelector('.offer')) offer(); }, 45000);
  }
})();
