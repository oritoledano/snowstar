# worker/src/audioctor — the Mac app's server side

5 modules, 23 routes. Imports from `shared/` 17 times and from no other vertical.

| module | what |
|---|---|
| `audioctor.js` | checkout, entitlements, the free plan's walls, the ~2.3 GB model set |
| `audioctor-creem.js` | the Creem checkout and portal |
| `audioctor-subs.js` | Audioctor Monthly: the older HYP subscription |
| `audioctor-keys.js` | licence signing — the app trusts two key pairs |
| `audioctor-reports.js` | what the app sends back |

Tables: `audioctor_activations`, `audioctor_orders`, `audioctor_subs`,
`audioctor_sub_charges`, `audioctor_subscriptions`, `audioctor_coupons`,
`audioctor_free_downloads`, `audioctor_reports`, and **`app_releases`, read only**.

## It reads a table it must never write

`app_releases` is written **only** by `streamdaw/streamdaw.js:1531`, through the
`/api/streamdaw/release` route. This folder reads it filtered by `ASSET =
'audioctor-macos'` (`audioctor.js:30`). That coupling is invisible from here — do not
"clean up" the StreamDAW release route without checking Audioctor releases still work.

## Cancelling

`audioctor-subs.js:33` builds the cancellation link from
`/apps/audioctor-cancel.html` and `:474` mails it with a 24-hour token. **That page did
not exist until 2026-11-14**, so every subscriber who clicked Cancel in their email got a
404 — and the link is named in the cancellation clause of the terms. All six
`/audioctor/subscription/*` routes mirror the StreamDAW ones exactly, and `subView`
returns the same shape, which is why the fix was the page alone.

Amounts are **agorot, not cents**: the dollar price became shekels on the day each person
subscribed (`shared/fx.js`) and stays that amount for them.

## Billing

**Creem** sells Audioctor now — Merchant of Record, so it carries EU/UK/US sales tax.
The HYP Monthly plan above is the older one and still has live subscribers.

## The app is not here

`~/Dropbox/CLAUDE CODE PROJETCS/SNOWSTAR/audioctor` is the app, the engine and the iPhone
work. It is a separate repo with its own CLAUDE.md, and its session owns it — do not edit
it from the site.
