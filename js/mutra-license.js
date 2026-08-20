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
      blurb: 'Your own channels and organic social. Website, YouTube, Instagram, TikTok, podcasts, showreels. Unlimited views, worldwide, no end date.',
      price: 149 },
    { id: 'corporate', label: 'Business & corporate',
      blurb: 'Company promos, explainers, internal training, trade-show and conference screens, in-store and on-hold. Worldwide, no end date. Put paid media behind it and it moves up a tier.',
      price: 350 },
    { id: 'paid', label: 'Digital — paid campaign',
      blurb: 'Everything above, plus paid media online: promoted social, pre-roll, display, paid influencer. Worldwide, one year from first run.',
      price: 450 },
    { id: 'tvshow', label: 'TV show / series',
      blurb: 'Background or featured use inside a programme — per episode, Israeli broadcast plus catch-up streaming. A whole series or a worldwide release is quoted.',
      price: 900 },
    { id: 'film', label: 'Film',
      blurb: 'Feature, short or documentary — for the lifetime of the production, including festivals and streaming release. Covers budgets up to about ₪10m; above that it is quoted.',
      price: 1200 },
    { id: 'radio', label: 'Radio',
      blurb: 'Radio advertising in Israel, one six-month season, renewable at 60%. The station pays its own ACUM and Federation dues on its own account — this covers the sync, not the airplay.',
      price: 1200 },
    { id: 'tvc', label: 'TV commercial',
      blurb: 'Commercial airtime. There is no fixed rate for advertising in this market — ACUM states so itself — so it is priced per campaign against territory, length of run and media weight.',
      quote: true },
  ];

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const priceFor = (track, tier) => {
    const over = (track.prices || {})[tier.id];
    if (Number.isFinite(over)) return over;
    if (Number.isFinite(track.fee)) return track.fee;   // one flat fee for everything
    return tier.price;
  };

  let el = null;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'lic-modal';
    el.hidden = true;
    el.innerHTML = `
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
        <label class="lic-field"><span>What are you using it for?</span>
          <select class="lic-sel"></select></label>
        <p class="lic-blurb"></p>
        <div class="lic-priceline">
          <span class="lic-price"></span>
          <span class="lic-per">one-time, per track</span>
        </div>
        <ul class="lic-incl">
          <li>Cleared for commercial use — no recurring fee for that use</li>
          <li>Covers the sync. Where a track is society-registered, the
              broadcaster settles ACUM and Federation dues on its own account
              \u2014 never billed to you</li>
          <li>We whitelist your channels so an automated claim never lands</li>
        </ul>
        <div class="lic-acts">
          <button class="lic-go"></button>
          <button class="lic-share" title="Copy a link to this licence">Copy link</button>
        </div>
        <p class="lic-note"></p>
      </div>`;
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
    const tier = TIERS.find((t) => t.id === sel.value) || TIERS[0];
    const quoteOnly = tier.quote || track.lane === 'quote';
    const price = priceFor(track, tier);

    el.querySelector('.lic-blurb').textContent = tier.blurb;
    el.querySelector('.lic-price').textContent = quoteOnly ? 'On request' : CUR + price.toLocaleString();
    const per = el.querySelector('.lic-per');
    per.hidden = quoteOnly;
    per.textContent = quoteOnly ? '' :
      `one-time, per track \u00b7 \u2248$${Math.round(price / USD_RATE).toLocaleString()} \u00b7 ${VAT_NOTE}`;
    el.querySelector('.lic-go').textContent = quoteOnly ? 'Request a quote' : 'Request this licence';
    el.querySelector('.lic-note').textContent = track.lane === 'quote'
      ? 'Someone else has a say in how this track is used commercially, so every licence goes through us first. We’ll come back to you with terms.'
      : 'We’ll confirm by email and send the licence and the files.';
  }

  function open(track) {
    build();
    current = track;
    el.querySelector('.lic-cover').src = track.cover || '';
    el.querySelector('#licTitle').textContent = track.title;
    el.querySelector('.lic-artist').textContent = track.artist || '';
    const sel = el.querySelector('.lic-sel');
    sel.innerHTML = TIERS.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    sel.onchange = paint;

    el.querySelector('.lic-go').onclick = () => {
      const tier = TIERS.find((t) => t.id === sel.value) || TIERS[0];
      const quoteOnly = tier.quote || track.lane === 'quote';
      const subject = `Mutra — ${quoteOnly ? 'quote' : 'licence'}: ${track.title} (${tier.label})`;
      const body = `Track: ${track.title} — ${track.artist}\nLicence: ${tier.label}`
        + (quoteOnly ? '' : `\nPrice: ${CUR}${priceFor(track, tier)}`)
        + `\n\nWhere it will run:\nTerritory:\nHow long for:\n\n`
        + `Link: ${location.origin + location.pathname}?license=${encodeURIComponent(track.slug)}\n`;
      location.href = 'mailto:licensing@snowstar.company?subject='
        + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      if (window.mutraTrack) mutraTrack(quoteOnly ? 'quote' : 'license', track.slug);
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

  window.mutraLicense = { open, close, TIERS, priceFor };
})();
