-- ═══════════ StreamDAW — app entitlements & downloads ═══════════
--
-- StreamDAW is Snowstar's first SOFTWARE product, and the first thing sold on a
-- basis other than a per-track music licence. It rides the same account
-- (users) so a buyer signs in once for Mutra, StreamDAW and whatever ships
-- next — but its "what you own" lives here, not in the music `licences` table,
-- because a licence is track-scoped and immutable-per-grant, and an app
-- entitlement is account-scoped and long-lived.
--
-- MONEY IS IN MINOR UNITS, AS INTEGER (USD cents here — Stripe's own unit),
-- never floats, same rule as the licensing schema uses for agorot.
--
-- The MODEL is deliberately open: `plan` is 'lifetime' for the recommended
-- one-time sale, but 'monthly'/'annual' + `expires_at` are here so a future
-- subscription (e.g. Snowstar-hosted relays) needs no migration.

-- ── what a buyer owns ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entitlements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- email is the DURABLE key: a purchase can arrive (Stripe webhook) before the
  -- buyer has ever signed in, so the entitlement is minted against the email and
  -- linked to a user row on first sign-in with that address.
  email       TEXT NOT NULL,                 -- stored lowercased
  product     TEXT NOT NULL DEFAULT 'streamdaw',
  plan        TEXT NOT NULL DEFAULT 'lifetime',  -- lifetime | monthly | annual
  status      TEXT NOT NULL DEFAULT 'active',    -- active | refunded | revoked
  source      TEXT NOT NULL DEFAULT 'hyp',       -- hyp | comp | stripe
  -- the gateway's own id for the purchase; UNIQUE so a webhook that Stripe
  -- retries (it will) can't grant the same thing twice.
  ext_ref     TEXT,
  amount      INTEGER,                        -- minor units actually charged, incl tax
  currency    TEXT NOT NULL DEFAULT 'usd',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,                        -- NULL = perpetual (a lifetime buy)
  revoked_at  INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_extref ON entitlements (ext_ref);
CREATE INDEX IF NOT EXISTS idx_ent_email   ON entitlements (email, product);
CREATE INDEX IF NOT EXISTS idx_ent_user    ON entitlements (user_id, product);

-- ── single-use download links emailed to the buyer ────────────────────────
-- We store only the HASH of the token, never the token itself — same posture
-- as password_resets: a database leak must not hand someone a live download
-- link. A signed-in owner can always re-download from their dashboard without
-- one of these; the token is only for the click-from-email path.
CREATE TABLE IF NOT EXISTS download_tokens (
  token_hash     TEXT PRIMARY KEY,
  entitlement_id INTEGER REFERENCES entitlements(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  product        TEXT NOT NULL DEFAULT 'streamdaw',
  asset          TEXT NOT NULL DEFAULT 'streamdaw-macos',  -- which build the link serves
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,           -- link good for a few days
  max_uses       INTEGER NOT NULL DEFAULT 5, -- a few re-taps (email preview bots, retries)
  uses           INTEGER NOT NULL DEFAULT 0,
  used_at        INTEGER                     -- last time it served a download
);
CREATE INDEX IF NOT EXISTS idx_dltok_ent ON download_tokens (entitlement_id);

-- ── a purchase in flight through HYP ───────────────────────────────────────
-- HYP (like the music side) has NO webhook: the only completion signal is the
-- buyer's browser landing back on /api/hyp/return, which is verified against
-- HYP's own servers before anything is granted. This row is created when the
-- pay page is signed, and settled (or not) when the return is verified — the
-- same reconciliation story as hyp_checkouts, kept separate so a software sale
-- and a music licence never share a table.
--
-- amount is agorot INCL VAT — what actually gets charged — matching how the
-- return's Amount field is compared. ex-VAT for the tax record is derived.
CREATE TABLE IF NOT EXISTS streamdaw_orders (
  ref         TEXT PRIMARY KEY,             -- SD-XXXX, travels with the money as HYP Order
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'lifetime',
  amount      INTEGER NOT NULL,             -- agorot incl VAT
  currency    TEXT NOT NULL DEFAULT 'ILS',
  status      TEXT NOT NULL DEFAULT 'started', -- started | granted | declined | verify_failed | charged_unverified
  hyp_id      TEXT,
  entitlement_id INTEGER REFERENCES entitlements(id),
  created_at  INTEGER NOT NULL,
  settled_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sdorders_status ON streamdaw_orders (status, created_at);

-- ── the installers themselves ──────────────────────────────────────────────
-- One row per released build so the download route can serve "latest" without
-- a redeploy, and so an older buyer can be handed exactly what they paid into.
-- The bytes live in R2 (private bucket), not here — this is just the manifest.
CREATE TABLE IF NOT EXISTS app_releases (
  asset       TEXT NOT NULL,                 -- 'streamdaw-macos'
  version     TEXT NOT NULL,                 -- '0.1.0'
  r2_key      TEXT NOT NULL,                 -- object key in the private apps bucket
  filename    TEXT NOT NULL,                 -- what the browser saves it as
  bytes       INTEGER,
  sha256      TEXT,                          -- integrity, shown on the receipt
  notarized   INTEGER NOT NULL DEFAULT 0,
  is_latest   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (asset, version)
);
