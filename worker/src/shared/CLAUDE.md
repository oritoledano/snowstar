# worker/src/shared — what every vertical uses

21 modules. Sign-in, members, mail, money, both payment providers, the request log.
No routes of its own worth listing: it is imported, not dispatched to.

`mail.js` is the most-imported module in the tree (14 importers). `session.js`,
`crypto.js` and `coupons.js` are close behind.

## The rule

**A new cross-vertical need belongs here, not in an import between two verticals.**
There are zero product-to-product imports in `worker/src` — no Mutra module imports a
StreamDAW one, and so on. Keep it that way; it is the property that made the folder
split possible at all.

## Two inversions that are deliberate

- `hyp.js` and `creem.js` **dynamically** import down into `mutra/`, `streamdaw/`,
  `audioctor/` and `snowstash/`. They are the payment-return dispatchers and the
  verticals import them back, so a static import would be a cycle. `hyp.js:310` says so.
- `analytics.js:19`, `oauth.js:16` and `reset.js:42` import **statically** from `mutra/`
  (`hasLiveLicence`, `linkOnSignIn`, `trashObject`). Those three are the only hard
  compile-time edges from shared into a vertical. If shared should depend on nothing,
  these are what to invert — nothing else.

## Billing, decided

**Creem** sells StreamDAW and Audioctor: Merchant of Record, carries EU/UK/US sales tax.
**HYP/Max** takes anything needing an Israeli חשבונית מס — Mutra and Snowstash's ₪69.
Paddle is gone; do not reintroduce it. Snowstash's scanner folder still contains a Stripe
path that was never deployed — see `SNOWSTAR/snowstash/CLAUDE.md`.

## Things that bite

- **Secrets are Cloudflare Worker secrets**, set by Ori with `wrangler secret put`. Never
  in a file.
- `health.js` keeps `req_log`, a 14-day log of every request except *successful*
  `/streamdaw/telemetry` and `/streamdaw/usage` heartbeats. It is the decisive evidence
  for "did anything ever call this route" — a zero there is a fact, not a gap.
- **Read the real D1 schema before writing SQL.** Guessed column names have broken two
  features silently.
