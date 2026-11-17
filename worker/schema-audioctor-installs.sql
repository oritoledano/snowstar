-- Every Mac that runs Audioctor (0.1.13+), from its daily update check (worker/src/audioctor/audioctor.js countInstall).
-- machine_hash: the first 16 hex of SHA-256 of the app's machine ID; the ID itself is never sent.
CREATE TABLE IF NOT EXISTS audioctor_installs (
  machine_hash TEXT PRIMARY KEY,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  app_version  TEXT,
  arch         TEXT,
  os           TEXT,
  plan         TEXT,
  country      TEXT,
  checks       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS audioctor_installs_first ON audioctor_installs (first_seen);

-- Audioctor's App Store subscriptions, from Apple's server notifications (worker/src/audioctor/audioctor-appstore.js).
CREATE TABLE IF NOT EXISTS appstore_events (
  uuid                    TEXT PRIMARY KEY,
  received_at             INTEGER NOT NULL,
  type                    TEXT,
  subtype                 TEXT,
  environment             TEXT,
  bundle_id               TEXT,
  original_transaction_id TEXT,
  transaction_id          TEXT,
  product_id              TEXT,
  signed_date             INTEGER,
  payload                 TEXT
);
CREATE INDEX IF NOT EXISTS appstore_events_received ON appstore_events (received_at);
CREATE TABLE IF NOT EXISTS appstore_subs (
  original_transaction_id TEXT PRIMARY KEY,
  environment             TEXT,
  bundle_id               TEXT,
  product_id              TEXT,
  first_purchase          INTEGER,
  purchase_date           INTEGER,
  expires_date            INTEGER,
  price                   INTEGER,
  currency                TEXT,
  storefront              TEXT,
  auto_renew              INTEGER,
  status                  TEXT,
  last_type               TEXT,
  last_subtype            TEXT,
  app_account_token       TEXT,
  updated_at              INTEGER NOT NULL
);
