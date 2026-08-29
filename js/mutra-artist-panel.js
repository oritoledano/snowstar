/* ═══════════ Mutra — artist profile, for every artist ═══════════

   There was already an artist page, but it only ever worked for one artist:
   it read MUTRA_SPOTLIGHTS, which holds exactly the KAYMA record. Every other
   name in the catalogue was plain text you could not click.

   This opens for ANY name. The roster comes from managed_artists — the same
   table the rights layer already mints a row in whenever a track credits
   somebody — and the tracks come from the catalogue the page has already
   loaded, so opening a profile costs one cached fetch and no round trip per
   artist.

   It is a lightbox rather than a page because the catalogue is the thing you
   came for: clicking a name to find out who they are should not throw away
   your filters, your scroll position, or the track you are playing. Escape and
   the backdrop close it, and the track keeps playing throughout.

   Social links are read, not guessed. Spotify and Apple both need a developer
   credential to query, and inventing a profile URL from a name is how you send
   a visitor to a stranger — so the panel shows the links stored on the artist
   record and offers a search link where there are none. */
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const norm = (s) => String(s || '').trim().toLowerCase();

  let roster = null;          // name -> record, lowercased key
  let rosterPromise = null;
  let lb = null, openName = null;

  /** The roster is small (a handful of names across the whole catalogue) and
   *  changes rarely, so it is fetched once and kept. */
  function loadRoster() {
    if (roster) return Promise.resolve(roster);
    if (rosterPromise) return rosterPromise;
    rosterPromise = fetch('/api/artistreg', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { artists: [] }))
      .then((d) => {
        roster = {};
        (d.artists || []).forEach((a) => { roster[norm(a.name)] = a; });
        return roster;
      })
      .catch(() => (roster = {}));
    return rosterPromise;
  }

  /** Every track that credits this name. The artist field is free text and
   *  routinely reads "KAYMA, Omri Smadar", so a substring match on the whole
   *  field would put every collaborator's tracks on everyone's page — split
   *  and compare whole names. */
  function tracksBy(name) {
    const want = norm(name);
    const all = (window.mutraCatalog && mutraCatalog.all()) || [];
    return all.filter((t) => String(t.artist || '').split(',')
      .some((n) => norm(n) === want));
  }

  /** Albums, where the catalogue knows of any. Most artists here have none, so
   *  the section is omitted rather than shown empty. */
  function albumsOf(name) {
    const spots = window.mutraSpotlightMeta && norm(window.mutraSpotlightMeta.artist) === norm(name)
      ? [window.mutraSpotlightMeta] : [];
    return spots.filter((s) => s.album);
  }

  function socialHtml(rec, name) {
    let links = [];
    try { links = JSON.parse(rec && rec.links || '[]'); } catch { links = []; }
    if (Array.isArray(links) && links.length) {
      return `<div class="apx-social">${links.slice(0, 8).map((l) =>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.platform)}</a>`
      ).join('')}</div>`;
    }
    // No stored links. A guessed Spotify URL would be a stranger's page, so
    // offer a search instead — honest, and still one click.
    const q = encodeURIComponent(name);
    return `<div class="apx-social apx-search">
      <a href="https://open.spotify.com/search/${q}" target="_blank" rel="noopener noreferrer nofollow">Spotify</a>
      <a href="https://music.apple.com/search?term=${q}" target="_blank" rel="noopener noreferrer nofollow">Apple Music</a>
      <span class="apx-hint">no links on file</span>
    </div>`;
  }

  function build() {
    if (lb) return;
    lb = document.createElement('div');
    lb.className = 'apx-lb';
    lb.hidden = true;
    lb.innerHTML = '<div class="apx-back"></div><div class="apx-panel" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(lb);
    lb.querySelector('.apx-back').addEventListener('click', close);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && openName) close(); });
  }

  /* The owner may edit anyone; an artist may edit themselves. Cosmetic only —
     the server re-checks on save, so a wrong answer here shows a link that
     leads to a form that refuses, never to an edit that lands. */
  function canEdit(rec) {
    const me = window.SnowstarAccount && SnowstarAccount.user;
    if (!me) return false;
    return !!(me.admin || (rec && rec.member && rec.claimed_user_id === me.id));
  }

  function paint(name, rec) {
    const panel = lb.querySelector('.apx-panel');
    const tracks = tracksBy(name);
    const albums = albumsOf(name);
    const cover = (tracks[0] && tracks[0].cover) || '';
    const avatar = (rec && rec.avatar) || cover;
    const bio = (rec && rec.bio) || '';

    panel.innerHTML = `
      <button class="apx-close" type="button" aria-label="Close">&times;</button>
      <div class="apx-hero">
        ${avatar ? `<img class="apx-avatar" src="${esc(avatar)}" alt="">` : '<div class="apx-avatar apx-blank"></div>'}
        <div class="apx-id">
          <div class="apx-kicker">Artist</div>
          <h2 class="apx-name">${esc(name)}</h2>
          <div class="apx-count">${tracks.length} track${tracks.length === 1 ? '' : 's'} on Mutra</div>
          ${socialHtml(rec, name)}
        </div>
      </div>
      ${bio ? `<p class="apx-bio">${esc(bio)}</p>` : ''}
      ${albums.length ? `
        <h3 class="apx-h">Albums</h3>
        <div class="apx-albums">${albums.map((a) =>
          `<button type="button" class="apx-album" data-album="${esc(a.id)}">${esc(a.album)}</button>`).join('')}</div>` : ''}
      <h3 class="apx-h">Tracks</h3>
      <div class="apx-tracks">${tracks.length ? tracks.map((t) => `
        <div class="apx-trk" data-slug="${esc(t.slug)}">
          <button type="button" class="apx-play" aria-label="Play ${esc(t.title)}">▶</button>
          <img class="apx-cover" src="${esc(t.cover || '')}" alt="" loading="lazy">
          <span class="apx-title">${esc(t.title)}</span>
          <span class="apx-meta">${t.bpm ? t.bpm + ' BPM' : ''}</span>
          <button type="button" class="apx-lic">License</button>
        </div>`).join('')
        : '<p class="apx-empty">Nothing in the catalogue under this name yet.</p>'}</div>
      <div class="apx-foot">
        <a class="apx-full" href="artist.html?name=${encodeURIComponent(name)}">Open full page →</a>
        ${canEdit(rec) ? `<a class="apx-full apx-edit"
           href="artist.html?name=${encodeURIComponent(name)}#edit">Edit this profile</a>` : ''}
      </div>`;

    panel.querySelector('.apx-close').addEventListener('click', close);

    panel.querySelectorAll('.apx-trk').forEach((row) => {
      const slug = row.dataset.slug;
      const t = tracks.find((x) => x.slug === slug);
      row.querySelector('.apx-play').addEventListener('click', () => {
        // The panel stays open. Auditioning an artist's catalogue means
        // playing several in a row, and closing on every play would make that
        // a chore.
        if (window.mutraPlayer && t) mutraPlayer.play(t);
      });
      row.querySelector('.apx-lic').addEventListener('click', () => {
        close();
        if (window.mutraLicense && t) mutraLicense.open(t);
      });
    });

    panel.querySelectorAll('.apx-album').forEach((b) => {
      b.addEventListener('click', () => {
        close();
        if (window.mutraOpenArtist) mutraOpenArtist(b.dataset.album);
      });
    });
  }

  function open(name) {
    if (!name) return;
    build();
    openName = name;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.querySelector('.apx-panel').innerHTML = '<div class="apx-loading">Loading…</div>';
    loadRoster().then((r) => {
      if (openName !== name) return;      // they closed it, or opened another
      paint(name, r[norm(name)]);
    });
    if (window.mutraTrack) mutraTrack('artist-open', name, { once: true });
  }

  function close() {
    if (!lb) return;
    lb.hidden = true;
    openName = null;
    document.body.style.overflow = '';
  }

  /* One delegated listener rather than a handler per row: the catalogue
     re-renders on every filter keystroke and infinite-scrolls, so per-row
     binding would leak listeners all afternoon. */
  addEventListener('click', (e) => {
    const a = e.target.closest('.artist-link');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    open(a.dataset.artist || a.textContent.trim());
  });

  window.mutraArtistPanel = { open, close };
})();
