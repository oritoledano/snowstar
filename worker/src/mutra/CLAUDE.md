# worker/src/mutra — the music-licence catalogue

21 modules, the largest vertical. 79 routes. Imports from `shared/` 11 times and from no
other vertical.

| what | modules |
|---|---|
| the catalogue | `catalog.js`, `pricing.js`, `collections.js`, `stacks.js`, `stream.js` |
| artists | `artists.js`, `artistreg.js`, `artistprofile.js` |
| licensing | `licensing.js`, `rights.js`, `ownership.js`, `certificate.js`, `clearlist.js` |
| money out | `earnings.js`, `greeninvoice.js` |
| admin | `intake.js`, `bulk.js`, `trash.js`, `agent.js`, `share.js`, `contact.js` |

Tables: `tracks`, `track_overrides`, `track_uses`, `track_stacks`, `deleted_tracks`,
`collection_tracks`, `catalog_snapshots`, `licence_requests`, `licence_payments`,
`licence_texts`, `rights_decls`, `rights_texts`, `artist_managers`, `managed_artists`,
`artist_terms`, `stream_breadth`.

## Four things that are not what they look like

- **`artist.html` and `artists.html` are Mutra, not studio.** They title themselves
  "Mutra by Snowstar" and the dashboard's own list calls them "Mutra · artists".
- **`data-product="mutra"` does not prove ownership.** `account.html` and
  `dashboard.html` declare it too — it is a skin switch read by `js/mutra-skin.js`.
- **`js/mutra-track.js` and `js/mutra-skin.js` are shared**, not Mutra: 20 and 6 pages
  load them, `index.html` and `snowstash.html` among them. So are `css/mutra.css` and
  `css/skins.css`, which `account.html` and `dashboard.html` load. Anything that sorts
  `js/` by filename prefix breaks tracking and theming sitewide.
- **`contact.js` is Mutra.** Its only caller is `js/mutra-contact.js`, loaded only by
  `mutra.html`. `contact.html` does not post to `/api/contact`.

## Money and the law

Mutra bills through **HYP/Max**, not Creem — only an Israeli terminal can issue a
חשבונית מס. `greeninvoice.js` is the invoicing side; its secret still needs regenerating
before it can invoice real sales.

**Ori's ת.ז never appears on a public page.** Invoices only.

`share.js:84` fetches `https://snowstar.company/js/mutra-data.js` over HTTP to build all
400 `/t/<slug>` pages, and `tools/build-sitemap.py:46` reads the same file at build time.
**That js file's path is therefore a public URL** — it is the one file under `js/` that
cannot be moved.
