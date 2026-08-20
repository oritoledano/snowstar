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
  const CUR = '₪';

  /** The tiers, cheapest first. `quote` means the tier is negotiated rather
   *  than self-serve — broadcast money is too project-specific to post a
   *  number against, and it is where a rights conflict would actually bite. */
  const TIERS = [
    { id: 'digital', label: 'Digital — web & social',
      blurb: 'Your own channels and organic social. Website, YouTube, Instagram, TikTok, podcasts, showreels, internal use. Unlimited views, worldwide, no end date.',
      price: 290 },
    { id: 'paid', label: 'Digital — paid campaign',
      blurb: 'Everything above, plus paid media online: promoted social, pre-roll, display, paid influencer. Worldwide, one year from first run.',
      price: 900 },
    { id: 'radio', label: 'Radio',
      blurb: 'Radio advertising in Israel, one year. The station pays its own ACUM and Federation dues separately — this covers the sync, not the airplay.',
      price: 1800 },
    { id: 'tvshow', label: 'TV show / series',
      blurb: 'Background or featured use inside a programme, per production. Israeli broadcast plus catch-up streaming.',
      price: 2400 },
    { id: 'film', label: 'Film',
      blurb: 'Feature, short or documentary, in perpetuity, including festivals and streaming release.',
      price: 3200 },
    { id: 'tvc', label: 'TV commercial',
      blurb: 'Commercial airtime. Priced per campaign against territory, length of run and media weight — so this one is always quoted.',
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
          <li>Covers the sync. Public-performance royalties, where a track is
              registered with a society, stay with the broadcaster as normal</li>
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
    el.querySelector('.lic-per').hidden = quoteOnly;
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
