/* ═══════════ Mutra — the licence funnel ═══════════

   Rebuilt to Musicbed's shape, because their funnel asks a question Mutra
   never did.

   Mutra used to ask one thing: where will the music run? Seven tiers, digital
   through TV commercial. That axis is real, but it is not where the money is.
   Musicbed asks WHO IS BUYING first, and only then where it runs — and on their
   live funnel the same track, same distribution, same everything is $69 to a
   wedding filmmaker and $349 once a brand's name is on the video. A 5x spread
   on a question we were not asking. Under the old scheme a 400-person insurer
   and a two-person studio both paid the same for a corporate film.

   So: seven where-it-runs tiers collapse to two COVERAGE bands, and the price
   moves onto six BUYER bands. Nothing is priced until the buyer has said who
   they are.

   WHAT IS DELIBERATELY NOT COPIED
   Musicbed's licences are perpetual — "they never expire, even if the
   subscription is not renewed". Mutra's term is hard and the renewal IS the
   business, so the term survives this rewrite untouched. Their subscription
   tiers are not built either; every branch here ends in a per-track price.

   SCREENS
     1  who is licensing            business | individual
     2a individual: what are you    youtube · wedding · freelance · supervisor
     3a individual: who is it for   own work | client work        <- the price lever
     2b business: coverage + size   standard|extended · 0-100|101-250|250+
     4  extended                    quote form, with a published floor
     5  price + term                the only screen with a number on it
     6  project details             end client + project name, per project
     7  receipt / pay

   The price is computed here to show it, and recomputed server-side from the
   same table before a shekel is charged. Nothing sent from this file is
   trusted as an amount. */
