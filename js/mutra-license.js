/* ═══════════ Mutra — licence chooser ═══════════
   Replaces the mailto that used to fire off the License button. Picking a
   licence is a real decision — what it covers, where it runs, for how long,
   what it costs — and none of that fits in an email draft.

   Prices are per track in ILS, because the first market is Israel and a
   quote in dollars invites a currency conversation nobody wanted. A track
   can override any tier (see the catalog editor); anything it doesn't set
   falls back to the defaults below.

   The dialog is deep-linkable: ?license=<slug> opens it on that track, so a
   link can be sent to whoever actually signs off on the budget. */
(function () {
  const CUR = '\u20aa';
  const USD_RATE = 3.0;      // Bank of Israel representative rate, Aug 2026

  /* Prices are ex-VAT. Every Israeli tariff in this sector states that
     explicitly — ACUM's, the Federation's 2026 price list, Eshkolot's — and
     the Consumer Protection Law's VAT-inclusive rule is B2C only, so B2B
     quoting ex-VAT is both the norm and legally fine here. VAT is 18%
     (since 1 Jan 2025). */
  const VAT_NOTE = 'Prices exclude VAT (18%)';

  /** The tiers, cheapest first. `quote` means the tier is negotiated rather
   *  than self-serve — broadcast money is too project-specific to post a
   *  number against, and it is where a rights conflict would actually bite. */
  /* Benchmarked against three things, in descending order of authority:

     1. The MCPS/PRS Production Music Rate Card, Q1 2026 — the only published,
        authoritative needledrop card in this industry, covering 100+ libraries
        (Universal Production Music, Warner Chappell PM, Extreme, West One, BMG).
        GBP ex-VAT; roughly ₪4.6 to the pound. Its SHAPE is the important part:
        advertising is expensive, programme use is cheap, corporate is cheapest.
        A single-country linear TV ad is £1,750 per 30s — but a cue inside a
        TV programme is £35, and a corporate production £250. Anyone pricing
        in-programme use like advertising has the curve upside down, which is
        exactly what the previous draft of this file did.
     2. Published per-track competitors: PremiumBeat $39/$59/$199/$999 (with
        broadcast tiered by territory count — 1 / 5 / worldwide), Soundstripe
        single-use $49/$199/$399/$1,249, Musicbed single song from $349,
        Foximusic (Tel Aviv) $29 commercial / $150 extended incl. broadcast.
     3. The subscription ceiling: Artlist — an Israeli company — sells Music
        Pro at ~₪112/mo with paid ads AND broadcast included. No per-track
        price can sit near a year of that, which is what caps the entry tier.

     Where the rate cards and the subscriptions disagree, the cards win on
     broadcast (they price it as the scarce thing it is) and the subscriptions
     win on digital (they have already commoditised it). */
  const TIERS = [
    { id: 'digital', label: 'Digital — web & social',
      blurb: 'Your own channels and organic social — site, YouTube, Instagram, TikTok, podcasts, showreels.',
      price: 149 },
    { id: 'corporate', label: 'Business & corporate',
      blurb: 'Company promos, explainers, training, event and in-store screens, on-hold. Paid media moves it up a tier.',
      price: 350 },
    { id: 'paid', label: 'Digital — paid campaign',
      blurb: 'The above plus paid media online — promoted social, pre-roll, display, paid influencer.',
      price: 450 },
    { id: 'tvshow', label: 'TV show / series',
      blurb: 'Per episode — Israeli broadcast plus catch-up. A whole series or worldwide release is quoted.',
      price: 900 },
    { id: 'film', label: 'Film',
      blurb: 'Feature, short or documentary, festivals and streaming included. Budgets over ₪10m are quoted.',
      price: 1200 },
    { id: 'radio', label: 'Radio',
      blurb: 'Radio advertising in Israel. Covers the sync; the station settles its own ACUM dues.',
      price: 1200 },
    { id: 'tvc', label: 'TV commercial',
      blurb: 'Commercial airtime. Priced per campaign against territory, run length and media weight.',
      quote: true },
  ];

  /** Open a mailto in a new tab, without stranding a blank one.
   *  window.open('mailto:…') can leave an empty tab behind once the mail
   *  client takes the handoff; a detached anchor does not. */
  function openMail(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* How long the licence runs. Six months is the default because most work is a
     campaign, not a monument — and a short default makes the renewal a real
     decision rather than a surprise.

     The listed tier price IS the six-month price. A year is 1.6x rather than
     2x, and the owner's discounts then apply per further year: the second year
     at 75% off (+0.4) and the third at 50% off (+0.8). Change MULT alone to
     reprice; nothing else reads these numbers.  */
  const DURATIONS = [
    { id: '6m',  label: '6 months',  months: 6,  mult: 1.0,  note: '' },
    { id: '12m', label: '12 months', months: 12, mult: 1.6,  note: '' },
    { id: '24m', label: '24 months', months: 24, mult: 2.0,  note: '2nd year 75% off' },
    { id: '36m', label: '36 months', months: 36, mult: 2.8,  note: '3rd year 50% off' },
    { id: 'excl', label: 'Exclusive rights', months: null, mult: null, note: 'by arrangement' },
  ];
  const durById = (id) => DURATIONS.find((d) => d.id === id) || DURATIONS[0];

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const basePrice = (track, tier) => {
    const over = (track.prices || {})[tier.id];
    if (Number.isFinite(over)) return over;
    if (Number.isFinite(track.fee)) return track.fee;   // one flat fee for everything
    return tier.price;
  };
  /** Tier sets what you may do; duration sets how long. Price is the product. */
  const priceFor = (track, tier, durId) => {
    const d = durById(durId || '6m');
    if (d.mult == null) return null;                    // exclusive is quoted
    return Math.round(basePrice(track, tier) * d.mult);
  };

  /** Send the request, then show the reference and how to pay it. */
  async function submitRequest(track, tier, quoteOnly, subject, body, straightToCard, dur) {
    const go = el.querySelector('.lic-go');
    const was = go.innerHTML;   // innerHTML: textContent would drop the card marks
    go.disabled = true; go.textContent = 'Sending…';
    try {
      const r = await fetch('/api/licence/request', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: track.slug, tier: tier.id,
          duration: (dur || durById('6m')).id,
          months: (dur || durById('6m')).months,
          list_price: tier.quote ? null : priceFor(track, tier, (dur || durById('6m')).id),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        if (r.status === 400 && d.error === 'email_required') {
          go.disabled = false; go.innerHTML = was;
          if (window.SnowstarOpenAuth) SnowstarOpenAuth('signup',
            'Create a free account so we can send you the licence and the files.');
          return;
        }
        throw new Error(d.error || 'failed');
      }
      if (straightToCard) return goToCard(d.ref, () => showReceipt(track, tier, quoteOnly, d));
      showReceipt(track, tier, quoteOnly, d);
    } catch {
      // API unreachable — fall back to the email draft rather than lose it
      go.disabled = false; go.innerHTML = was;
      openMail('mailto:licensing@snowstar.company?subject='
        + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
    }
  }

  /** Straight to HYP's hosted card page. On any failure, fall back to the
   *  receipt so the reference is never lost — a buyer who has decided to pay
   *  must not hit a dead end. */
  async function goToCard(ref, onFail) {
    const go = el.querySelector('.lic-go');
    go.disabled = true; go.textContent = 'Opening secure page\u2026';
    try {
      const r = await fetch('/api/hyp/checkout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || 'checkout_failed');
      location.href = j.url;
    } catch {
      go.disabled = false;
      onFail();
    }
  }

  function showReceipt(track, tier, quoteOnly, d) {
    const ex = d.amount_ex_vat != null ? d.amount_ex_vat / 100 : null;
    const vat = ex != null ? Math.round(ex * 0.18) : null;
    const card = el.querySelector('.lic-card');
    card.innerHTML = `
      <button class="lic-close" aria-label="Close">&times;</button>
      <div class="lic-kicker">Request received</div>
      <h3>${esc(track.title)}</h3>
      <div class="lic-artist">${esc(tier.label)}</div>
      <div class="lic-ref">
        <span>Your reference</span>
        <b>${esc(d.ref)}</b>
        <button class="lic-copyref" type="button">Copy</button>
      </div>
      ${quoteOnly || ex == null
        ? `<p class="lic-note">We\u2019ll come back to you with terms and a price. Nothing is charged
             until you\u2019ve seen them in writing and said yes.</p>`
        : `<ul class="lic-sum">
             <li><span>Licence</span><b>${CUR}${ex.toLocaleString()}</b></li>
             <li><span>VAT 18%</span><b>${CUR}${vat.toLocaleString()}</b></li>
             <li class="lic-tot"><span>To pay</span><b>${CUR}${(ex + vat).toLocaleString()}</b></li>
           </ul>
           <p class="lic-note">Pay by card and the clean, un-watermarked file unlocks the moment the
             payment clears \u2014 usually seconds. Prefer bank transfer, Bit or Paybox? Quote
             <b>${esc(d.ref)}</b> so we can match it, and we\u2019ll release it by hand.</p>`}
      <div class="lic-acts">
        ${quoteOnly || ex == null ? '' : '<button class="lic-go lic-card-pay">Pay by card</button>'}
        <button class="lic-share lic-done">Done</button>
      </div>
      <p class="lic-payerr" hidden></p>`;
    card.querySelector('.lic-close').addEventListener('click', close);
    card.querySelector('.lic-done').addEventListener('click', close);
    // Card payment: the server re-derives the price from its own snapshot of the
    // request, so nothing about the amount travels from here — this button only
    // says WHICH request to charge.
    const payBtn = card.querySelector('.lic-card-pay');
    if (payBtn) payBtn.addEventListener('click', async () => {
      const err = card.querySelector('.lic-payerr');
      payBtn.disabled = true; payBtn.textContent = 'Opening secure page\u2026';
      try {
        const r = await fetch('/api/hyp/checkout', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ref: d.ref }),
        });
        const j = await r.json();
        if (!r.ok || !j.url) throw new Error(j.error || 'checkout_failed');
        if (window.mutraTrack) mutraTrack('checkout', track.slug);
        location.href = j.url;                 // hosted card page, PCI stays theirs
      } catch (e) {
        payBtn.disabled = false; payBtn.textContent = 'Pay by card';
        err.hidden = false;
        err.textContent = String(e.message) === 'quote_lane_not_self_serve'
          ? 'This track needs a quote rather than a card payment \u2014 we\u2019ll be in touch.'
          : 'Could not open the payment page. Your reference is saved \u2014 transfer with it, or try again.';
      }
    });

    const cp = card.querySelector('.lic-copyref');
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(d.ref); cp.textContent = 'Copied'; }
      catch { prompt('Your reference:', d.ref); }
      setTimeout(() => { cp.textContent = 'Copy'; }, 1600);
    });
  }

  /* The card markup, kept as a constant because showReceipt() and the payment
     outcome screen both REPLACE it. Without restoring it on every open the
     next click found a card with no .lic-sel, threw, and the modal could not
     be opened again until a reload. */
  const CARD_HTML = `
      <div class="lic-card" role="dialog" aria-modal="true" aria-labelledby="licTitle">
        <button class="lic-close" aria-label="Close">&times;</button>
        <div class="lic-head">
          <img class="lic-cover" alt="">
          <div>
            <div class="lic-kicker">Licence</div>
            <h3 id="licTitle"></h3>
            <div class="lic-artist"></div>
          </div>
        </div>
        <label class="lic-field"><span>Use</span>
          <select class="lic-sel"></select></label>
        <label class="lic-field"><span>For how long</span>
          <select class="lic-dur"></select></label>
        <p class="lic-blurb"></p>
        <div class="lic-priceline">
          <span class="lic-price"></span>
          <span class="lic-per">one-time, per track</span>
        </div>
        <ul class="lic-incl"></ul>
        <div class="lic-acts">
          <button class="lic-go"></button>
          <button class="lic-share" title="Copy a link to this licence">Copy link</button>
        </div>
        <button class="lic-alt" type="button" hidden></button>
        <p class="lic-note"></p>
      </div>`;

  let el = null;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'lic-modal';
    el.hidden = true;
    el.innerHTML = CARD_HTML;
    document.body.appendChild(el);

    el.querySelector('.lic-close').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && !el.hidden) close(); });
    return el;
  }

  let current = null;

  function paint() {
    const track = current;
    if (!track) return;
    const sel = el.querySelector('.lic-sel');
    const durSel = el.querySelector('.lic-dur');
    const tier = TIERS.find((t) => t.id === sel.value) || TIERS[0];
    const dur = durById(durSel.value);
    // exclusivity is never self-serve, whatever the track's lane
    const quoteOnly = tier.quote || track.lane === 'quote' || dur.mult == null;
    const price = priceFor(track, tier, dur.id);

    el.querySelector('.lic-blurb').textContent = dur.mult == null
      ? 'Exclusive use of this track \u2014 nobody else licences it while you hold it. Priced per case.'
      : tier.blurb;
    // The first bullet is a promise, so it has to match the lane. On a
    // quote-lane track we do not yet know we can clear it — saying "cleared"
    // next to "someone else has a say" is the kind of contradiction a licensee
    // is entitled to hold us to.
    const broadcast = ['tvshow', 'film', 'radio', 'tvc'].includes(tier.id);
    el.querySelector('.lic-incl').innerHTML = [
      track.lane === 'quote' ? 'Cleared once the other rights holder agrees'
                             : 'Cleared for commercial use, worldwide',
      // The one thing a term makes people anxious about. Say it before they ask.
      dur.mult == null ? 'Nobody else licences the track while you hold it'
                       : 'Work published in the term stays up afterwards',
      broadcast ? 'Broadcast royalties stay with the broadcaster'
                : 'Your channels whitelisted \u2014 no Content ID claims',
      'Clean, un-watermarked files',
    ].map((t) => `<li>${esc(t)}</li>`).join('');
    el.querySelector('.lic-price').textContent = quoteOnly ? 'On request' : CUR + price.toLocaleString();
    const per = el.querySelector('.lic-per');
    per.hidden = quoteOnly;
    per.textContent = quoteOnly ? ''
      : `${dur.label}${dur.note ? ' \u00b7 ' + dur.note : ''} \u00b7 ex VAT`;
    // Priced tracks lead with PAY. Making the buyer file a request first and
    // find the card button on a second screen was a step too many — the money
    // is the thing they came to do.
    const goBtn = el.querySelector('.lic-go');
    goBtn.innerHTML = quoteOnly
      ? 'Request a quote'
      : 'Pay by Card <span class="lic-cards" aria-hidden="true">'
        + '<i class="cb-visa">VISA</i><i class="cb-mc"></i><i class="cb-amex">AMEX</i></span>';
    const alt = el.querySelector('.lic-alt');
    if (alt) {
      alt.hidden = quoteOnly;
      alt.textContent = 'Pay by transfer or Bit instead';
    }
    // Three different promises, and getting them mixed up matters: a
    // quote-lane track is a rights question, a quote-only tier is a pricing
    // question, and everything else is a purchase.
    // Only says something where there is a wait to explain. On a card purchase
    // the buyer finds out in ten seconds, so the line was pure filler.
    const note = el.querySelector('.lic-note');
    note.textContent = track.lane === 'quote'
      ? 'Another rights holder has a say here, so this one goes through us. We’ll come back with terms.'
      : tier.quote ? 'Tell us where it runs and on what weight, and we’ll come back with a figure.'
      : '';
    note.hidden = !note.textContent;
  }

  function open(track) {
    build();
    el.innerHTML = CARD_HTML;          // undo any receipt/outcome screen
    el.querySelector('.lic-close').addEventListener('click', close);
    current = track;
    el.querySelector('.lic-cover').src = track.cover || '';
    el.querySelector('#licTitle').textContent = track.title;
    el.querySelector('.lic-artist').textContent = track.artist || '';
    const sel = el.querySelector('.lic-sel');
    sel.innerHTML = TIERS.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    sel.onchange = paint;
    const durSel = el.querySelector('.lic-dur');
    durSel.innerHTML = DURATIONS.map((d) =>
      `<option value="${d.id}">${esc(d.label)}${d.note ? ' \u2014 ' + esc(d.note) : ''}</option>`).join('');
    durSel.value = '6m';                       // short default: renewal is a decision
    durSel.onchange = paint;

    el.querySelector('.lic-go').onclick = () => {
      const tier = TIERS.find((t) => t.id === sel.value) || TIERS[0];
      const dur = durById(durSel.value);
      const quoteOnly = tier.quote || track.lane === 'quote' || dur.mult == null;
      const subject = `Mutra — ${quoteOnly ? 'quote' : 'licence'}: ${track.title} (${tier.label})`;
      const body = `Track: ${track.title} — ${track.artist}\nLicence: ${tier.label}`
        + (quoteOnly ? '' : `\nPrice: ${CUR}${priceFor(track, tier)}`)
        + `\n\nWhere it will run:\nTerritory:\nHow long for:\n\n`
        + `Link: ${location.origin + location.pathname}?license=${encodeURIComponent(track.slug)}\n`;
      // A real request, recorded with a reference the money can travel with.
      // The mailto is kept only as the fallback when the API is unreachable —
      // losing a licence enquiry because a fetch failed is not acceptable.
      submitRequest(track, tier, quoteOnly, subject, body, !quoteOnly, dur);
      if (window.mutraTrack) mutraTrack(quoteOnly ? 'quote' : 'license', track.slug);
    };

    const altBtn = el.querySelector('.lic-alt');
    if (altBtn) altBtn.onclick = () => {
      const tier = TIERS.find((t) => t.id === sel.value) || TIERS[0];
      const dur = durById(durSel.value);
      const signedIn = !!(window.SnowstarAccount && SnowstarAccount.user);
      if (!signedIn) {
        // A transfer needs somewhere to send the files, so it needs an account.
        // Remember the intent, close THIS box first (it used to sit on top of
        // the auth panel), and resume automatically once they are in.
        pending = { slug: track.slug, tier: tier.id, dur: dur.id };
        try { sessionStorage.setItem('mutraPendingLicence', JSON.stringify(pending)); } catch {}
        close();
        if (window.SnowstarOpenAuth) {
          SnowstarOpenAuth('signup', 'Create a free account and we\u2019ll send the transfer details and the files.');
        }
        return;
      }
      submitRequest(track, tier, false, '', '', false, dur);
    };

    el.querySelector('.lic-share').onclick = async () => {
      const url = `${location.origin}${location.pathname}?license=${encodeURIComponent(track.slug)}`;
      const btn = el.querySelector('.lic-share');
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Copied'; }
      catch { prompt('Copy this link:', url); }
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
    };

    paint();
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => sel.focus(), 50);
    if (window.mutraTrack) mutraTrack('license-open', track.slug, { once: true });
  }

  function close() {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
    current = null;
  }

  /* Coming back from HYP. The Worker has already verified the payment against
     HYP's own servers and granted the licence by the time this runs — this is
     purely telling the human what happened, and cleaning the query string so a
     refresh doesn't re-announce it. */
  function showPaymentOutcome() {
    const q = new URLSearchParams(location.search);
    const state = q.get('pay');
    if (!state) return;
    const ref = q.get('ref') || '';
    const reason = q.get('reason') || '';
    build();
    const card = el.querySelector('.lic-card');
    const ok = state === 'ok';
    const why = {
      declined: 'The card was declined. Nothing has been charged.',
      unverified: 'We could not confirm that payment with HYP, so nothing was released. If your card was charged, send us the reference and we will sort it out today.',
      amount_mismatch: 'The amount did not match the licence. Nothing was released.',
      quote_lane: 'This track needs a quote rather than a card payment.',
      bad_ref: 'That payment reference was not recognised.',
      unknown_ref: 'That payment reference was not recognised.',
    }[reason] || 'The payment did not complete. Nothing has been charged.';
    card.innerHTML = `
      <button class="lic-close" aria-label="Close">&times;</button>
      <div class="lic-kicker">${ok ? 'Payment received' : 'Payment not completed'}</div>
      <h3>${ok ? 'Your licence is live' : 'Nothing was charged'}</h3>
      ${ref ? `<div class="lic-ref"><span>Reference</span><b>${esc(ref)}</b></div>` : ''}
      <p class="lic-note">${ok
        ? 'The clean, un-watermarked file is now yours to download \u2014 look for the download arrow on the track, or in Account \u203a Downloads. A confirmation is on its way by email.'
        : esc(why)}</p>
      <div class="lic-acts"><button class="lic-go lic-done">${ok ? 'Download it' : 'Close'}</button></div>`;
    card.querySelector('.lic-close').addEventListener('click', close);
    card.querySelector('.lic-done').addEventListener('click', close);
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    // strip the params so a reload does not repeat the message
    q.delete('pay'); q.delete('ref'); q.delete('reason');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }
  addEventListener('DOMContentLoaded', showPaymentOutcome);
  if (document.readyState !== 'loading') showPaymentOutcome();

  /* Someone chose "pay by transfer" while signed out. They were sent to sign up;
     the moment an account exists, pick the request back up where they left it. */
  let pending = null;
  function resumePending() {
    if (!(window.SnowstarAccount && SnowstarAccount.user)) return;
    let p = pending;
    if (!p) { try { p = JSON.parse(sessionStorage.getItem('mutraPendingLicence') || 'null'); } catch {} }
    if (!p) return;
    pending = null;
    try { sessionStorage.removeItem('mutraPendingLicence'); } catch {}
    const track = window.mutraPlayer && mutraPlayer.find(p.slug);
    const tier = TIERS.find((t) => t.id === p.tier);
    if (!track || !tier) return;
    open(track);
    submitRequest(track, tier, false, '', '', false, durById(p.dur));
  }
  if (window.MutraMembers && MutraMembers.onChange) MutraMembers.onChange(resumePending);
  addEventListener('DOMContentLoaded', resumePending);

  window.mutraLicense = { open, close, TIERS, priceFor };
})();
