# site — snowstar.company

Four verticals share one deployable: **studio** (index, works, artists, contact),
**Mutra** (music-licence catalogue), **Snowstash**, and the **app pages** for StreamDAW
and Audioctor. They are separated by naming, not by folders — see the table below.

## How it ships

- **Every page: GitHub Pages**, branch `main`, path `/`. A `git push` publishes the site
  and is the only step — do **not** also `gh api -X POST .../pages/builds`, the duplicate
  shows up as `errored` and makes a healthy deploy look broken.
- **`/api/*`, `/t/*`, `/w/*`, `/live/*`: the Worker** `snowstar-api`, deployed with
  `npx wrangler deploy` from `worker/`. It runs on the site's own domain so the session
  cookie stays first-party. Bindings: D1 `snowstar-members`, R2 `MEDIA` =
  `snowstar-mutra` (public) and `MASTERS` (deliberately no public access).
- **Before any deploy:** `git fetch && git rev-list --count HEAD..origin/main` must be 0.
  Deploying from a stale tree has silently reverted live code.

## The rule that governs everything here

**A file's path is its public URL.** Every `.html` at the root and under `apps/` must stay
exactly where it is — moving `mutra.html` kills `snowstar.company/mutra.html`, and the
same goes for `dashboard.html`, `apps/`, `sitemap.xml` and the webmanifests. Reorganising
`js/`, `css/` or `worker/src/` is safe; touching an HTML path is not.

## Where each vertical's code lives

`worker/src/` is split into one folder per vertical (2026-11-14). `index.js` stays at
`worker/src/index.js` because `wrangler.toml:2` is `main = "src/index.js"` and
`wrangler.toml:84` resolves `class_name = "DemoRoom"` off that module's exports.

| vertical | pages | js/ | worker/src/ |
|---|---|---|---|
| studio | `index.html`, `contact.html` | `main`, `data`, `works-admin` | `studio/` — 3: `works`, `share-work`, `jobs` |
| Mutra | `mutra.html`, **`artist.html`, `artists.html`** | `mutra-*`, `artists-page` | `mutra/` — 21: `catalog`, `licensing`, `rights`, `artists`, `earnings`, **`contact`**, … |
| Snowstash | `snowstash.html` | — (its logic is inside `dashboard.js`, `account-ui.js`, `site-edit.js`) | `snowstash/` — 1 |
| StreamDAW | `apps/streamdaw*.html` | `streamdaw-*` | `streamdaw/` — 9 |
| Audioctor | `apps/audioctor*.html` | `audioctor-*` | `audioctor/` — 5 |
| shared | `account`, `dashboard`, `stats`, `reset`, `terms`, `privacy`, `refund` | `account*`, `dashboard`, `money`, `consent`, **`mutra-track`, `mutra-skin`** | `shared/` — 21: `session`, `members`, `mail`, `oauth`, `coupons`, `creem`, `hyp`, … |

Four traps in that table, each one found by getting it wrong first:

- **`artist.html` and `artists.html` are Mutra, not studio.** "Artist" means one thing on
  this site and it is the Mutra catalogue: `works.js` and `main.js` contain no occurrence
  of the word. But `data-product="mutra"` does **not** prove ownership — `account.html`
  and `dashboard.html` declare it too, because it is a skin switch read by `mutra-skin.js`.
- **`contact.js` is Mutra.** Its only caller is `js/mutra-contact.js`, loaded only by
  `mutra.html`. `contact.html` does not post to `/api/contact`.
- **`js/mutra-track.js` and `js/mutra-skin.js` are shared** despite the name — 20 and 6
  pages load them, `index.html` and `snowstash.html` among them. Likewise `css/mutra.css`
  and `css/skins.css`, which `account.html` and `dashboard.html` load. Anything that sorts
  `js/` by filename prefix breaks tracking and theming sitewide.
- **`worker/src/studio/works.js` is two verticals in one file.** Lines 1-152 are the studio
  portfolio (`works` table, `/works`); from 154 it is client logos (`client_logos`,
  `/logos`), which `js/mutra-page.js` fetches. It was left whole rather than split.

There are **zero product-to-product imports** — no Mutra module imports a StreamDAW one,
and so on. Every cross-vertical dependency goes through `shared/`. Two deliberate
inversions remain: `shared/hyp.js` and `shared/creem.js` dynamically import down into the
verticals to break a static cycle, and `shared/analytics.js`, `oauth.js` and `reset.js`
import statically from `mutra/`. Keep it that way: a new cross-vertical need belongs in
`shared/`, not in an import between two verticals.

## Things that bite

- **Bump `?v=` on every changed JS/CSS**, or browsers serve the old file.
- **Read the real D1 schema before writing SQL** (`.schema <table>`). Guessed column names
  have broken two features silently.
- `worker/src/health.js` keeps `req_log`, the Worker's own 14-day request log. It is the
  decisive evidence for "did anything ever call this route" — it records every request
  except *successful* `/streamdaw/telemetry` and `/streamdaw/usage` heartbeats.
- `js/dashboard.js` renders everything into `#app` via `NAV` → `ROUTES` → `LEGACY`; the
  `checkNav()` assertion at the file end fails the build if a nav entry has no view.
- `data/` is gitignored and exists only on this Mac. Move this folder, never re-clone it.
- The app pages belong to their own sessions: **do not edit `audioctor*` or `streamdaw*`
  source from here** beyond the site pages themselves.