(function () {
  const CUR = '₪';

  /* Bands and multipliers. MUST stay in step with worker/src/pricing.js — that
     file is the authority, this one is the shop window. */
  const BUYERS = {
    'individual-own':    { short: 'My own work',      base: 180 },
    'wedding':           { short: 'Ceremony films',   base: 250 },
    'individual-client': { short: 'Client work',      base: 450 },
    'business-small':    { short: 'Business · 0–100', base: 650 },
    'business-mid':      { short: 'Business · 101–250', base: 1200 },
    'business-large':    { short: 'Business · 250+',  base: null },
  };
  const TERMS = [
    { id: '6m',   label: '6 months',    months: 6,    mult: 0.55, note: '' },
    { id: '12m',  label: '12 months',   months: 12,   mult: 1.00, note: '' },
    { id: '24m',  label: '24 months',   months: 24,   mult: 1.65, note: 'save 25%' },
    { id: '36m',  label: '36 months',   months: 36,   mult: 2.15, note: 'save 35%' },
    // Organic only. A perpetual licence with no cap on paid media is an
    // unlimited advertising buy sold once, at a price set for a website.
    { id: 'perp', label: 'No end date', months: null, mult: 4.40,
      note: 'organic only', noPaid: true },
    { id: 'excl', label: 'Exclusive',   months: null, mult: null, note: 'by arrangement' },
  ];
  const termById = (id) => TERMS.find((t) => t.id === id) || TERMS[1];

  /* Price class — the second axis after the buyer band. Mirrors
     worker/src/pricing.js; the server re-derives every figure regardless, and
     these defaults are overwritten by /api/pricing/classes on load so a tuned
     multiplier shows the moment it is saved rather than after a deploy. */
  const CLASSES = { A: { mult: 3.2 }, B: { mult: 1.8 }, C: { mult: 1.0 }, D: { mult: 0.5 } };

  /** A per-track percentage overrides the class — the letter is a preset, not
   *  a cage. Whether a track needs a QUOTE is a rights question and lives on
   *  the lane, never on the class: every class sells self-serve, however dear. */
  const classMult = (track) => {
    const pct = Number(track && track.pct);
    if (Number.isFinite(pct) && pct > 0) return pct / 100;
    const c = CLASSES[String((track && track.cls) || 'C').toUpperCase()];
    return (c || CLASSES.C).mult;
  };
  fetch('/api/pricing/classes', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && d.classes) Object.assign(CLASSES, d.classes); })
    .catch(() => {});
  // Below ILS 20 the rounding is off: round(n/10)*10-1 turns anything under
  // ILS 5 into zero, which would give a cheap track away for nothing.
  const pricePoint = (n) => n < 20 ? Math.max(0, Math.round(n * 100) / 100)
                                   : Math.max(0, Math.round(n / 10) * 10 - 1);
  const LEGACY_DIGITAL = 149;

  /* Bit is the only alternative to the card, because it is the only one we can
     actually receive: there is no published bank account and no Paybox. */
  const BIT_NUMBER = '054-449-8389';

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** A track edited to 199 when the catalogue said 149 was marked up by hand;
   *  that intent should survive the restructure rather than be flattened. */
  function trackFactor(track) {
    const p = (track && track.prices) || {};
    const legacy = Number.isFinite(p.digital) ? p.digital
                 : Number.isFinite(track && track.fee) ? track.fee : null;
    if (legacy == null || legacy <= 0) return 1;
    return Math.min(Math.max(legacy / LEGACY_DIGITAL, 0.2), 8);
  }

  /** The class letter this track prices at, defaulting to C like the server. */
  const gradeLetter = (track) => String((track && track.cls) || 'C').toUpperCase();

  /** Five separate reasons a price becomes a conversation, and they are not
   *  the same thing: the track is co-owned, the buyer is too big, the use is
   *  broadcast, or they want exclusivity. */
  function priceFor(track, buyerId, coverageId, termId) {
    const b = BUYERS[buyerId], t = termById(termId);
    if (!b) return { quote: true, reason: 'unknown' };
    if (track && track.lane === 'quote') return { quote: true, reason: 'co_owned' };
    if (coverageId === 'extended') return { quote: true, reason: 'extended_coverage' };
    if (b.base == null) return { quote: true, reason: 'large_client' };
    if (t.mult == null) return { quote: true, reason: 'exclusive' };
    if (t.noPaid && pick.paid) return { quote: true, reason: 'perp_no_paid' };
    /* Perpetual is self-serve on the cheap classes only. Selling "no end date"
       on an A or a B hands over, for a card payment, the one thing that could
       be worth a buyout later — and it is exactly the good tracks where that
       happens. Mirrored from the server so the funnel never shows a price the
       server would then refuse. */
    if (t.noPaid && /^[AB]$/.test(gradeLetter(track))) {
      return { quote: true, reason: 'perp_high_class' };
    }
    // a per-band override on the track wins outright
    const over = track && track.prices && track.prices[buyerId];
    const base = Number.isFinite(over) && over > 0 ? over : b.base * trackFactor(track);
    return { quote: false, amount: pricePoint(base * classMult(track) * t.mult) };
  }

  /** Open a mailto without stranding a blank tab. */
  function openMail(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ── funnel state ──────────────────────────────────────────────────────── */

  let el = null, current = null, screen = 1;
  // The code the buyer entered and the server accepted at preview time. Reset
  // whenever a new track opens, so a code checked against one price cannot
  // ride along to a different one.
  let couponCode = '';
  const pick = { who: null, persona: null, forWhom: null, coverage: 'standard',
                 size: null, term: '12m', paid: false };

  function resetPick() {
    pick.who = pick.persona = pick.forWhom = pick.size = null;
    pick.coverage = 'standard';
    pick.term = '12m';
    pick.paid = false;
  }

  /** The six bands are reached by different routes; this is the one place that
   *  decides which one a set of answers lands on. */
  function buyerId() {
    if (pick.who === 'business') {
      return pick.size === 'mid' ? 'business-mid'
           : pick.size === 'large' ? 'business-large'
           : pick.size === 'small' ? 'business-small' : null;
    }
    if (pick.persona === 'wedding') {
      return pick.forWhom === 'wedding-only' ? 'wedding'
           : pick.forWhom === 'wedding-commercial' ? 'individual-client' : null;
    }
    if (pick.persona === 'supervisor') {
      // a supervisor is buying on someone else's behalf, so they answer the
      // business questions — same as Musicbed routes them
      return pick.size === 'mid' ? 'business-mid'
           : pick.size === 'large' ? 'business-large'
           : pick.size === 'small' ? 'business-small' : null;
    }
    if (pick.forWhom === 'own') return 'individual-own';
    if (pick.forWhom === 'client') return 'individual-client';
    return null;
  }

  const bandLabel = () => (BUYERS[buyerId()] || {}).short || '—';

  /* ── shell ─────────────────────────────────────────────────────────────── */

  const SHELL = `
    <div class="lic-card lic-wiz" role="dialog" aria-modal="true" aria-labelledby="licTitle">
      <button class="lic-close" aria-label="Close">&times;</button>
      <div class="lic-head">
        <img class="lic-cover" alt="">
        <div>
          <div class="lic-kicker">Licence</div>
          <h3 id="licTitle"></h3>
          <div class="lic-artist"></div>
        </div>
      </div>
      <div class="lic-crumbs" hidden></div>
      <div class="lic-body"></div>
    </div>`;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'lic-modal';
    el.hidden = true;
    el.innerHTML = SHELL;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && !el.hidden) close(); });
    return el;
  }

  const body = () => el.querySelector('.lic-body');

  /** Cards are the whole interaction: one question, two to four answers, no
   *  preselection where the answer moves the price. */
  function cards(list) {
    return `<div class="lic-cards2">${list.map((c) => `
      <button type="button" class="lic-opt" data-v="${esc(c.v)}">
        <b>${esc(c.t)}</b><span>${esc(c.d)}</span>
      </button>`).join('')}</div>`;
  }

  function onCards(fn) {
    body().querySelectorAll('.lic-opt').forEach((b) =>
      b.addEventListener('click', () => fn(b.dataset.v)));
  }

  /** The trail back. Musicbed's EDIT link, made into a full breadcrumb because
   *  Mutra's funnel is shorter and there is room to show the whole path. */
  function crumbs() {
    const c = el.querySelector('.lic-crumbs');
    const bits = [];
    if (pick.who) bits.push([1, pick.who === 'business' ? 'Business' : 'Individual']);
    if (pick.persona) bits.push([2, { youtube: 'Creator', wedding: 'Ceremony',
      freelance: 'Freelance', supervisor: 'Supervisor' }[pick.persona]]);
    if (pick.forWhom) bits.push([3, { own: 'Own work', client: 'Client work',
      'wedding-only': 'Families only', 'wedding-commercial': 'Families + commercial' }[pick.forWhom]]);
    if (pick.who === 'business' && pick.size) bits.push([2, BUYERS[buyerId()] ? BUYERS[buyerId()].short : '']);
    // coverage is a business-branch answer; showing it on the individual path
    // is how a stale value announces itself as part of a route it never took
    if (pick.who === 'business' && pick.coverage === 'extended') bits.push([2, 'Extended']);
    c.hidden = !bits.length;
    c.innerHTML = bits.map(([s, t]) =>
      `<button type="button" class="lic-crumb" data-s="${s}">${esc(t)}</button>`).join('<i>›</i>');
    c.querySelectorAll('.lic-crumb').forEach((b) =>
      b.addEventListener('click', () => { go(Number(b.dataset.s)); }));
  }

  /**
   * Going BACK must forget what came after.
   *
   * Without this, answering Business → Extended and then stepping back to pick
   * Individual left pick.coverage on 'extended' — so the trail read
   * "Individual › Creator › Extended", a path that does not exist, and the
   * price was computed against a coverage the buyer had abandoned. State from
   * an abandoned branch is worse than no state: it is invisible and it is
   * wrong.
   */
  function go(n) {
    if (n <= screen) {
      if (n <= 1) { pick.who = null; }
      if (n <= 2) { pick.persona = null; pick.size = null; pick.coverage = 'standard'; }
      if (n <= 3) { pick.forWhom = null; }
      if (n <= 5) { pick.paid = false; }
    }
    screen = n;
    render();
  }

  /* ── the screens ───────────────────────────────────────────────────────── */

  function render() {
    if (!current) return;
    crumbs();
    const t = current;

    /* A co-owned track used to skip the funnel entirely and go straight to the
       quote form. That saved the buyer five screens and cost us the only thing
       that makes a quote answerable: WHO is asking. "Someone wants Bunny" is
       not a brief; "a 400-person brand wants Bunny for a paid campaign" is a
       price. So quote-lane tracks now walk the same funnel — the answers are
       what the quote is written from — and only the last screen differs. */

    if (screen === 1) return screen1();
    if (screen === 2) return pick.who === 'business' ? screen2b() : screen2a();
    if (screen === 3) return screen3a();
    if (screen === 4) return screenQuote('extended_coverage');
    if (screen === 5) return screen5();
    if (screen === 6) return screen6();
  }

  function screen1() {
    body().innerHTML = `
      <h4 class="lic-q">Who is this licence for?</h4>
      ${cards([
        { v: 'business', t: 'Business', d: 'Agency, production company, brand, non-profit, institution.' },
        { v: 'individual', t: 'Individual', d: 'YouTube, freelance, wedding, music supervisor.' },
      ])}`;
    onCards((v) => { pick.who = v; go(2); });
  }

  function screen2a() {
    body().innerHTML = `
      <h4 class="lic-q">What best describes you?</h4>
      ${cards([
        { v: 'youtube', t: 'YouTube creator / podcaster', d: 'Video or audio you publish under your own name.' },
        { v: 'wedding', t: 'Ceremony filmmaker', d: 'Weddings, bar and bat mitzvahs, brit milah, birthdays, sweet sixteens.' },
        { v: 'freelance', t: 'Freelance filmmaker', d: 'Work you shoot and edit, for yourself or for others.' },
        { v: 'supervisor', t: 'Music supervisor / agency', d: 'You choose music on someone else’s behalf.' },
      ])}
      <button type="button" class="lic-textlink lic-else">Something else? Tell us →</button>`;
    onCards((v) => {
      pick.persona = v;
      // a supervisor answers the business questions — they are buying for
      // someone whose size is the thing that matters
      go(v === 'supervisor' ? 2 : 3);
      if (v === 'supervisor') { pick.who = 'business'; render(); }
    });
    body().querySelector('.lic-else').addEventListener('click', () => screenQuote('other'));
  }

  function screen3a() {
    const wedding = pick.persona === 'wedding';
    body().innerHTML = `
      <h4 class="lic-q">Who is the work for?</h4>
      ${cards(wedding ? [
        { v: 'wedding-only', t: 'Families only', d: 'Films for the family or the couple, and nobody else.' },
        { v: 'wedding-commercial', t: 'Families and commercial clients', d: 'Also venues, planners, caterers, brands.' },
      ] : [
        { v: 'own', t: 'My own channel or work', d: 'The video is yours. No client’s name on it, no client paying for it.' },
        { v: 'client', t: 'Client work', d: 'Someone else commissioned it, or someone else’s brand appears in it.' },
      ])}
      <p class="lic-foot">Personal coverage does not cover accounts over 500k followers.
        <button type="button" class="lic-textlink lic-ask">Ask us →</button></p>`;
    onCards((v) => { pick.forWhom = v; go(5); });
    body().querySelector('.lic-ask').addEventListener('click', () => screenQuote('big_account'));
  }

  function screen2b() {
    const sizes = [['small', '0–100 employees'], ['mid', '101–250'], ['large', 'Over 250']];
    body().innerHTML = `
      <h4 class="lic-q">Coverage</h4>
      <div class="lic-radios">
        ${[['standard', 'Standard', 'Web, social, podcast, internal and industrial video.'],
           ['extended', 'Extended', 'TV, cinema, VOD and OTT, film festivals, radio, commercials.']]
          .map(([v, t, d]) => `
          <label class="lic-radio${pick.coverage === v ? ' on' : ''}">
            <input type="radio" name="cov" value="${v}"${pick.coverage === v ? ' checked' : ''}>
            <b>${t}</b><span>${d}</span></label>`).join('')}
      </div>
      <h4 class="lic-q lic-q2">Size of the end client</h4>
      <p class="lic-hint">The company whose name appears in the video. If the work is
        for your own brand, that’s you.</p>
      <div class="lic-segs">
        ${sizes.map(([v, t]) => `<button type="button" class="lic-seg${pick.size === v ? ' on' : ''}"
          data-v="${v}">${t}</button>`).join('')}
      </div>
      <button type="button" class="lic-go lic-next" ${pick.size ? '' : 'disabled'}>Continue</button>`;

    body().querySelectorAll('input[name="cov"]').forEach((r) =>
      r.addEventListener('change', () => { pick.coverage = r.value; render(); }));
    body().querySelectorAll('.lic-seg').forEach((b) =>
      b.addEventListener('click', () => { pick.size = b.dataset.v; render(); }));
    body().querySelector('.lic-next').addEventListener('click', () =>
      go(pick.coverage === 'extended' ? 4 : 5));
  }

  /* Screen 5 — the only screen with a number on it. The term selector lives
     HERE, next to the price, and not on a screen of its own: the term is the
     product, and burying it makes it read as a tax rather than a choice. */
  function screen5() {
    const t = current;
    const bid = buyerId();
    const p = priceFor(t, bid, pick.coverage, pick.term);
    const term = termById(pick.term);

    const ends = term.months
      ? new Date(Date.now() + term.months * 30.44 * 864e5)
          .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

    body().innerHTML = `
      <div class="lic-summary">
        <span>${esc(bandLabel())}</span><i>·</i>
        <span>${pick.coverage === 'extended' ? 'Extended' : 'Standard'} coverage</span>
      </div>

      <h4 class="lic-q lic-q2">For how long</h4>
      <div class="lic-segs lic-terms">
        ${TERMS.map((x) => `<button type="button" class="lic-seg${pick.term === x.id ? ' on' : ''}"
          data-v="${x.id}"><b>${x.label}</b>${x.note ? `<i>${x.note}</i>` : ''}</button>`).join('')}
      </div>
      <p class="lic-termline">${ends
        ? `Ends ${ends}. We email you 30 days before.`
        : term.id === 'perp' ? 'Never expires. Nothing to renew.'
        : 'Priced per case.'}</p>

      <label class="lic-check1">
        <input type="checkbox" class="lic-paid"${pick.paid ? ' checked' : ''}>
        <span>There will be paid promotion behind this project
          <i>Promoted posts, pre-roll, display, paid influencer.</i></span>
      </label>

      <div class="lic-priceline">
        <span class="lic-price">${p.quote ? 'On request' : CUR + p.amount.toLocaleString()}</span>
        <span class="lic-per">${p.quote ? '' : 'one track, one project · ex VAT'}</span>
      </div>

      <ul class="lic-incl">
        <li><b>One project only.</b> This licence covers the project you name at
          checkout and no other. A second project needs its own licence, even for
          the same track and the same client.</li>
        <li>Web, social, podcast, internal and industrial video, worldwide.</li>
        <li>${term.id === 'perp'
          ? 'Organic only — no paid promotion behind this project.'
          : `Paid media up to ${CUR}25,000 behind this project.`}</li>
        <li>${term.id === 'perp'
          ? 'Yours with no end date, and nothing to renew.'
          : 'Renew before it ends to keep using it — renewals cost less.'}</li>
        <li>Clean, un-watermarked files.</li>
      </ul>

      <div class="lic-acts">
        <button class="lic-go lic-next">${p.quote ? 'Request a quote'
          : 'Continue <span class="lic-cards" aria-hidden="true"><i class="cb-visa">VISA</i><i class="cb-mc"></i><i class="cb-amex">AMEX</i></span>'}</button>
        <button class="lic-share">Copy link</button>
      </div>`;

    body().querySelectorAll('.lic-seg').forEach((b) =>
      b.addEventListener('click', () => { pick.term = b.dataset.v; render(); }));
    const paidBox = body().querySelector('.lic-paid');
    if (paidBox) paidBox.addEventListener('change', () => { pick.paid = paidBox.checked; render(); });
    body().querySelector('.lic-next').addEventListener('click', () =>
      p.quote ? screenQuote(p.reason) : go(6));
    body().querySelector('.lic-share').addEventListener('click', shareLink);
  }

  /* Screen 6 — the load-bearing one. End client and project name are what make
     "one track, one project" enforceable, and what lets a renewal email name
     the video it is about rather than just the track. */
  function screen6() {
    const t = current;
    const p = priceFor(t, buyerId(), pick.coverage, pick.term);
    body().innerHTML = `
      <h4 class="lic-q">What is it for?</h4>
      <p class="lic-hint">Printed on the licence. A licence covers one project, so
        this is what it names.</p>
      <label class="lic-field"><span>Project name</span>
        <input class="lic-proj" type="text" maxlength="140" placeholder="Spring brand film"></label>
      <label class="lic-field lic-cpwrap"><span>Discount code <i>optional</i></span>
        <span class="lic-cprow"><input class="lic-coupon" type="text" maxlength="40"
          placeholder="If you were given one" autocapitalize="characters" spellcheck="false">
        <button class="lic-cpgo" type="button">Apply</button></span>
        <em class="lic-cpsaid"></em></label>
      <label class="lic-field"><span>End client</span>
        <input class="lic-client" type="text" maxlength="140"
          placeholder="${pick.who === 'business' ? 'The company in the video' : 'Yourself, or the client'}"></label>
      <div class="lic-priceline">
        <span class="lic-was" hidden></span>
        <span class="lic-price">${CUR}${p.amount.toLocaleString()}</span>
        <span class="lic-per">+ VAT 18%</span>
      </div>
      <p class="lic-err" hidden></p>
      <div class="lic-acts">
        <button class="lic-go lic-submit">Pay by Card <span class="lic-cards" aria-hidden="true"><i class="cb-visa">VISA</i><i class="cb-mc"></i><i class="cb-amex">AMEX</i></span></button>
      </div>
      <button class="lic-alt" type="button">Pay with Bit instead</button>`;

    /* Checking a code shows what it would do before anyone commits. The
       answer is advisory: the price that gets charged is recomputed on the
       server at submit time, so a code that expires between the two is caught
       there rather than honoured because the browser said so. */
    /* One place that writes the total, so the discounted figure, the struck-out
       original and the button label can never disagree with each other. */
    const showPrice = (amount, wasAmount) => {
      const el2 = body().querySelector('.lic-price');
      const was = body().querySelector('.lic-was');
      const btn2 = body().querySelector('.lic-submit');
      const alt = body().querySelector('.lic-alt');
      if (!el2) return;
      el2.textContent = amount == null ? 'On request' : CUR + amount.toLocaleString();
      if (was) {
        was.hidden = !(wasAmount != null && wasAmount !== amount);
        was.textContent = wasAmount != null ? CUR + wasAmount.toLocaleString() : '';
      }
      /* A card charge of zero is refused by the processor, so a code that takes
         the price to nothing has to complete without one rather than sending
         somebody to a checkout that cannot succeed. */
      const free = amount === 0;
      if (btn2) btn2.innerHTML = free
        ? 'Get it free'
        : 'Pay by Card <span class="lic-cards" aria-hidden="true"><i class="cb-visa">VISA</i><i class="cb-mc"></i><i class="cb-amex">AMEX</i></span>';
      if (alt) alt.hidden = free;
      const per = body().querySelector('.lic-per');
      if (per) per.hidden = free;
    };

    const cin = body().querySelector('.lic-coupon');
    const cgo = body().querySelector('.lic-cpgo');
    const csaid = body().querySelector('.lic-cpsaid');
    if (cgo) cgo.addEventListener('click', async () => {
      const code = (cin.value || '').trim();
      if (!code) { couponCode = ''; csaid.textContent = ''; return; }
      csaid.textContent = 'Checking…';
      const priced = priceFor(t, buyerId(), pick.coverage, pick.term);
      const r = await fetch('/api/coupons/check', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, amount: priced.quote ? 0 : Math.round(priced.amount * 100),
                               cls: String((t && t.cls) || 'C') }),
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) {
        couponCode = code;
        csaid.className = 'lic-cpsaid ok';
        csaid.textContent = r.label;
        // The figure at the bottom is the one people read before they press
        // pay. Saying "100% off" up here while it still shows the full price
        // down there is the version of this that loses trust.
        showPrice(Math.round(r.amount / 100), priced.quote ? null : priced.amount);
      } else {
        couponCode = '';
        csaid.className = 'lic-cpsaid bad';
        csaid.textContent = (r && r.reason) || 'Could not check that code.';
        showPrice(priced.quote ? null : priced.amount, null);
      }
    });

    const proj = body().querySelector('.lic-proj');
    const client = body().querySelector('.lic-client');
    const err = body().querySelector('.lic-err');
    const need = () => {
      if (proj.value.trim() && client.value.trim()) return true;
      err.hidden = false;
      err.textContent = 'Both fields, please — the licence names the project it covers.';
      return false;
    };
    body().querySelector('.lic-submit').addEventListener('click', () => {
      if (need()) submitRequest(true, proj.value.trim(), client.value.trim());
    });
    body().querySelector('.lic-alt').addEventListener('click', () => {
      if (!need()) return;
      if (!(window.SnowstarAccount && SnowstarAccount.user)) {
        // A Bit payment is released by hand, so it needs somewhere to send the
        // files. Take the account first, then pick the request back up.
        pending = { slug: current.slug, pick: { ...pick },
                    proj: proj.value.trim(), client: client.value.trim() };
        try { sessionStorage.setItem('mutraPendingLicence', JSON.stringify(pending)); } catch {}
        if (window.SnowstarAuthResume) SnowstarAuthResume(resumePending);
        close();
        if (window.SnowstarOpenAuth) SnowstarOpenAuth('signup',
          'Create a free account and we’ll send the Bit details and the files.');
        return;
      }
      submitRequest(false, proj.value.trim(), client.value.trim());
    });
  }

  /** Every dead end that is really a conversation. Four different reasons, and
   *  saying which one it is matters — "co-owned" and "too big" are not the
   *  same news. */
  function screenQuote(reason) {
    const t = current;
    const why = {
      co_owned: 'This track is co-owned. Commercial use goes through the other rights holder, so we price it case by case. Same catalogue, one extra email.',
      extended_coverage: 'Broadcast, cinema and radio we price by hand. From ' + CUR + '1,600 per track. Tell us the project and you’ll have a price the same day.',
      large_client: 'For an end client over 250 people we price per campaign. Tell us the project and you’ll have a price the same day.',
      exclusive: 'Exclusive use — nobody else licences this track while you hold it. Priced per case.',
      big_account: 'Over 500k followers we price per campaign. Tell us where it runs and you’ll have a price the same day.',
      perp_high_class: 'This track is not sold with an open-ended licence over the counter. A licence with no end date is permanent, and on a track at this level that is a conversation rather than a checkout — tell us about the project and we will quote it, or pick 12, 24 or 36 months and buy it now.',
    perp_no_paid: 'A licence with no end date covers organic use only — a site, a social page, a channel. Paid promotion behind the project needs a dated term instead, so pick 12, 24 or 36 months, or tell us about the campaign and we’ll quote it.',
      other: 'Tell us what you’re making and we’ll come back with the right licence.',
    }[reason] || 'Tell us about the project and we’ll come back with a price.';

    const ext = reason === 'extended_coverage';
    const known = buyerId() ? `${bandLabel()} · ${termById(pick.term).label}` : '';
    body().innerHTML = `
      <h4 class="lic-q">${ext ? 'Where will it run?' : 'Tell us about the project'}</h4>
      ${known ? `<div class="lic-summary"><span>${esc(known)}</span></div>` : ''}
      <p class="lic-hint">${esc(why)}</p>
      ${ext ? `<div class="lic-checks">${
        ['TV show / VOD / OTT', 'Cinema', 'Film festival', 'Radio or streaming audio',
         'TV commercial', 'Video game', 'Podcast over 10k downloads/month']
          .map((x) => `<label><input type="checkbox" value="${esc(x)}"> ${esc(x)}</label>`).join('')
      }</div>` : ''}
      <label class="lic-field"><span>Project</span>
        <input class="lic-proj" type="text" maxlength="140" placeholder="What are you making?"></label>
      <label class="lic-field"><span>End client</span>
        <input class="lic-client" type="text" maxlength="140" placeholder="Whose name is on it"></label>
      <label class="lic-field"><span>Territory and dates</span>
        <input class="lic-terr" type="text" maxlength="140" placeholder="Israel, from March, 6 weeks"></label>
      <p class="lic-err" hidden></p>
      <div class="lic-acts"><button class="lic-go lic-submit">Get a price</button></div>`;

    // Both perpetual refusals have the same escape hatch: a dated term is
    // right there and buyable now, so offer it rather than leaving the quote
    // form as the only way forward.
    if (reason === 'perp_no_paid' || reason === 'perp_high_class') {
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'lic-textlink';
      back.textContent = '← Pick a dated term instead';
      back.addEventListener('click', () => go(5));
      body().insertBefore(back, body().querySelector('.lic-field'));
    }
    body().querySelector('.lic-submit').addEventListener('click', () => {
      const proj = body().querySelector('.lic-proj').value.trim();
      const client = body().querySelector('.lic-client').value.trim();
      const terr = body().querySelector('.lic-terr').value.trim();
      const where = [...body().querySelectorAll('.lic-checks input:checked')].map((i) => i.value);
      const err = body().querySelector('.lic-err');
      if (!proj) { err.hidden = false; err.textContent = 'What are you making?'; return; }
      submitRequest(false, proj, client, { quote: true, reason, territory: terr, where });
    });
  }

  /* ── submit ────────────────────────────────────────────────────────────── */

  async function submitRequest(straightToCard, project, client, quoteInfo) {
    const t = current;
    const btn = body().querySelector('.lic-submit') || body().querySelector('.lic-go');
    const was = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const bid = buyerId();
    const term = termById(pick.term);
    try {
      const r = await fetch('/api/licence/request', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: t.slug,
          buyer: bid,
          buyer_label: bandLabel(),
          term_label: term.label,
          coverage: pick.coverage,
          paid_media: !!pick.paid,
          duration: pick.term,
          months: term.months,
          project_name: project,
          // Sent as typed. The server looks the code up, decides whether it
          // applies and works out the discount itself — the browser is never
          // trusted with what something costs.
          coupon: couponCode,
          licensee_name: client,
          use_territory: quoteInfo ? quoteInfo.territory : '',
          use_where: quoteInfo && quoteInfo.where ? quoteInfo.where.join(', ') : '',
          quote_only: !!(quoteInfo && quoteInfo.quote),
          // legacy field the server still snapshots; harmless and keeps old
          // requests comparable
          tier: pick.coverage === 'extended' ? 'tvshow' : 'digital',
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        if (r.status === 400 && d.error === 'email_required') {
          if (btn) { btn.disabled = false; btn.innerHTML = was; }
          if (window.SnowstarOpenAuth) SnowstarOpenAuth('signup',
            'Create a free account so we can send you the licence and the files.');
          return;
        }
        throw new Error(d.error || 'failed');
      }
      if (straightToCard) return goToCard(d.ref, () => showReceipt(d, !!quoteInfo));
      showReceipt(d, !!quoteInfo);
    } catch {
      if (btn) { btn.disabled = false; btn.innerHTML = was; }
      openMail('mailto:licensing@snowstar.company?subject='
        + encodeURIComponent(`Mutra — licence: ${t.title}`)
        + '&body=' + encodeURIComponent(
          `Track: ${t.title} — ${t.artist}\nBand: ${bandLabel()}\nCoverage: ${pick.coverage}\n`
          + `Term: ${term.label}\nProject: ${project}\nClient: ${client}\n`));
    }
  }

  /** Straight to HYP's hosted card page. On any failure, fall back to the
   *  receipt so the reference is never lost — a buyer who has decided to pay
   *  must not hit a dead end. */
  async function goToCard(ref, onFail) {
    try {
      const r = await fetch('/api/hyp/checkout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || 'checkout_failed');
      if (window.mutraTrack) mutraTrack('checkout', current ? current.slug : 'unknown');
      location.href = j.url;
    } catch { onFail(); }
  }

  function showReceipt(d, quoteOnly) {
    const ex = d.amount_ex_vat != null ? d.amount_ex_vat / 100 : null;
    const vat = ex != null ? Math.round(ex * 0.18) : null;
    el.querySelector('.lic-crumbs').hidden = true;
    body().innerHTML = `
      <div class="lic-kicker">Request received</div>
      <div class="lic-ref">
        <span>Your reference</span><b>${esc(d.ref)}</b>
        <button class="lic-copyref" type="button">Copy</button>
      </div>
      ${quoteOnly || ex == null
        ? `<p class="lic-note">We’ll come back to you with terms and a price. Nothing is
             charged until you’ve seen them in writing and said yes.</p>`
        : `<ul class="lic-sum">
             <li><span>Licence</span><b>${CUR}${ex.toLocaleString()}</b></li>
             <li><span>VAT 18%</span><b>${CUR}${vat.toLocaleString()}</b></li>
             <li class="lic-tot"><span>To pay</span><b>${CUR}${(ex + vat).toLocaleString()}</b></li>
           </ul>
           <p class="lic-note">Pay by card and the clean file unlocks the moment the
             payment clears — usually seconds.</p>
           <details class="lic-bit">
             <summary>Pay with Bit instead</summary>
             <p>Send <b>${CUR}${(ex + vat).toLocaleString()}</b> by Bit to
               <b class="lic-bitnum">${BIT_NUMBER}</b>, and put <b>${esc(d.ref)}</b> in the
               note so it can be matched.</p>
             <img class="lic-bitqr" src="assets/bit-qr.png" alt="Bit payment QR code"
                  loading="lazy" onerror="this.remove()">
             <p class="lic-bitwait">Released by hand once it lands — same day, not seconds.</p>
           </details>`}
      <div class="lic-acts">
        ${quoteOnly || ex == null ? '' : '<button class="lic-go lic-card-pay">Pay by card</button>'}
        <button class="lic-share lic-done">Done</button>
      </div>
      <p class="lic-payerr" hidden></p>`;

    body().querySelector('.lic-done').addEventListener('click', close);
    const payBtn = body().querySelector('.lic-card-pay');
    if (payBtn) payBtn.addEventListener('click', async () => {
      const err = body().querySelector('.lic-payerr');
      payBtn.disabled = true; payBtn.textContent = 'Opening secure page…';
      try {
        const r = await fetch('/api/hyp/checkout', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ref: d.ref }),
        });
        const j = await r.json();
        if (!r.ok || !j.url) throw new Error(j.error || 'checkout_failed');
        location.href = j.url;
      } catch (e) {
        payBtn.disabled = false; payBtn.textContent = 'Pay by card';
        err.hidden = false;
        err.textContent = String(e.message) === 'quote_lane_not_self_serve'
          ? 'This track needs a quote rather than a card payment — we’ll be in touch.'
          : 'Could not open the payment page. Your reference is saved — pay by Bit with it, or try again.';
      }
    });
    const cp = body().querySelector('.lic-copyref');
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(d.ref); cp.textContent = 'Copied'; }
      catch { prompt('Your reference:', d.ref); }
      setTimeout(() => { cp.textContent = 'Copy'; }, 1600);
    });
  }

  async function shareLink() {
    const url = location.origin + location.pathname + '?license=' + encodeURIComponent(current.slug);
    try {
      await navigator.clipboard.writeText(url);
      if (window.mutraToast) mutraToast('Link copied');
    } catch { prompt('Link to this track:', url); }
  }

  /* ── open / close ──────────────────────────────────────────────────────── */

  function open(track) {
    build();
    el.innerHTML = SHELL;
    el.querySelector('.lic-close').addEventListener('click', close);
    current = track;
    couponCode = '';                 // a code checked against one price must not follow to another
    resetPick();
    screen = 1;
    el.querySelector('.lic-cover').src = track.cover || '';
    el.querySelector('#licTitle').textContent = track.title;
    el.querySelector('.lic-artist').textContent = track.artist || '';
    render();
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    if (window.mutraTrack) mutraTrack('license-open', track.slug, { once: true });
  }

  function close() {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
    current = null;
  }

  /* Coming back from HYP. The Worker has already verified the payment against
     HYP's own servers and granted the licence by the time this runs. */
  function showPaymentOutcome() {
    const q = new URLSearchParams(location.search);
    const state = q.get('pay');
    if (!state) return;
    const ref = q.get('ref') || '';
    const reason = q.get('reason') || '';
    build();
    el.innerHTML = SHELL;
    el.querySelector('.lic-close').addEventListener('click', close);
    el.querySelector('.lic-head').hidden = true;
    const ok = state === 'ok';
    /* The card went through but our verification did not. Saying "nothing was
       charged" to somebody whose card HAS been charged is the worst thing this
       screen can do, and it is what it did. */
    const confirming = state === 'confirming';
    const why = {
      declined: 'The card was declined. Nothing has been charged.',
      unpaid_check: '',
      unverified: 'We could not confirm that payment with HYP, so nothing was released. If your card was charged, send us the reference and we will sort it out today.',
      amount_mismatch: 'The amount did not match the licence. Nothing was released.',
      quote_lane: 'This track needs a quote rather than a card payment.',
      bad_ref: 'That payment reference was not recognised.',
      unknown_ref: 'That payment reference was not recognised.',
    }[reason] || 'The payment did not complete. Nothing has been charged.';
    const kicker = ok ? 'Payment received' : confirming ? 'Payment received' : 'Payment not completed';
    const head = ok ? 'Your licence is live'
      : confirming ? 'We are confirming it now' : 'Nothing was charged';
    const note = ok
      ? 'The clean, un-watermarked file is now yours to download — look for the download arrow on the track, or in Account › Downloads. A confirmation is on its way by email.'
      : confirming
        ? 'Your card went through. We could not complete the automatic check with the payment provider, so a person is confirming it — usually within the hour. Your licence will appear in Account › Licences and you will get an email. Nothing more is needed from you.'
        : why;
    body().innerHTML = `
      <div class="lic-kicker">${kicker}</div>
      <h3 class="lic-q">${head}</h3>
      ${ref ? `<div class="lic-ref"><span>Reference</span><b>${esc(ref)}</b></div>` : ''}
      <p class="lic-note">${esc(note)}</p>
      <div class="lic-acts"><button class="lic-go lic-done">${ok ? 'Download it' : 'Close'}</button></div>`;
    body().querySelector('.lic-done').addEventListener('click', close);
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    q.delete('pay'); q.delete('ref'); q.delete('reason');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }
  addEventListener('DOMContentLoaded', showPaymentOutcome);
  if (document.readyState !== 'loading') showPaymentOutcome();

  /* Someone chose Bit while signed out. They were sent to sign up; the moment
     an account exists, pick the request back up exactly where they left it —
     including every funnel answer, so they do not walk the five screens twice. */
  let pending = null;
  function resumePending() {
    if (!(window.SnowstarAccount && SnowstarAccount.user)) return;
    let p = pending;
    if (!p) { try { p = JSON.parse(sessionStorage.getItem('mutraPendingLicence') || 'null'); } catch {} }
    if (!p) return;
    pending = null;
    try { sessionStorage.removeItem('mutraPendingLicence'); } catch {}
    const track = window.mutraPlayer && mutraPlayer.find(p.slug);
    if (!track) return;
    open(track);
    if (p.pick) Object.assign(pick, p.pick);
    screen = 6;
    render();
    const proj = body().querySelector('.lic-proj'), cl = body().querySelector('.lic-client');
    if (proj && p.proj) proj.value = p.proj;
    if (cl && p.client) cl.value = p.client;
  }
  if (window.MutraMembers && MutraMembers.onChange) MutraMembers.onChange(resumePending);
  addEventListener('DOMContentLoaded', resumePending);

  window.mutraLicense = { open, close, priceFor, BUYERS, TERMS };
})();
