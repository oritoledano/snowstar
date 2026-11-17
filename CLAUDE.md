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

### Size, air, colour and font — relative, never pixels

The editor also sets a block's text size, the room around it, its colour and its face.
Size and air are stored relative on purpose — this is the part that is easy to get wrong:

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

**Colour and font (2026-11-17) ride in the same `layout.<page>` row as the air**, as
`c` and `f` beside `t` and `b` — not in the block's saved HTML, and not in a wrapper span
like Size's. The reason is not taste: a block's `style` attribute is **not part of its own
`innerHTML`**, which is all `/api/texts` stores, so a colour set on the block itself could
never be saved at all.

**The whole row is painted by one generated stylesheet, never by an element's `style`
attribute.** That was the second attempt; the first painted inline and review caught two
visitor-facing bugs in it, both of which the stylesheet makes impossible:

- `el.style.color = ''` does not mean "leave it alone" — it **removes** that declaration
  from the element's own style attribute, which is where the page's markup keeps its
  authored colour (`artists.html:433` and `:440`, `contact.html:52`, `snowstash.html:569`).
  So an air-only row — the only shape that existed before colour and font — deleted its
  block's colour for every visitor, and the control that looked like the undo (`×`, "back
  to the page's own colour") was what did it. The padding half of that had been live since
  Air shipped.
- A block's style attribute is not in its own innerHTML but it **is** in its keyed parent's.
  Keys nest on purpose, so colouring an `<a>` made the untouched `<li>` round it count as
  dirty and stored the child's inline style inside the parent's text row — the same shape
  as the `contenteditable` leak of 2026-11-16, and it freezes that sentence against every
  later edit to the HTML.

The rules are `[data-txt="<key>"][data-txt]{…!important}`. The doubled attribute selector
and the `!important` are **deliberate and are the exception to "never fight the CSS"**: what
they override may be `!important` itself — `.service-tags` and `.about-locales` are, on five
keyed blocks of the home page, where an inline colour was silently doing nothing at all. The
selector is built **only** from keys matching the shape the API enforces on a row key, so
nothing stored can close the bracket and write CSS of its own.

**A quick colour is a token, not a hex.** The site has three skins and a light/dark toggle
(`css/skins.css`, `js/mutra-skin.js`), all redefining `--text`, `--muted`, `--dim`, `--coral`
and `--amber`. A `#eef3fb` picked in the dark is 1.0:1 against bone-light's `#f7f4ee`, and
the admin never sees it, because the toggle belongs to the visitor. The five swatches store a
token id and resolve to `var(--text,…)` and friends, each carrying the studio stylesheet's
own value as the fallback for pages that never load `skins.css`. The picker and the
eyedropper still store an absolute six-digit hex — that is what they are for, and a colour
lifted off a photo has no token to be.

A font is an **id from the `FONTS` table** in `js/site-edit.js` — Inter, Sora, Anton,
Fraunces, Space Grotesk, Unbounded, Oswald, Barlow Condensed, Permanent Marker, IBM Plex
Mono, Commit Mono: every face already used somewhere on this site. The stack and the
stylesheet URL are only ever read from that table, so **no stored string ever reaches a CSS
declaration or a URL**. Adding a face to the picker means adding a row there.

A page loads only the fonts its own markup asks for, so `ensureFont()` appends the Google
Fonts link (or Commit Mono's self-hosted `@font-face`) **the moment a face is actually
used** — on hydration for every visitor, and for the whole table when an admin opens the
editor, which is what makes each name in the dropdown render in its own face.

Colour is refused on one kind of block: a heading painted by the brand gradient
(`background-clip:text` over a transparent colour — `.grad`, `.grad-text`), which ignores
`color` entirely. The control greys out and says why, as Air does on an inline block.

One row holds every block's look on a page and `saveText` truncates at 20 000 characters,
which would leave invalid JSON and lose **every** override on that page at the next load.
A save over 19 000 is refused before the write. A row is ~55 characters, so that is ~340
blocks on one page.

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
- **And `teardownText` has to strip them the same way `strip()` does.** It removed the
  `se-editable` class but left the empty `class=""` behind on a block that had none of its
  own; `strip()` removes that attribute. The two disagreeing meant that from the **second**
  entry into Texts in one page life, every keyed block containing a keyed child counted as
  dirty untouched — all eight address lines on `contact.html`, each given a stored override
  nobody asked for and then frozen against any later edit to the HTML. Fixed 2026-11-17;
  the first pass through the editor never showed it, which is why it lasted.

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
