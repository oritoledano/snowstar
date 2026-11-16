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

## Every new page ships editable

Standing rule, 2026-11-16, asked for from the Audioctor session: Ori should not need a
session to change a sentence. A new `.html` carries three things before it ships:

1. `<script src="js/account.js?v=N" defer></script>` — the editor only ever wakes for an admin
2. `<script src="js/site-edit.js?v=N" defer></script>`
3. `<main data-autotxt>` — keys every text block as `auto.<page>.<hash of its own words>`,
   so nothing has to be named `data-txt` by hand, and moving a block keeps its edit

`node contracts/check.mjs` enforces it (`pages-editable`). What must **not** be editable —
the app UI, the legal text, the dated terms archives — is listed with its reason in
`contracts/registry.json` under `editable.exempt`. `editable.pending` is empty as of
2026-11-16: all 24 pages that should be editable are.

**A generated page needs its generator fixed, not its HTML.** `apps/streamdaw-changes.html`
and `apps/audioctor-changes.html` are written by `changelog-site.mjs` in the StreamDAW and
Audioctor repos, so an edit to the `.html` here survives exactly until the next run. They
are listed under `editable.generated` and a second check,
`generators-write-editable-pages`, reads those two scripts and reports when a template has
lost the wiring or pinned an older `site-edit.js?v=`. Both are red today and both fixes
belong to those repos' own sessions. That check also fails if the pages disagree with each
other about `site-edit.js?v=`, which is the "bump `?v=` everywhere" trap made automatic.

### Size and air are relative, never pixels

The editor also sets a block's text size and the room around it. Both are stored relative
on purpose — this is the part that is easy to get wrong:

- **Size** is a percentage on a `<span class="se-fs">` wrapped round the block's own
  contents, so it rides in the saved HTML with the text and needs no stylesheet (the
  editor's CSS is admin-only; a visitor never loads it). A percentage on `font-size`
  resolves against the **parent** — here the block itself — so 125% is a quarter bigger
  than whatever that block's `clamp()`/`vw` rule works out to at that viewport. Measured
  on the home page's h1: one 200% override reads 192px at 1280 and 67.5px at 375.
- **Air** is em of `padding` above and below, stored per block in one `layout.<page>` row.
  `padding`, not `margin`, because it **adds** to the margin the stylesheet already gave
  the block instead of replacing it — there is no breakpoint at which it can fight the
  CSS. The one cost is a block with authored padding of its own (a table cell, a card),
  where the override replaces it; that is visible at once and one step back to 0 undoes it.

Both are clamped to a fixed list of steps in the editor and again on the way in from the
API, so a bad stored value can only ever mean "no override". **Never store a px size or
gap**: that is the one way to freeze a responsive value at the width it was measured at.

Two limits that are deliberate, not oversights. Size is refused on a block that contains
another block, because the span would have to wrap block-level children — invalid, and it
would drag their own sizes with it. Air is refused on a `display:inline` block, because
vertical padding on one paints but adds no layout space; the control greys out and shows
`–` rather than letting you click it to no effect.

### Keyed blocks nest, and that decides three things

`autoKeys` keys a `<p>` *and* the `<a>` inside it — both are text someone may want to
change. Three consequences, each of which was a bug first:

- **Hydration applies the outermost key first.** Assigning the parent's `innerHTML`
  replaces the child, so in D1 table order the newer edit on the inner block was lost on
  about every other load. Keys are sorted by DOM depth and each element is looked up again
  at the moment it is applied.
- **The toolbar follows `closest('[data-txt]')` from the event target**, not
  `e.currentTarget`. `focusin` bubbles, so the outer block used to win and the inner one
  could never be selected.
- **The editor's own attributes are stripped on capture, compare and save.** Marking the
  child changes the parent's `innerHTML`, which made the parent count as dirty untouched
  and stored `contenteditable="true"` on its child — live, on five rows, until 2026-11-16.

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
