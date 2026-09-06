-- ═══════════ Snowstash — royalty scans, reports, coupons ═══════════
--
-- Runs inside the same Worker + D1 as Mutra and StreamDAW, so a scan costs
-- nothing beyond the plan already being paid for: no new server, no container,
-- no egress. Auth, sessions, HYP and Green Invoice are all reused as-is.
--
-- Coupons sit in their OWN table, the same way StreamDAW's do: a free-report
-- code must never redeem a music licence or a software licence. Only the pure
-- discount MATH is shared from coupons.js.

CREATE TABLE IF NOT EXISTS snowstash_scans (
  id          TEXT PRIMARY KEY,               -- short id, used in the report URL
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  artist_name TEXT NOT NULL,
  mbid        TEXT,                            -- confirmed MusicBrainz artist
  kind        TEXT NOT NULL DEFAULT 'artist',  -- artist | catalog
  status      TEXT NOT NULL DEFAULT 'running', -- running | complete | error
  error       TEXT,
  result_json TEXT,
  health      INTEGER,
  claimable   INTEGER,
  attention   INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stash_scans_user ON snowstash_scans (user_id, created_at DESC);

-- An unlocked report. One row per scan that has been paid for (or granted).
CREATE TABLE IF NOT EXISTS snowstash_unlocks (
  scan_id     TEXT PRIMARY KEY REFERENCES snowstash_scans(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  source      TEXT NOT NULL,                   -- paid | coupon | granted
  ref         TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snowstash_orders (
  ref         TEXT PRIMARY KEY,                -- ST-XXXX, travels with the money as HYP Order
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  scan_id     TEXT REFERENCES snowstash_scans(id),
  amount      INTEGER NOT NULL,                -- agorot incl VAT
  currency    TEXT NOT NULL DEFAULT 'ILS',
  status      TEXT NOT NULL DEFAULT 'started', -- started | granted | declined | verify_failed | charged_unverified
  hyp_id      TEXT,
  coupon      TEXT,
  created_at  INTEGER NOT NULL,
  settled_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_storders_status ON snowstash_orders (status, created_at);

CREATE TABLE IF NOT EXISTS snowstash_coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,            -- stored upper-cased, ambiguous glyphs avoided
  kind        TEXT NOT NULL DEFAULT 'percent', -- percent | amount
  value       INTEGER NOT NULL,                -- percent 1..100, or agorot off
  min_amount  INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,                          -- epoch seconds, NULL = never
  active      INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

-- The service code: 100% off, unlimited, never expires. Hand it to an artist
-- and their full report is free; the checkout skips HYP entirely because a
-- card gateway refuses a zero authorisation.
INSERT OR IGNORE INTO snowstash_coupons (code, kind, value, min_amount, max_uses, used, expires_at, active, note, created_at)
VALUES ('STASH-FREE', 'percent', 100, 0, 0, 0, NULL, 1, 'Service code — full report on the house', strftime('%s','now'));
