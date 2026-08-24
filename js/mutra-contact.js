/* ═══════════ Mutra — Get in touch ═══════════

   Replaces a mailto. The point is not to collect messages — a mailto did that —
   it is to make each one ANSWERABLE by one person.

   Screen 1 asks what brings you here, NOT "user or artist". None of the eight
   libraries surveyed leads with identity, and for good reason: a filmmaker who
   also writes music cannot tell you which one they are today. Ask about the
   job and identity falls out of the answer — only a musician picks "I make
   music".

   Six of the eleven endings never send anything. They hand off to machinery
   that already exists — the licence funnel, the artist portal, the account
   panel — because the fastest reply is the one nobody has to write. What is
   left is the five that genuinely need a human.

   FIELDS: email and message. That is the whole default form.

   Phone, country and address were asked for and are deliberately not here:
     - a visible phone field cost 48% of conversions in a two-month A/B test,
       and 15% of people say they would never give one; its presence is the
       cost, not its required-ness, so it hides behind a link
     - GOV.UK has DEPRECATED its own country picker and ships no replacement;
       country matters only for VAT, which is already on the payment record
     - an address has no use in a support reply
   One-line switches at the top if you want them back. */
(function () {
  /* Flip either to true to show the field the research advises against. */
  const SHOW_PHONE_FIELD = false;   // false = hidden behind "Prefer a call?"
  const SHOW_COUNTRY = false;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Twitch', 'Other'];

  let el = null, branch = null, openedAt = 0;

  const SHELL = `
    <div class="lic-card lic-wiz ct-card" role="dialog" aria-modal="true" aria-labelledby="ctTitle">
      <button class="lic-close" aria-label="Close">&times;</button>
      <div class="ct-head">
        <div class="lic-kicker">Mutra</div>
        <h3 id="ctTitle">Get in touch</h3>
      </div>
      <div class="lic-crumbs" hidden></div>
      <div class="lic-body"></div>
    </div>`;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'lic-modal ct-modal';
    el.hidden = true;
    el.innerHTML = SHELL;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && !el.hidden) close(); });
    return el;
  }

  const body = () => el.querySelector('.lic-body');

  function cards(list) {
    return `<div class="lic-cards2">${list.map((c) => `
      <button type="button" class="lic-opt" data-v="${esc(c.v)}">
        <b>${esc(c.t)}</b><span>${esc(c.d)}</span>
      </button>`).join('')}</div>`;
  }
  const onCards = (fn) => body().querySelectorAll('.lic-opt')
    .forEach((b) => b.addEventListener('click', () => fn(b.dataset.v)));

  function crumb(text, back) {
    const c = el.querySelector('.lic-crumbs');
    c.hidden = !text;
    c.innerHTML = text ? `<button type="button" class="lic-crumb">${esc(text)}</button>` : '';
    if (text) c.querySelector('.lic-crumb').addEventListener('click', back);
  }

  /* ── screen 1 ───────────────────────────────────────────────────────────── */

  function screen1() {
    crumb('', null);
    body().innerHTML = `
      <h4 class="lic-q">What brings you here?</h4>
      ${cards([
        { v: 'a', t: 'I want to use a track', d: 'Pricing, licences, whether your use is covered.' },
        { v: 'b', t: 'I already licensed a track', d: 'Invoices, claims on your video, downloads, renewals.' },
        { v: 'c', t: 'I make music', d: 'Submitting to the catalogue, or you’re already in it.' },
        { v: 'd', t: 'Something else', d: 'Rights, press, partnerships, anything not above.' },
      ])}
      <p class="lic-foot">Want music written from scratch rather than licensed? That’s
        <a href="/" class="lic-textlink">Snowstar</a>.</p>`;
    onCards(screen2);
  }

  /* ── screen 2, per branch ───────────────────────────────────────────────── */

  const BRANCH2 = {
    a: { q: 'What do you need?', opts: [
      { v: 'a1', t: 'A price for one track', d: 'Instant — pick the track and you’ll see the number.' },
      { v: 'a2', t: 'A bigger or unusual project', d: 'Broadcast, a campaign, several tracks, exclusivity.' },
      { v: 'a3', t: 'A question before I buy', d: 'Anything about what a licence does and doesn’t cover.' },
    ] },
    b: { q: 'What’s happened?', opts: [
      { v: 'b1', t: 'A claim on my video', d: 'Something matched the music and held up your upload.' },
      { v: 'b2', t: 'My licence, invoice or download', d: 'Finding what you already bought.' },
      { v: 'b3', t: 'Renew or change a licence', d: 'Longer term, new territory, a different cut.' },
    ] },
    c: { q: 'Which is it?', opts: [
      { v: 'c1', t: 'I want my music in the catalogue', d: 'Upload tracks and file a rights declaration.' },
      { v: 'c2', t: 'I’m already in the catalogue', d: 'Your uploads, splits, credits, payments.' },
    ] },
    d: { q: 'What’s it about?', opts: [
      { v: 'd1', t: 'I own rights in a track you licence', d: 'A co-owner, a label, a publisher.' },
      { v: 'd2', t: 'Press or partnership', d: '' },
      { v: 'd3', t: 'Anything else', d: '' },
    ] },
  };

  function screen2(b) {
    const cfg = BRANCH2[b];
    crumb('← Back', screen1);
    body().innerHTML = `<h4 class="lic-q">${esc(cfg.q)}</h4>${cards(cfg.opts)}`;
    onCards((leaf) => screen3(leaf, b));
  }

  /* ── the endings ────────────────────────────────────────────────────────── */

  /** Six of these send nothing. Handing off beats collecting a message that
   *  only ever gets answered with a link. */
  function screen3(leaf, b) {
    crumb('← Back', () => screen2(b));
    const signedIn = !!(window.SnowstarAccount && SnowstarAccount.user);

    if (leaf === 'a1') return handoff({
      title: 'Prices are instant',
      body: 'Pick a track and the price is on screen — no waiting on us. Every track has a License button on its row.',
      cta: 'Browse the catalogue', act: () => { close(); scrollTo({ top: 0, behavior: 'smooth' }); },
    });

    if (leaf === 'c1') return handoff({
      title: 'Upload your tracks',
      body: 'Submissions go through the artist portal — it takes the audio and the rights declaration '
        + 'in one go, which is what lets a track be licensed rather than just listened to. '
        + 'We review in batches, roughly monthly.',
      cta: 'Open the artist portal', act: () => { location.href = 'artists.html'; },
    });

    if (leaf === 'c2') return handoff({
      title: 'It’s in your artist panel',
      body: 'Your uploads, rights declarations, credits and payments all live in your account.',
      cta: signedIn ? 'Open my account' : 'Sign in',
      act: () => {
        close();
        if (signedIn) document.querySelector('#authAccount')?.click();
        else if (window.SnowstarOpenAuth) SnowstarOpenAuth('login', 'Sign in to see your artist panel.');
      },
      alt: 'Something else? Send a message', altAct: () => form('c2-artist', {}),
    });

    if (leaf === 'b2') return handoff({
      title: 'It’s in your account',
      body: 'Licences, invoices and downloads are all under My licences.',
      cta: signedIn ? 'Open my account' : 'Sign in',
      act: () => {
        close();
        if (signedIn) document.querySelector('#authAccount')?.click();
        else if (window.SnowstarOpenAuth) SnowstarOpenAuth('login', 'Sign in to see your licences.');
      },
      alt: 'Can’t see it? Send a message', altAct: () => form('b2-account', { orderRef: true }),
    });

    if (leaf === 'd2') return handoff({
      title: 'Press and partnerships',
      body: 'hello@snowstar.company\n\nMutra — by Snowstar.Company, Tel Aviv',
      plain: true,
    });

    if (leaf === 'a2') return form('a2-quote', { brief: true });
    if (leaf === 'a3') return form('a3-question', { deflect: true });
    if (leaf === 'b1') return form('b1-claim', { claim: true });
    if (leaf === 'b3') return form('b3-renew', { orderRef: true });
    if (leaf === 'd1') return form('d1-rights', { track: true });
    return form('d3-other', {});
  }

  function handoff(o) {
    body().innerHTML = `
      <h4 class="lic-q">${esc(o.title)}</h4>
      <p class="ct-body">${esc(o.body)}</p>
      ${o.plain ? '' : `<button type="button" class="lic-go lic-next">${esc(o.cta)}</button>`}
      ${o.alt ? `<button type="button" class="lic-textlink ct-alt">${esc(o.alt)}</button>` : ''}`;
    const go = body().querySelector('.lic-next');
    if (go) go.addEventListener('click', o.act);
    const alt = body().querySelector('.ct-alt');
    if (alt) alt.addEventListener('click', o.altAct);
  }

  /* ── the form ───────────────────────────────────────────────────────────── */

  function form(id, opt) {
    branch = id;
    body().innerHTML = `
      ${opt.deflect ? `<div class="ct-deflect">
        <a href="terms.html" target="_blank" rel="noopener">What each licence covers</a>
        <a href="terms.html#content-id" target="_blank" rel="noopener">Cleared on YouTube</a>
        <a href="refund.html" target="_blank" rel="noopener">Refunds</a>
      </div>` : ''}
      ${opt.claim ? `<p class="ct-body">Send the video and we’ll clear it. Claims jump the queue.</p>
        <label class="lic-field"><span>Video URL</span>
          <input class="ct-video" type="url" placeholder="https://…" required></label>
        <label class="lic-field"><span>Platform</span>
          <select class="ct-platform">${PLATFORMS.map((p) => `<option>${p}</option>`).join('')}</select></label>` : ''}
      ${opt.track ? `<label class="lic-field"><span>Which track</span>
          <input class="ct-track" type="text" maxlength="140" placeholder="Track title" required></label>` : ''}
      ${opt.orderRef ? `<label class="lic-field"><span>Reference <i>optional</i></span>
          <input class="ct-ref" type="text" maxlength="40" placeholder="MUTRA-…"></label>` : ''}

      <label class="lic-field"><span>Email</span>
        <input class="ct-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      <label class="lic-field"><span>Name <i>optional</i></span>
        <input class="ct-name" type="text" autocomplete="name" maxlength="120"></label>
      ${SHOW_COUNTRY ? `<label class="lic-field"><span>Country <i>optional</i></span>
        <input class="ct-country" type="text" autocomplete="country-name" maxlength="60"></label>` : ''}
      <label class="lic-field"><span>${opt.brief
        ? 'The project — where it runs, territory, how long, budget'
        : 'Message'}</span>
        <textarea class="ct-msg" rows="5" required placeholder="${opt.brief
          ? 'A paid campaign in Israel, six weeks from March, social and pre-roll…'
          : 'Tell us what you need'}"></textarea></label>

      ${SHOW_PHONE_FIELD
        ? `<label class="lic-field"><span>Phone <i>optional</i></span>
             <input class="ct-phone" type="tel" autocomplete="tel" maxlength="40"></label>`
        : `<button type="button" class="lic-textlink ct-addphone">Prefer a call? Add a number</button>
           <label class="lic-field ct-phonefld" hidden><span>Phone</span>
             <input class="ct-phone" type="tel" autocomplete="tel" maxlength="40"></label>`}

      <!-- a bot fills this; a person never sees it -->
      <input class="ct-hp" tabindex="-1" autocomplete="off" aria-hidden="true"
             style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <p class="lic-err" hidden></p>
      <p class="ct-priv">We use your email to reply and nothing else. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>
      <div class="lic-acts"><button type="button" class="lic-go ct-send">Send</button></div>`;

    const add = body().querySelector('.ct-addphone');
    if (add) add.addEventListener('click', () => {
      body().querySelector('.ct-phonefld').hidden = false;
      add.remove();
      body().querySelector('.ct-phone').focus();
    });
    body().querySelector('.ct-send').addEventListener('click', send);
    body().querySelector('.ct-email').focus();
  }

  async function send() {
    const q = (s) => body().querySelector(s);
    const err = q('.lic-err');
    const btn = q('.ct-send');
    err.hidden = true;

    const email = q('.ct-email').value.trim();
    const message = q('.ct-msg').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      err.hidden = false; err.textContent = 'We need an email to reply to.'; q('.ct-email').focus(); return;
    }
    if (message.length < 10) {
      err.hidden = false; err.textContent = 'A line or two more, so we can actually help.'; q('.ct-msg').focus(); return;
    }
    const video = q('.ct-video');
    if (video && !video.value.trim()) {
      err.hidden = false; err.textContent = 'The video link — we can’t clear a claim without it.'; video.focus(); return;
    }
    const track = q('.ct-track');
    if (track && !track.value.trim()) {
      err.hidden = false; err.textContent = 'Which track? The claim doesn’t mean anything without it.'; track.focus(); return;
    }

    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/contact', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branch, email, message,
          name: q('.ct-name') ? q('.ct-name').value.trim() : '',
          phone: q('.ct-phone') ? q('.ct-phone').value.trim() : '',
          country: q('.ct-country') ? q('.ct-country').value.trim() : '',
          order_ref: q('.ct-ref') ? q('.ct-ref').value.trim() : '',
          video_url: video ? video.value.trim() : '',
          platform: q('.ct-platform') ? q('.ct-platform').value : '',
          track: track ? track.value.trim() : '',
          hp: q('.ct-hp').value,
          t: openedAt,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
      done(d.ref);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Send';
      err.hidden = false;
      err.textContent = String(e.message) === 'rate_limited'
        ? 'That’s a few messages in a short time — give it an hour, or email hello@snowstar.company.'
        : 'That didn’t send. Email hello@snowstar.company and we’ll pick it up there.';
    }
  }

  function done(ref) {
    el.querySelector('.lic-crumbs').hidden = true;
    const urgent = branch === 'b1-claim' || branch === 'd1-rights';
    body().innerHTML = `
      <h4 class="lic-q">Sent</h4>
      <div class="lic-ref"><span>Reference</span><b>${esc(ref)}</b></div>
      <p class="ct-body">${urgent
        ? 'This one jumps the queue — you’ll hear back today, tomorrow at the latest.'
        : 'A real person reads these. Reply within two business days, usually the same day.'}</p>
      <div class="lic-acts"><button type="button" class="lic-go ct-done">Close</button></div>`;
    body().querySelector('.ct-done').addEventListener('click', close);
  }

  /* ── open / close ───────────────────────────────────────────────────────── */

  function open() {
    build();
    branch = null;
    openedAt = Date.now();
    screen1();
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    el.querySelector('.lic-close').addEventListener('click', close);
    if (window.mutraTrack) mutraTrack('contact-open', 'menu', { once: true });
  }

  function close() {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
  }

  /* Every "Get in touch" on the page, however it is marked up. */
  addEventListener('click', (e) => {
    const a = e.target.closest('[data-contact], a[href^="mailto:hello@snowstar.company"]');
    if (!a) return;
    e.preventDefault();
    open();
  });

  window.mutraContact = { open, close };
})();
