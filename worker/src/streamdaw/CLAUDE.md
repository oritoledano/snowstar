# worker/src/streamdaw — the app, and its six products

9 modules, 35 routes. **Six products are sold separately under one app**, so a change to
pricing or entitlement is rarely about "StreamDAW" as a whole.

| module | what |
|---|---|
| `streamdaw.js` | checkout, entitlements, keys, live links, free downloads. The big one |
| `streamdaw-products.js` | the six products and their plans |
| `streamdaw-subs.js` | Pro Monthly: the older HYP subscription |
| `creem-streamdaw.js` | the current Creem checkout and portal |
| `streamdaw-keys.js` | licence signing |
| `streamdaw-macs.js` | which Macs a licence is linked to |
| `streamdaw-updates.js` | what the app should know: versions, bundles, installs |
| `streamdaw-telemetry.js` | heartbeats |
| `streamdaw-demo-room.js` | the Durable Object behind the demo |

## Two landmines in the config

- `wrangler.toml:2` is `main = "src/index.js"`, so **`index.js` cannot move into a
  folder.**
- `wrangler.toml:84` resolves `class_name = "DemoRoom"` off the main module's exports.
  `index.js:110` re-exports it from `streamdaw-demo-room.js`. A stale specifier at
  `index.js:107` breaks the **Durable Object binding**, not one route.

## It writes a table Audioctor reads

`streamdaw.js:1531` (`streamdawRelease`) takes an `asset` from the request body and is
the **only writer of `app_releases`**. `audioctor/audioctor.js` only ever reads it,
filtered by its own `ASSET = 'audioctor-macos'`. So Audioctor installer registration runs
through a StreamDAW module and the `/api/streamdaw/release` route. Moving the module is
safe; later "tidying" those routes breaks Audioctor releases silently.

## Platform

The Windows app sends `?os=win`; `streamdaw-updates.js:86` serves it `streamdaw-windows`
rather than `streamdaw-macos`. Since 2026-11-14 `streamdaw_update_installs` also has an
`os` column, so install counts can be split — `os` is NULL on every row written before
that and those count as mac.

## Known, unfixed, not in this repo

The **app** polls `/api/streamdaw/streamdaw/macs/status` — the segment is doubled. It has
404'd many thousands of times since 2026-10-30, which is why `streamdaw_macs` is empty
and no app user is attributable. `/streamdaw/macs/status` is in `CSRF_EXEMPT`
(`index.js:234`) under its correct path, so the fix is one path string in the app's own
repo. `handoff/2026-11-13-macs-status-404.md` has the full brief.
