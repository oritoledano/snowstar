/* ═══════════ Mutra — Artist profile data ═══════════
   Extends a MUTRA_SPOTLIGHTS row (mutra-spotlight-data.js, matched by
   id) with the extra content the full artist page needs but the
   compact spotlight card never shows: bio, mood/genre tags, streaming
   & social links, and lyrics. Kept in its own file/script tag so a
   catalog pageview that never opens an artist page doesn't pay for any
   of this — lyrics text in particular is fetched lazily (see
   lyricsUrl) rather than inlined here.

   socialLinks is an array on purpose — an artist can have more than
   one of the same "kind" is unlikely, but multiple platforms is the
   whole point (IG, TikTok, Spotify, ...). Renderer skips it entirely
   if empty rather than showing an empty dropdown. Same for tags.

   tags / socialLinks are intentionally empty for KAYMA right now — no
   verified genre/mood classification or public social handles were
   available to fill in without guessing, so the page ships correctly
   with those sections simply not rendered until real data lands here. */
const MUTRA_ARTIST_PROFILES = {
  'kayma-nto': {
    bio: "KAYMA is the solo project of Ori Toledano — the same Ori behind Snowstar's Mutra catalog, writing and producing under his own name. “New Trying Outs” is his debut album: eight tracks recorded, mixed and pressed to vinyl independently, built around the same instinct that runs through Mutra itself — real songs, properly made, not stock filler.",
    heroImage: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/album-cover.webp',
    tags: [],
    socialLinks: [],
    lyricsUrl: 'https://cdn.snowstar.company/mutra/spotlight/kayma-nto/lyrics.json',
  },
};

/* Recognized social/streaming platforms for the dropdown — order here is
   the order they're offered in when an artist has more than one. `icon`
   is a Simple-Icons-style path id resolved in mutra-artist.js; adding a
   platform later just means adding a row here + an icon there. */
const MUTRA_SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'facebook',  label: 'Facebook' },
  { key: 'twitter',   label: 'X / Twitter' },
  { key: 'youtube',   label: 'YouTube' },
  { key: 'spotify',   label: 'Spotify' },
  { key: 'appleMusic',label: 'Apple Music' },
  { key: 'soundcloud',label: 'SoundCloud' },
  { key: 'website',   label: 'Website' },
  { key: 'other',     label: 'Other' },
];
