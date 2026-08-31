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

   snippetUrl/snippetStart are PLACEHOLDERS for the 8 songs (a short
   generated tone, same file reused for all of them) — those tracks
   haven't been uploaded to Kayma's artist account yet. Once they are,
   swap snippetUrl per track to a real ~15-20s highlight and this needs
   no other change. The ALBUM card is the exception: it already has a
   real snippet (a 72s medley across the whole record, extracted from
   the official "vinyl spin" social cut), so it skips the placeholder
   dot entirely.

   Every card in a row shares one artist — mutra-spotlight.js renders
   spot.artist as a subtitle under every track title, so it only needs to
   live here once rather than repeated per track.

   The first entry, slug 'album', is the record itself rather than a
   song — same card shape as every track (cover + vinyl + a snippetUrl),
   just with its own vinyl/snippet/isAlbum overrides so CSS and the
   placeholder dot both know to treat it differently. */
const MUTRA_SPOTLIGHT_VINYL = 'https://cdn.snowstar.company/mutra/spotlight/mutra-vinyl-white-ssc.webp';
const MUTRA_SPOTLIGHT_VINYL_ALBUM = 'https://cdn.snowstar.company/mutra/spotlight/mutra-vinyl-album-white.webp';

const MUTRA_SPOTLIGHTS = [
  {
    id: 'kayma-nto',
    kicker: 'Custom License',
    artist: 'KAYMA',
    color: '#ff3d8b',   // the artist's highlight in the ad-style headline — the site's own pink

    album: 'New Trying Outs',
    cdn: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/',
    tracks: [
      {
        slug: 'album', title: 'New Trying Outs - Album', isAlbum: true,
        vinyl: MUTRA_SPOTLIGHT_VINYL_ALBUM,
        snippetUrl: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/album-medley.m4a',
        placeholder: false,
      },
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
      snippetUrl: t.snippetUrl || 'https://cdn.snowstar.company/mutra/spotlight/placeholder-snippet.m4a',
      // Every song here is now a real catalogue entry, so the row plays the
      // master rather than this snippet — mutra-spotlight.js prefers
      // mutraPlayer.find(slug) and only falls back to snippetUrl. The
      // placeholder dot goes with it: there is nothing provisional left.
      placeholder: t.placeholder !== undefined ? t.placeholder : false,
    })),
  },
];
