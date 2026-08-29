/* ═══════════ The artist page ═════════════════════════════════════════════════
   artist.html used to serve exactly one artist: a hardcoded spotlight id, with
   its copy in a static file. Everybody else the catalogue credits — and every
   artist who signs up from here on — had no page at all.

   This resolves an artist by the name the CATALOGUE credits, because that is
   what a track record carries: "KAYMA", not a uuid. The profile comes from the
   live API, the tracks come from the shipped catalogue, and the two are joined
   on that name.

   Editing is the same form the artist sees on artists.html, opened in place —
   the owner should not have to go somewhere else to fix a bio they are looking
   at. It posts to the same endpoint; the server decides who may.
*/
(function () {
  const mount = document.getElementById('apMount');
  if (!mount) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const safeUrl = (u) => (/^https?:\/\/[^"'<>\s]+$/i.test(String(u || '')) ? String(u) : '');

  const params = new URLSearchParams(location.search);
  const name = (params.get('name') || '').trim();
  if (!name) return;                        // ?a= spotlight pages keep their own path

  /* Tracks credited to this artist. A track's `artist` can list several people
     ("Omri Smadar & KAYMA"), so a substring match on the separated names is
     what actually finds their work — an equality test would hide collaborations
     from both of their pages. */
  function tracksFor(n) {
    const M = typeof MUTRA !== 'undefined' ? MUTRA : null;
    if (!M) return [];
    const want = n.toLowerCase();
    return M.tracks.filter((t) => String(t.artist || '').split(/[,&]/)
      .some((p) => p.trim().toLowerCase() === want));
  }

  let profile = null, canEdit = false;

  async function load() {
    try {
      profile = await fetch('/api/artist/public?name=' + encodeURIComponent(name),
        { credentials: 'same-origin' }).then((r) => r.json());
    } catch { profile = { found: false, name }; }

    // The edit affordance appears for the owner, and for the artist on their
    // own page. Cosmetic only — the server re-checks on every save.
    const me = window.SnowstarAccount && SnowstarAccount.user;
    canEdit = !!(me && (me.admin || (profile.pid && profile.pid === 'u:' + me.id)));
    paint();
  }

  function paint() {
    const tracks = tracksFor(profile.name || name);
    const links = (profile.links || []).map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l) => l.url);

    mount.innerHTML = `
      <div class="ap-head">
        ${profile.avatar ? `<img class="ap-av" src="${esc(profile.avatar)}" alt="">`
                         : '<div class="ap-av ap-av-blank"></div>'}
        <div class="ap-id">
          <h1>${esc(profile.name || name)}</h1>
          <p class="ap-count">${tracks.length} track${tracks.length === 1 ? '' : 's'} in the catalogue</p>
          ${links.length ? `<div class="ap-links">${links.map((l) =>
            `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.platform || 'Link')}</a>`
          ).join('')}</div>` : ''}
        </div>
        ${canEdit ? '<button type="button" class="rv-btn ap-edit">Edit page</button>' : ''}
      </div>

      ${profile.bio ? `<p class="ap-bio">${esc(profile.bio)}</p>`
        : (canEdit ? '<p class="ap-bio ap-empty">No bio yet — press Edit page to add one.</p>' : '')}

      <div class="ap-editor" hidden></div>

      ${tracks.length ? `<div class="ap-tracks">${tracks.map((t) => `
        <a class="ap-trk" href="mutra.html?t=${encodeURIComponent(t.slug)}">
          <img src="${esc(t.cover)}" alt="" loading="lazy">
          <b>${esc(t.title)}</b>
          <span>${t.duration ? fmt(t.duration) : ''}${t.bpm ? ' · ' + t.bpm + ' BPM' : ''}</span>
        </a>`).join('')}</div>`
        : '<p class="ap-empty">No tracks in the catalogue under this name yet.</p>'}`;

    const eb = mount.querySelector('.ap-edit');
    if (eb) eb.onclick = () => openEditor(eb);
  }

  function openEditor(btn) {
    const box = mount.querySelector('.ap-editor');
    if (!box.hidden) { box.hidden = true; btn.textContent = 'Edit page'; return; }
    btn.textContent = 'Close';
    box.hidden = false;
    box.innerHTML = `
      <label class="ap-f"><span>Name</span>
        <input class="ape-name" maxlength="120" value="${esc(profile.name || name)}"></label>
      <label class="ap-f"><span>Bio</span>
        <textarea class="ape-bio" rows="5" maxlength="4000">${esc(profile.bio || '')}</textarea></label>
      <label class="ap-f"><span>Links — one per line</span>
        <textarea class="ape-links" rows="3">${
          (profile.links || []).map((l) => l.url).join('\n')}</textarea></label>
      <div class="ap-row">
        <button type="button" class="rv-btn rv-ok ape-save">Save</button>
        <label class="rv-btn ape-photo-lbl">Change photo
          <input type="file" class="ape-photo" accept="image/jpeg,image/png,image/webp" hidden></label>
        <span class="ape-msg"></span>
      </div>`;

    const msg = box.querySelector('.ape-msg');

    box.querySelector('.ape-photo').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      msg.textContent = 'Uploading…';
      try {
        const r = await fetch('/api/artists/photo?pid=' + encodeURIComponent(profile.pid), {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': f.type }, body: f,
        }).then((x) => x.json());
        if (!r.url) throw new Error(r.error || 'failed');
        profile.avatar = r.url;
        msg.textContent = 'Photo saved.';
        paint();
      } catch { msg.textContent = 'Could not upload that image.'; }
    };

    box.querySelector('.ape-save').onclick = async (e) => {
      e.target.disabled = true;
      msg.textContent = 'Saving…';
      const links = box.querySelector('.ape-links').value.split('\n')
        .map((l) => l.trim()).filter(Boolean)
        .map((url) => ({ platform: platformOf(url), url })).slice(0, 12);
      try {
        const r = await fetch('/api/artists/profiles', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pid: profile.pid,
            name: box.querySelector('.ape-name').value.trim(),
            bio: box.querySelector('.ape-bio').value.trim(),
            links,
          }),
        }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        msg.textContent = 'Saved.';
        await load();
      } catch (err) {
        msg.textContent = 'Could not save: ' + (err.message || err);
        e.target.disabled = false;
      }
    };
  }

  function platformOf(url) {
    const h = (url.match(/^https?:\/\/([^/]+)/i) || [, ''])[1].toLowerCase();
    if (h.includes('spotify')) return 'Spotify';
    if (h.includes('apple')) return 'Apple Music';
    if (h.includes('youtu')) return 'YouTube';
    if (h.includes('soundcloud')) return 'SoundCloud';
    if (h.includes('bandcamp')) return 'Bandcamp';
    if (h.includes('instagram')) return 'Instagram';
    return h.replace(/^www\./, '') || 'Link';
  }

  document.title = name + ' — Mutra by Snowstar';
  load();
  // The edit button depends on who is signed in, which resolves after boot.
  if (window.SnowstarAccount && SnowstarAccount.onChange) SnowstarAccount.onChange(() => load());
})();
