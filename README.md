# Snowstar.Company — new website

A fast, dependency-free static rebuild of [snowstar.company](https://snowstar.company),
replacing the old Wix site. Pure HTML/CSS/JS — no build step, no framework, no fees.

## Structure

```
index.html        homepage (single page: work, services, mutra teaser, clients…)
mutra.html        standalone MutrA music-licensing page (own warm identity)
css/style.css     homepage design system + styles
css/mutra.css     MutrA page design system (separate warm palette)
js/data.js        ← EDIT THIS to add/change portfolio projects
js/mutra-data.js  ← EDIT THIS to add/change MutrA music tracks (shared)
js/main.js        homepage interactions (grid, lightbox, nav, starfield)
js/mutra-page.js  MutrA catalog: filters, search, sticky player w/ seek
assets/           hero loop, thumbnails, client logos, wordmark, morph gif
assets/mutra/     MutrA audio previews (.m4a)
```

## MutrA is its own page

`mutra.html` is a standalone music-licensing storefront (artlist/musicbed-style) with
its own **warm color scheme** (amber → coral → magenta) to stand apart from the icy
homepage. It has a hero, search + genre/mood filters, a waveform track catalog, and a
sticky bottom player with a working scrubber (click + drag to seek). The homepage
`#mutra` section is now just a teaser linking here. Both pages share `js/mutra-data.js`.

## Brand assets in the nav

- `assets/menu-morph.gif` — your original Wix menu→snowflake morph animation, now the top-left menu button (opens the nav on mobile, scrolls to top on desktop).
- `assets/wordmark.png` — the **SNOWSTAR ❄ COMPANY** lockup (snowflake in the middle), rendered in your real brand font **Lulo Clean** (a licensed Monotype font) with your snowflake mark. Rendered to a transparent PNG so no font license needs embedding.

## Editing content

**Add or edit a project** — open `js/data.js` and edit the `PROJECTS` array:

```js
{ "title": "NEW CAMPAIGN", "thumb": "assets/thumbs/new-campaign.jpg", "vimeo": 123456789 }
```

- `vimeo` (optional): the Vimeo video ID — makes the card playable in the lightbox.
- `preview` (optional): path to a short muted .mp4 — plays on hover.
- 20 projects are already wired to the Snowstar Vimeo channel; the rest show
  their thumbnail until a `vimeo` id is added.

**Showreel** — `SHOWREEL_VIMEO` at the top of `js/data.js` (currently "The Snowreel").

## Run locally

```
python3 -m http.server 8742
# → http://localhost:8742
```

## Deploy free

Works as-is on any static host. Recommended: **Cloudflare Pages** (free, global CDN, SSL):

1. Push this folder to a GitHub repo.
2. Cloudflare Pages → Create project → connect the repo → no build command, output dir `/`.
3. Add custom domain `snowstar.company` and update the DNS records it shows you
   (at your registrar, replacing the Wix records).

GitHub Pages or Netlify free tier work identically.

## Video sources — IMPORTANT

Portfolio videos were recovered from the old site's Wix database (`work` collection —
full dump in `data/work_collection.json`, resolved URLs in `data/work_resolved.json`).
76 of 78 grid projects play their original film with credits (work / director / production / agency).

They currently stream from `video.wixstatic.com`, **which dies when the Wix subscription
is cancelled.** A full local backup of all 99 films lives in `~/Desktop/snowstar-video-archive/`.
Before cancelling Wix, re-host them (Vimeo uploads, or Cloudflare R2/Stream) and swap the
`mp4` URLs in `js/data.js`.

### MutrA music catalog (built)

The MutrA catalog (`mutra.html`) is powered by `js/mutra-data.js`
(16 tracks recovered from the Wix `MUSICLIBRARY` collection — raw dump in
`data/musiclibrary_collection.json`). Each track has genres, moods, a real duration,
a self-hosted audio preview (`assets/mutra/*.m4a`, 128k AAC, lazy-loaded), and a
full-track Dropbox download link. Player logic is in `js/mutra-page.js`. "License"
buttons open a prefilled email inquiry.

- Audio previews are **self-hosted** (survive Wix cancellation); originals archived in
  `~/snowstar-video-archive/mutra-originals/`.
- The **Dropbox download links** are external — verify they still resolve before relying on them.
- To add/edit a track: edit the `MUTRA.tracks` array in `js/mutra-data.js`.

## Production TODO

- [ ] Migrate video hosting off `video.wixstatic.com` before cancelling Wix (see above)
- [ ] Newsletter: connect the form to Buttondown/Mailchimp (currently shows a local confirmation)
- [ ] MutrA: build catalog page from `data/musiclibrary_collection.json` — button currently opens email
- [ ] Optional: per-project case-study pages for SEO
