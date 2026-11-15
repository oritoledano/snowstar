# worker/src/snowstash — the royalty-recovery report

One module, 14 routes. The whole server side of a vertical.

Routes: `/snowstash/scan`, `/scan/catalog`, `/catalog`, `/catalog/import`,
`/catalog/manual`, `/catalog/deezer`, `/catalog/deezer/search`, `/checkout`, `/coupon`,
`/coupon/check`, `/mine`, `/artists`, `/registrations`, `/admin`.

Tables: `snowstash_scans`, `snowstash_catalog`, `snowstash_orders`,
`snowstash_unlocks`, `snowstash_coupons`, `snowstash_registrations`.

## How it sells

**₪69 through HYP** — `PRICE_GROSS = 6900` agorot incl VAT, order prefix `ST-`. A coupon
that covers the whole price unlocks the report immediately and never touches HYP.
HYP rather than Creem because the amount needs an Israeli חשבונית מס.

`hyp.js:312` imports this module as a **runtime string**, not a static import. A stale
path there deploys clean and fails only when a customer returns from HYP with an `ST-`
order — the money taken and the report never unlocked.

## Its front end is not in a snowstash folder

`snowstash.html` carries its own logic inline (~333 lines) and its identity CSS inline
(~353). It owns **zero** files in `js/` or `css/`. The rest of its UI lives in files that
belong to nobody:

- `js/dashboard.js:4219-4305` — the admin panel, and the only caller of
  `/snowstash/admin` and the coupon routes
- `js/account-ui.js:607-627` — `paintStash()`, the only caller of `/snowstash/mine`
- `js/site-edit.js:82-83` — its entry in the property registry
- `css/style.css:761-825` — the night-radar teaser block, inside the studio stylesheet

So a change to "the Snowstash UI" usually means editing a shared file. Check those four
before concluding something is missing.

## The scanner is a different repo

`~/Dropbox/CLAUDE CODE PROJETCS/SNOWSTAR/snowstash` holds the FastAPI scanner that does
the actual sweeping. It contains a **Stripe checkout that was never deployed** — read its
CLAUDE.md before touching anything about payment there.
