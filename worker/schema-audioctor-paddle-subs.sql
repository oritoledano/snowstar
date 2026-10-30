-- Audioctor's subscriptions through Paddle (2026-10-30): worker/src/audioctor-paddle.js, as schema-streamdaw-paddle.sql.
-- Apply once (wrangler's --file import fails on this login; --command works):
--   npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-audioctor-paddle-subs.sql)"

-- What Paddle handed out, per environment (sandbox | live): product, price:<monthly|year>, webhook_id, webhook_secret, discount:<code>.
CREATE TABLE IF NOT EXISTS audioctor_paddle_conf (
  env         TEXT NOT NULL,
  k           TEXT NOT NULL,
  v           TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (env, k)
);

-- One row per Paddle subscription: its plan, the entitlement it keeps alive, and the end of the period paid for.
CREATE TABLE IF NOT EXISTS audioctor_paddle_subs (
  sub_id          TEXT PRIMARY KEY,                -- sub_…
  env             TEXT NOT NULL,
  user_id         TEXT,
  email           TEXT NOT NULL,
  customer_id     TEXT,                            -- ctm_… (the portal opens on it)
  plan            TEXT NOT NULL,                   -- monthly | year
  status          TEXT NOT NULL DEFAULT 'active',  -- Paddle's: active | past_due | paused | canceled | trialing
  entitlement_id  INTEGER REFERENCES entitlements(id),
  period_end      INTEGER,                         -- seconds: paid through (the key runs 3 days longer)
  next_billed_at  INTEGER,
  cancel_at       INTEGER,                         -- a cancel to come at the period's end, or when it ended
  first_ref       TEXT,                            -- our AD- order
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adpad_email ON audioctor_paddle_subs (email);
CREATE INDEX IF NOT EXISTS idx_adpad_ent   ON audioctor_paddle_subs (entitlement_id);
