/* ═══════════ Mutra — Artist lightbox (mutra.html only) ═══════════
   Opens the exact same content as artist.html (via js/mutra-artist.js)
   in an in-page overlay instead of a real navigation — fast, no full
   reload — while still pushing a real, independently-loadable URL so
   the moment is shareable and back/forward both work correctly.

   The trick: history.pushState only changes what THIS tab's address
   bar shows; it never touches what that URL actually resolves to. So
   a hard refresh, a pasted link, or a shared URL always lands on the
   real artist.html — this overlay is purely a same-session shortcut
   to the identical content, not a replacement for it.

   Every close path (✕ button, backdrop click, Escape, the browser's
   own back button) funnels through history.back() — popstate is the
   ONE place that actually tears the overlay down, so there's a single
   source of truth for "closed" instead of racing UI-close against
   browser-back. */
(function () {
  if (typeof MUTRA_SPOTLIGHTS === 'undefined' || typeof MutraArtist === 'undefined') return;

  const DEFAULT_TITLE = document.title;
  let lb, panel, mount;
  let openId = null;

  function build() {
    if (lb) return;
    lb = document.createElement('div');
    lb.className = 'artist-lb';
    lb.hidden = true;
    lb.innerHTML = `<div class="artist-lb-backdrop"></div><div class="artist-lb-panel"><div class="artist-lb-mount"></div></div>`;
    document.body.appendChild(lb);
    panel = lb.querySelector('.artist-lb-panel');
    mount = lb.querySelector('.artist-lb-mount');
    lb.querySelector('.artist-lb-backdrop').addEventListener('click', requestClose);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) requestClose(); });
  }

  /** Renders `id`'s content into the overlay and shows it — used both
   * for the initial open and for popstate (forward/refresh-into-state). */
  function paint(id) {
    const spot = MUTRA_SPOTLIGHTS.find(s => s.id === id);
    if (!spot) return false;
    build();
    openId = id;
    document.title = spot.artist + ' — ' + spot.album + ' | Mutra by Snowstar';
    MutraArtist.render(mount, spot, { onClose: requestClose });
    document.body.classList.add('artist-lb-active');
    lb.hidden = false;
    panel.scrollTop = 0;
    void lb.offsetWidth; // force layout so the open transition actually runs
    requestAnimationFrame(() => lb.classList.add('artist-lb-open'));
    return true;
  }

  function dismiss() {
    if (!lb) return;
    openId = null;
    lb.classList.remove('artist-lb-open');
    document.body.classList.remove('artist-lb-active');
    setTimeout(() => { if (!openId) lb.hidden = true; }, 320);
    document.title = DEFAULT_TITLE;
  }

  function requestClose() {
    if (openId) history.back();
  }

  /** The only entry point other scripts call — clicking an artist name. */
  function open(id) {
    if (openId === id || !paint(id)) return;
    if (window.mutraPauseMainPlayer) window.mutraPauseMainPlayer();
    history.pushState({ mutraArtist: id }, '', 'artist.html?a=' + encodeURIComponent(id));
    if (window.mutraTrack) mutraTrack('view', 'artist:' + id, { once: true });
  }

  addEventListener('popstate', (e) => {
    const id = e.state && e.state.mutraArtist;
    if (id) paint(id); else dismiss();
  });

  window.mutraOpenArtist = open;
})();
