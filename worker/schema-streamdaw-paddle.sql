-- StreamDAW through Paddle (2026-10-29): worker/src/streamdaw-paddle.js.
-- Apply once (wrangler's --file import fails on this login; --command works):
--   npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-streamdaw-paddle.sql)"

-- What Paddle handed out, per environment (sandbox | live): product:<id>, price:<id>:<month|year>, webhook_id, webhook_secret.
CREATE TABLE IF NOT EXISTS streamdaw_paddle_conf (
  env         TEXT NOT NULL,
  k           TEXT NOT NULL,
  v           TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (env, k)
);

-- One row per Paddle subscription: its plan, the entitlement it keeps alive, and the end of the period paid for.
CREATE TABLE IF NOT EXISTS streamdaw_paddle_subs (
  sub_id          TEXT PRIMARY KEY,                -- sub_…
  env             TEXT NOT NULL,
  user_id         TEXT,
  email           TEXT NOT NULL,
  customer_id     TEXT,                            -- ctm_… (the portal opens on it)
  plan            TEXT NOT NULL,                   -- splits:month, all:year …
  status          TEXT NOT NULL DEFAULT 'active',  -- Paddle's: active | past_due | paused | canceled | trialing
  entitlement_id  INTEGER REFERENCES entitlements(id),
  period_end      INTEGER,                         -- seconds: paid through (the key runs 3 days longer)
  next_billed_at  INTEGER,
  cancel_at       INTEGER,                         -- a cancel to come at the period's end, or when it ended
  first_ref       TEXT,                            -- our SD- order
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sdpad_email ON streamdaw_paddle_subs (email);
CREATE INDEX IF NOT EXISTS idx_sdpad_ent   ON streamdaw_paddle_subs (entitlement_id);

-- Each webhook event once (Paddle retries).
CREATE TABLE IF NOT EXISTS streamdaw_paddle_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT,
  received_at  INTEGER NOT NULL
);

-- Codes: for which products, for how many payments (or months, for a free code), new customers only; the Paddle
-- discount behind a %/$ code.
ALTER TABLE streamdaw_coupons ADD COLUMN months INTEGER NOT NULL DEFAULT 0;
ALTER TABLE streamdaw_coupons ADD COLUMN products TEXT NOT NULL DEFAULT '';
ALTER TABLE streamdaw_coupons ADD COLUMN first_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE streamdaw_coupons ADD COLUMN paddle_discount_id TEXT;
ALTER TABLE streamdaw_coupons ADD COLUMN paddle_env TEXT;
