/* ═══════════ Mutra — promo strips, inserted at behaviour moments ═════════════
   Three brand banners and the KAYMA custom-licence row, none of them at a fixed
   position. The intent engine (mutra-behavior.js) fires a moment when somebody
   is browsing and hesitating; this file decides which strip that moment earns
   and drops it into the catalogue near where they actually are.

   A brand strip is proof, not decoration: a real commercial from the portfolio,
   and directly beneath it the REAL catalogue row of the track that scored it —
   play, wave, licence and all — built by the catalogue's own row builder so it
   can never drift from the list it sits in. "This exact sound sold a car" is
   the whole pitch, so the sound must be one click away from the claim.

   Rotation: brands first (fresher proof), the custom-licence row last. One
   strip per moment, each shown once per session (sessionStorage), and a
   frustrated visitor gets none of them — somebody who cannot find what they
   want needs help, not an advert.

   Re-insertion: the catalogue rebuilds its rows on every filter and re-render,
   which throws inserted strips away. A MutationObserver puts the current strip
   back — but only while the list is unfiltered, so a search never has a banner
   sitting in its results. */
(function () {
  const tracksEl = document.querySelector('.tracks');
  if (!tracksEl) return;

  const PROMOS = [
    { id: 'mitsubishi', brand: 'MITSUBISHI — ASX', img: 'assets/thumbs/mitsubishi-asx.jpg',
      text: 'Once used by Mitsubishi — license it today, starting at 99₪ for 6 months',
      slug: 'the-rise-and-fall-original-ver' },
    { id: 'fiverr', brand: 'FIVERR — DIRECTOR’S CUT', img: 'assets/thumbs/fiverr-director-s-cut.jpg',
      text: 'Once used by Fiverr — license it today, starting at 99₪ for 6 months',
      slug: 'cyber-tunnel' },
    { id: 'pepsi', brand: 'PEPSI — VIETNAM', img: 'assets/thumbs/pepsi-vietnam.jpg',
      text: 'Once used by Pepsi — license it today, starting at 99₪ for 6 months',
      slug: 'do-it-major' },
    { id: 'custom-license', spotlight: true },
  ];

  let shown;
  try { shown = new Set(JSON.parse(sessionStorage.getItem('mutra_promos') || '[]')); }
  catch { shown = new Set(); }
  const remember = () => { try { sessionStorage.setItem('mutra_promos', JSON.stringify([...shown])); } catch {} };

  const live = [];              // strips currently owed to the page, for re-insertion

  function buildStrip(p) {
    const wrap = document.createElement('div');
    wrap.className = 'promo-strip';
    wrap.innerHTML = `
      <div class="promo-banner">
        <img src="${p.img}" alt="" loading="lazy">
        <div class="promo-copy">
          <span class="promo-kicker">From the Snowstar portfolio</span>
          <b>${p.brand}</b>
          <p>${p.text}</p>
        </div>
      </div>`;
    // The claim, then the sound that earned it — the catalogue's own row, so it
    // plays, seeks, and licenses exactly like every other row on the page.
    const row = window.mutraCatalog && mutraCatalog.row(p.slug);
    if (row) { row.classList.add('promo-track'); wrap.appendChild(row); }
    wrap.querySelector('.promo-banner').addEventListener('click', () => {
      if (window.mutraTrack) mutraTrack('promo_click', p.id);
      // The banner brings up its track, the same move a spotlight cover makes.
      const r = wrap.querySelector('.promo-track');
      if (r) { r.scrollIntoView({ behavior: 'smooth', block: 'center' });
               r.classList.add('promo-flash');
               setTimeout(() => r.classList.remove('promo-flash'), 1600); }
    });
    return wrap;
  }

  /** After the last row whose top is above the middle of the window — a natural
      break near the reader, not the top of a list they have already left. */
  function insertionPoint() {
    const rows = [...tracksEl.querySelectorAll(':scope > .trk')];
    let after = null;
    for (const r of rows) { if (r.getBoundingClientRect().top < innerHeight * 0.55) after = r; else break; }
    return after;
  }

  function place(node) {
    const at = insertionPoint();
    if (at) at.insertAdjacentElement('afterend', node);
    else tracksEl.prepend(node);
  }

  function fire(kind) {
    if (kind === 'frustrated') return;      // help-not-sell; the agent dock is the answer there
    const next = PROMOS.find((p) => !shown.has(p.id));
    if (!next) return;
    shown.add(next.id); remember();

    if (next.spotlight) {
      // The custom-licence row: arm the catalogue's own machinery and let it
      // place and re-place the row it already owns.
      const rows = [...tracksEl.querySelectorAll(':scope > .trk')];
      const at = insertionPoint();
      window.MUTRA_SPOTLIGHT_INSERT_AFTER = at ? rows.indexOf(at) + 1 : 2;
      window.MUTRA_SPOTLIGHT_ARMED = true;
      if (window.mutraTrack) mutraTrack('promo_seen', 'custom-license');
      dispatchEvent(new Event('scroll'));   // nudge appendPage's re-check
      return;
    }
    const node = buildStrip(next);
    live.push(node);
    place(node);
    if (window.mutraTrack) mutraTrack('promo_seen', next.id);
  }

  // The catalogue wipes its rows on re-render; put owed strips back, but never
  // into a filtered list.
  new MutationObserver(() => {
    if (!window.mutraCatalog || mutraCatalog.narrowed()) return;
    for (const n of live) if (!n.isConnected) place(n);
  }).observe(tracksEl, { childList: true });

  (function arm(tries) {
    if (window.mutraBehavior) { mutraBehavior.onMoment(fire); return; }
    if (tries > 0) setTimeout(() => arm(tries - 1), 150);
  })(20);
})();
