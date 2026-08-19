/* ═══════════ Mutra — Artist Spotlight row data ═══════════
   Data-driven on purpose: this is the first of what should become a
   reusable pattern (other artists, albums, or curated playlists), so
   nothing about the rendering code below should ever need to know it's
   "Kayma" specifically — it only ever reads this shape.

   The vinyl itself is a shared brand asset (Mutra wordmark on a record,
   see MUTRA_SPOTLIGHT_VINYL below) — a Mutra-branded preview affordance,
   not a per-song design, so every track in every row uses it. Two color
   variants (mutra-vinyl-white.webp, mutra-vinyl-black.webp) are swapped
   by CSS content:url() via [data-theme] — see spotlight.css — for
   contrast: white vinyl on the dark skin, black vinyl on the light skin.
   The URL below is just the initial <img src>, which CSS always
   overrides visually; kept in sync with the CSS default (white) so the
   browser isn't fetching an asset it'll never actually show.

   snippetUrl/snippetStart are PLACEHOLDERS right now (a short generated
   tone, same file reused for all 8 tracks) — these songs haven't been
   uploaded to Kayma's artist account yet. Once they are, swap snippetUrl
   per track to a real ~15-20s highlight and this needs no other change.

   Every card in a row shares one artist — mutra-spotlight.js renders
   spot.artist as a subtitle under every track title, so it only needs to
   live here once rather than repeated per track.

   The first entry, slug 'album', is the record itself rather than a
   song — same card shape as every track (cover + shared vinyl + a
   snippetUrl, here just a short album-level teaser reusing the
   placeholder tone), so it needs no special-casing in the renderer. */
const MUTRA_SPOTLIGHT_VINYL = 'https://cdn.snowstar.company/mutra/spotlight/mutra-vinyl-white.webp?v=3';

const MUTRA_SPOTLIGHTS = [
  {
    id: 'kayma-nto',
    kicker: 'Custom License',
    artist: 'KAYMA',
    album: 'New Trying Outs',
    cdn: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/',
    tracks: [
      { slug: 'album',            title: 'New Trying Outs' },
      { slug: 'bad-blood',        title: 'Bad Blood' },
      { slug: 'bunny',            title: 'Bunny' },
      { slug: 'onsitelover',      title: 'Onsitelover' },
      { slug: 'learn-to-say-no',  title: 'Learn To Say No' },
      { slug: 'woaw',             title: 'WOAW' },
      { slug: 'disco',            title: 'Disco' },
      { slug: 'blue',             title: 'Blue' },
      { slug: 'new-trying-outs',  title: 'New Trying Outs' },
    ].map(t => ({
      ...t,
      cover: `https://cdn.snowstar.company/mutra/spotlight/kayma-nto/${t.slug}-cover.webp`,
      vinyl: MUTRA_SPOTLIGHT_VINYL,
      snippetUrl: 'https://cdn.snowstar.company/mutra/spotlight/placeholder-snippet.m4a',
      placeholder: true,
    })),
  },
];
