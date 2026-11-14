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

| vertical | pages | js | worker/src |
|---|---|---|---|
| studio | `index.html`, `artist(s).html`, `contact.html` | `main`, `data`, `artists-page`, `works-admin` | `works`, `share-work`, `artists`, `contact` |
| Mutra | `mutra.html` | `mutra-*` (21 files) | `catalog`, `licensing`, `rights`, `earnings`, `ownership`, `collections`, `intake`, … |
| Snowstash | `snowstash.html` | — | `snowstash` |
| StreamDAW | `apps/streamdaw*.html` | `streamdaw-*` | `streamdaw*`, `creem-streamdaw` |
| Audioctor | `apps/audioctor*.html` | `audioctor-*` | `audioctor*` |
| shared | `account`, `dashboard`, `stats`, `reset`, `terms`, `privacy`, `refund` | `account*`, `dashboard`, `money`, `consent` | `session`, `members`, `mail`, `oauth`, `money`, `coupons`, `creem`, `hyp` |

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
