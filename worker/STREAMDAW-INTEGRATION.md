# StreamDAW — how the buy + deliver flow works (DEPLOYED)

StreamDAW is Snowstar's first software product. It's sold **one-time (₪249, ≈$69)**
through **HYP** — the same gateway and terminal as Mutra — and delivered as a
downloadable macOS installer tied to the buyer's Snowstar account.

Live as of this commit. Files:
- `schema-streamdaw.sql` — `entitlements`, `download_tokens`, `app_releases`, `streamdaw_orders`
- `src/streamdaw.js` — checkout, verified-return grant, download, dashboard
- `src/hyp.js` — `verifyReturn` exported; `handleReturn` dispatches `SD-` refs here
- `src/index.js` — `/api/streamdaw/*` routes
- `../apps/streamdaw.html` — the buy page

## The flow

1. Buyer clicks **Get StreamDAW** → `POST /api/streamdaw/checkout` creates a
   `streamdaw_orders` row (`SD-…` ref) and asks HYP to sign a pay page; the
   browser is sent to `pay.hyp.co.il`.
2. Buyer pays. HYP redirects to `/api/hyp/return` (same URL as Mutra). Because
   the ref starts `SD-`, `handleReturn` hands it to `streamdawReturn`.
3. `streamdawReturn` re-verifies with HYP's servers (`verifyReturn`), checks the
   amount against what we priced, then grants an `entitlements` row, mints a
   single-use `download_tokens` link, and emails it (Resend).
4. `/api/streamdaw/download?t=…` streams the installer from the private R2 bucket;
   a signed-in owner can re-download with no token from `/api/streamdaw/mine`.

Nothing is granted on the redirect alone — HYP has no webhook, so the return is
verified server-to-server first, exactly like the music side.

## Verified without a charge

`node scripts/stripe-test.mjs`… → now `scripts/hyp-test.mjs` in the StreamDAW
repo runs the whole chain on a real SQL engine with HYP simulated: 22/22 pass
(checkout signs, verified return grants + emails, idempotent retries, declined
grants nothing, amount-tamper rejected, emailed link serves the real .pkg,
owner re-download, stranger 403, unconfigured → 503).

## Updating the app build

```bash
# build + package (from the STREAMDAW repo)
scripts/package-macos.sh

# upload and register as the new latest
cd worker
SIZE=$(stat -f%z ../../STREAMDAW/dist/StreamDAW-X.Y.Z.pkg)
SHA=$(shasum -a 256 ../../STREAMDAW/dist/StreamDAW-X.Y.Z.pkg | cut -d' ' -f1)
npx wrangler r2 object put "snowstar-apps/streamdaw/StreamDAW-X.Y.Z.pkg" \
  --file ../../STREAMDAW/dist/StreamDAW-X.Y.Z.pkg --content-type application/octet-stream --remote
npx wrangler d1 execute snowstar-members --remote --command \
 "UPDATE app_releases SET is_latest=0 WHERE asset='streamdaw-macos';
  INSERT INTO app_releases (asset,version,r2_key,filename,bytes,sha256,is_latest,created_at)
  VALUES ('streamdaw-macos','X.Y.Z','streamdaw/StreamDAW-X.Y.Z.pkg','StreamDAW-X.Y.Z.pkg',$SIZE,'$SHA',1,strftime('%s','now'));"
```

## Reconciliation

HYP has no transaction-inquiry API. A buyer who closes the tab after paying
leaves a `streamdaw_orders` row stuck at `started`, and a charged-but-unverified
payment lands as `charged_unverified` (the owner is emailed). Check these
against the HYP portal report, same as the music `hyp_checkouts`.

## Still to do

- **Sign + notarize the installer** before a public launch (buyers currently
  right-click → Open once). `DEVELOPER_ID_APP=… DEVELOPER_ID_INSTALLER=… NOTARY_PROFILE=… scripts/package-macos.sh`.
- **Tax invoice**: the music side auto-issues one (`greeninvoice.js`); StreamDAW
  doesn't yet — add an `autoIssueInvoice`-style call in `streamdawReturn` when wanted.
- **Windows build** (VST3) for PC buyers.
- **Link the page** from the site nav / homepage when ready (it's live but unlinked).
- Stripe (USD, global) can be added later alongside HYP for non-Israeli buyers.
