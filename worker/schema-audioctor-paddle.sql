-- Audioctor through Paddle (2026-10-27, audioctor-paddle.js): run once, after schema-audioctor.sql.
--   cd worker && npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-audioctor-paddle.sql)"
-- An order keeps its Paddle transaction (txn_…); every webhook event is recorded once (Paddle retries until it hears 200).

ALTER TABLE audioctor_orders ADD COLUMN paddle_txn TEXT;
CREATE INDEX IF NOT EXISTS idx_adord_paddle ON audioctor_orders (paddle_txn);

CREATE TABLE IF NOT EXISTS audioctor_paddle_events (
  event_id    TEXT PRIMARY KEY,                 -- evt_…
  type        TEXT NOT NULL,                    -- transaction.completed | adjustment.created | adjustment.updated | …
  outcome     TEXT,                             -- granted | already | item mismatch | refunded | ignored | …
  received_at INTEGER NOT NULL
);
