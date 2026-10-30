-- Audioctor (2026-10-21): its orders, keys per Mac, Monthly subscriptions and their charges, and who took the trial.
-- StreamDAW's tables (schema-streamdaw*.sql) with every column they gained since, from the start; Audioctor's own,
-- so the two products never share a row. Shared with every product: users, entitlements (product 'audioctor'),
-- download_tokens, app_releases (asset 'audioctor-macos'), coupons (scope 'audioctor' or 'all', after its own), attempts, admin_log.
--   cd worker && npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-audioctor.sql)"
--   (not --file: on this login its import API answers "Authentication error 10000"; --command takes the query API)

CREATE TABLE IF NOT EXISTS audioctor_orders (
  ref            TEXT PRIMARY KEY,                  -- AD-XXXX, travels with the money as HYP Order
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  plan           TEXT NOT NULL DEFAULT 'lifetime',  -- lifetime | monthly
  amount         INTEGER NOT NULL,                  -- agorot incl VAT
  currency       TEXT NOT NULL DEFAULT 'ILS',
  status         TEXT NOT NULL DEFAULT 'started',   -- started | granting | granted | declined | verify_failed | charged_unverified
  coupon         TEXT,
  machine_id     TEXT,                              -- bought from inside the app: its Mac (AD…), keyed the moment it is paid
  owner_name     TEXT,
  hyp_id         TEXT,
  entitlement_id INTEGER REFERENCES entitlements(id),
  erased_at      INTEGER,
  created_at     INTEGER NOT NULL,
  settled_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_adorders_status ON audioctor_orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_adorders_email  ON audioctor_orders (email, created_at);

CREATE TABLE IF NOT EXISTS audioctor_activations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entitlement_id INTEGER REFERENCES entitlements(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,                     -- lowercased
  machine_id     TEXT NOT NULL,                     -- what Audioctor shows, e.g. AD89B53ADC0CD4963
  owner_name     TEXT,                              -- the name on the licence
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | issued | renewing | limit | deactivated | rejected
  key_text       TEXT,                              -- the key, kept so it can be shown and re-sent
  serial         TEXT,
  note           TEXT,
  expires_at     INTEGER,                           -- Monthly: the key's end (seconds); NULL: for good
  renew_code     TEXT,                              -- Monthly: what the app sends to fetch the next month's key
  requested_at   INTEGER NOT NULL,
  issued_at      INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_adact_ent_machine ON audioctor_activations (entitlement_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_adact_status  ON audioctor_activations (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_adact_machine ON audioctor_activations (machine_id);

CREATE TABLE IF NOT EXISTS audioctor_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  entitlement_id  INTEGER REFERENCES entitlements(id),
  first_ref       TEXT NOT NULL UNIQUE,              -- the AD- order that started it
  status          TEXT NOT NULL DEFAULT 'active',    -- active | past_due | cancelled | ended | replaced
  amount          INTEGER NOT NULL,                  -- agorot incl VAT, the same every month (fixed when it started)
  usd_cents       INTEGER NOT NULL DEFAULT 599,      -- what the page said ($5.99)
  fx_usd          REAL,
  token           TEXT,                              -- HYP's card token; NULL once it ends
  tmonth          TEXT,
  tyear           TEXT,
  holder_id       TEXT,
  card_last4      TEXT,
  started_at      INTEGER NOT NULL,
  periods         INTEGER NOT NULL DEFAULT 1,
  paid_through    INTEGER NOT NULL,                  -- Audioctor until then (the key runs 3 days longer)
  next_charge_at  INTEGER,
  attempts        INTEGER NOT NULL DEFAULT 0,
  charging_at     INTEGER,                           -- the lock; left set when HYP's answer never came
  last_error      TEXT,
  cancelled_at    INTEGER,
  cancel_via      TEXT,                              -- account | link | email | admin | upgrade
  cancel_when     TEXT,                              -- end | now
  refund_due      INTEGER,
  refund_status   TEXT,                              -- owed | refunded
  cancel_token_hash TEXT,
  cancel_token_exp  INTEGER,
  ended_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adsub_due   ON audioctor_subscriptions (status, next_charge_at);
CREATE INDEX IF NOT EXISTS idx_adsub_email ON audioctor_subscriptions (email, created_at);
CREATE INDEX IF NOT EXISTS idx_adsub_ent   ON audioctor_subscriptions (entitlement_id);

CREATE TABLE IF NOT EXISTS audioctor_sub_charges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id        INTEGER NOT NULL REFERENCES audioctor_subscriptions(id),
  period_no     INTEGER NOT NULL,
  attempt       INTEGER NOT NULL DEFAULT 1,
  ref           TEXT NOT NULL UNIQUE,                -- AD-… (the first) or ADR-… (a renewal: in HYP's Info and Fild1)
  amount        INTEGER NOT NULL,
  status        TEXT NOT NULL,                       -- charging | paid | declined | error | unknown
  period_start  INTEGER,
  period_end    INTEGER,
  hyp_id        TEXT,
  acode         TEXT,
  ccode         TEXT,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  settled_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_adsubch_try  ON audioctor_sub_charges (sub_id, period_no, attempt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_adsubch_paid ON audioctor_sub_charges (sub_id, period_no) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_adsubch_sub ON audioctor_sub_charges (sub_id, created_at);

-- Who took the 7-day trial installer (as streamdaw_free_downloads).
CREATE TABLE IF NOT EXISTS audioctor_free_downloads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  version     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adfree_ts   ON audioctor_free_downloads (created_at);
CREATE INDEX IF NOT EXISTS idx_adfree_user ON audioctor_free_downloads (user_id, created_at);

-- Audioctor's own discount codes (as streamdaw_coupons): never a music licence's. percent 1..100, or agorot off.
CREATE TABLE IF NOT EXISTS audioctor_coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'percent',      -- percent | amount
  value       INTEGER NOT NULL,
  min_amount  INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 0,           -- 0 = unlimited
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  INTEGER NOT NULL
);
