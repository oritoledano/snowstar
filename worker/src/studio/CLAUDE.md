# worker/src/studio — the agency itself

3 modules, 9 routes, and the only folder here that imports nothing outside itself.

| module | routes | tables |
|---|---|---|
| `works.js` | `/works`, `/works/upload`, `/works/reorder`, `/works/delete`, **and `/logos*`** | `works`, `client_logos` |
| `share-work.js` | the `/w/<id>` share page | — |
| `jobs.js` | `/jobs`, `/jobs/export` | `jobs`, `briefs` |

Front end: `index.html`, `contact.html`, and `js/main.js`, `js/data.js`,
`js/works-admin.js`.

## works.js is two verticals in one file

Lines 1–152 are the studio portfolio (`works`, consumed by `js/main.js` on the home
page). From line 154 it is **client logos** (`client_logos`, `/logos`) — and
`js/mutra-page.js:3454` fetches `/api/logos` for the Mutra marquee. The comment there
says "shared by both sites' marquees".

So the studio owns the write path for data Mutra reads, and `js/works-admin.js` — a
studio file loaded only by `index.html` — is the editor for it. The file was left whole
rather than split. If you ever do split it, the logos half is **shared**, not Mutra: a
folder named `mutra/` must not own what the studio writes.

## Note

"Artist" does not mean studio here. `artist.html` and `artists.html` are Mutra, and
`works.js`, `main.js` and `data.js` contain no occurrence of the word.

`jobs.js` is the quote-based job ledger — one row per piece of work sold, with the
licence that went with it. Read by the owner dashboard only.
