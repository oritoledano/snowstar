-- StreamDAW Pro Monthly (2026-10-14, Ori): every Pro feature for $8.99 a month, charged in
-- shekels, renewing every month until cancelled. worker/src/streamdaw-subs.js.
--
-- How it bills: the first month is paid on HYP's own page (the usual SD- order, verified on the
-- return); its transaction then gives a card TOKEN (HYP action=getToken), and the Worker's daily
-- cron charges that token server to server (action=soft) on the day each month runs out. HYP
-- answers each charge in the same reply, so a renewal key is minted only for money that came in.
-- No card number is ever stored here: only HYP's 19-digit token and the card's expiry, which HYP
-- needs with it.
--
-- Apply once (wrangler's --file import fails on this login; --command works):
--   npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-streamdaw-subscriptions.sql)"

CREATE TABLE IF NOT EXISTS streamdaw_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,                     -- lowercased; the account's
  entitlement_id  INTEGER REFERENCES entitlements(id),
  first_ref       TEXT NOT NULL UNIQUE,              -- the SD- order that started it (a retried return finds it)
  status          TEXT NOT NULL DEFAULT 'active',    -- active | past_due | cancelled | ended | replaced
  amount          INTEGER NOT NULL,                  -- agorot incl VAT, the same every month (fixed when it started)
  usd_cents       INTEGER NOT NULL DEFAULT 899,      -- what the page said ($8.99)
  fx_usd          REAL,                              -- the day's rate it was priced at (dollars per shekel)
  token           TEXT,                              -- HYP's card token; NULL once it ends
  tmonth          TEXT,                              -- the card's expiry (from HYP's Tokef, YYMM), sent with every charge
  tyear           TEXT,
  holder_id       TEXT,                              -- the ID number typed on HYP's page (HYP asks for it with a token charge); 000000000 when none
  card_last4      TEXT,
  started_at      INTEGER NOT NULL,                  -- seconds; every month is counted from here (the 31st stays the 31st)
  periods         INTEGER NOT NULL DEFAULT 1,        -- months paid for
  paid_through    INTEGER NOT NULL,                  -- seconds: Pro until then (the key runs 3 days longer)
  next_charge_at  INTEGER,                           -- NULL: nothing more will be charged
  attempts        INTEGER NOT NULL DEFAULT 0,        -- failed tries for the month that is due (3 retries over 7 days)
  charging_at     INTEGER,                           -- a charge in flight: the lock. Left set when HYP's answer never came
  last_error      TEXT,
  cancelled_at    INTEGER,
  cancel_via      TEXT,                              -- account | link | email | admin | upgrade
  cancel_when     TEXT,                              -- end (Pro to the end of the paid month) | now (refund of the unused days)
  refund_due      INTEGER,                           -- agorot owed back (cancel now); the owner refunds in HYP
  refund_status   TEXT,                              -- owed | refunded
  cancel_token_hash TEXT,                            -- a signed-out "cancel by email" link (sha256), one at a time
  cancel_token_exp  INTEGER,
  ended_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sdsub_due   ON streamdaw_subscriptions (status, next_charge_at);
CREATE INDEX IF NOT EXISTS idx_sdsub_email ON streamdaw_subscriptions (email, created_at);
CREATE INDEX IF NOT EXISTS idx_sdsub_ent   ON streamdaw_subscriptions (entitlement_id);

-- One row per charge: the first month (paid on HYP's page) and every renewal try.
CREATE TABLE IF NOT EXISTS streamdaw_sub_charges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id        INTEGER NOT NULL REFERENCES streamdaw_subscriptions(id),
  period_no     INTEGER NOT NULL,                    -- 1 = the first month, 2, 3 …
  attempt       INTEGER NOT NULL DEFAULT 1,
  ref           TEXT NOT NULL UNIQUE,                -- SD-… (the first) or SDR-… (a renewal: sent to HYP in Info and Fild1)
  amount        INTEGER NOT NULL,                    -- agorot incl VAT
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_sdsubch_try  ON streamdaw_sub_charges (sub_id, period_no, attempt);
-- Never two paid charges for the same month of the same subscription.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sdsubch_paid ON streamdaw_sub_charges (sub_id, period_no) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_sdsubch_sub ON streamdaw_sub_charges (sub_id, created_at);

-- The app fetches its renewed key by itself (POST /api/streamdaw/licence/refresh): this Mac's
-- machine id + a secret handed out with the first key (the "Renewal:" line under the key).
-- Kept as is, like key_text beside it: it only ever fetches that row's key, for that one Mac.
ALTER TABLE streamdaw_activations ADD COLUMN renew_code TEXT;
CREATE INDEX IF NOT EXISTS idx_sdact_machine ON streamdaw_activations (machine_id);
