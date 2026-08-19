/* ═══════════ Mutra — Artist Spotlight row data ═══════════
   Data-driven on purpose: this is the first of what should become a
   reusable pattern (other artists, albums, or curated playlists), so
   nothing about the rendering code below should ever need to know it's
   "Kayma" specifically — it only ever reads this shape.

   The vinyl sticker is a shared brand asset — a Mutra-branded preview
   affordance, not a per-song design — but the ALBUM card gets a
   distinct one from every song card: the album uses the real,
   press-ready label art (see MUTRA_SPOTLIGHT_VINYL_ALBUM), songs use a
   generated taupe + SSC-snowflake sticker (MUTRA_SPOTLIGHT_VINYL). Each
   comes in two color variants swapped by CSS content:url() via
   [data-theme] and a .spot-is-album class — see spotlight.css — for
   contrast: white vinyl on the dark skin, black vinyl on the light
   skin. The URLs below are just the initial <img src>, which CSS
   always overrides visually; kept in sync with the CSS defaults
   (white) so the browser isn't fetching an asset it'll never show.

   snippetUrl/snippetStart are PLACEHOLDERS right now (a short generated
   tone, same file reused for all 8 tracks) — these songs haven't been
   uploaded to Kayma's artist account yet. Once they are, swap snippetUrl
   per track to a real ~15-20s highlight and this needs no other change.

   Every card in a row shares one artist — mutra-spotlight.js renders
   spot.artist as a subtitle under every track title, so it only needs to
   live here once rather than repeated per track.

   The first entry, slug 'album', is the record itself rather than a
   song — same card shape as every track (cover + vinyl + a snippetUrl,
   here just a short album-level teaser reusing the placeholder tone),
   just with its own vinyl + isAlbum flag so CSS can target it. */
const MUTRA_SPOTLIGHT_VINYL = 'https://cdn.snowstar.company/mutra/spotlight/mutra-vinyl-white-ssc.webp';
const MUTRA_SPOTLIGHT_VINYL_ALBUM = 'https://cdn.snowstar.company/mutra/spotlight/mutra-vinyl-album-white.webp';

const MUTRA_SPOTLIGHTS = [
  {
    id: 'kayma-nto',
    kicker: 'Custom License',
    artist: 'KAYMA',
    album: 'New Trying Outs',
    cdn: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/',
    tracks: [
      { slug: 'album', title: 'New Trying Outs - Album', isAlbum: true, vinyl: MUTRA_SPOTLIGHT_VINYL_ALBUM },
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
      vinyl: t.vinyl || MUTRA_SPOTLIGHT_VINYL,
      snippetUrl: 'https://cdn.snowstar.company/mutra/spotlight/placeholder-snippet.m4a',
      placeholder: true,
    })),
  },
];
