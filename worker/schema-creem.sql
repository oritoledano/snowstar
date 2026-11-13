-- Creem, the merchant of record for StreamDAW and Audioctor (2026-11-11; src/creem.js). Run once per database:
--   npx wrangler d1 execute snowstar-members --remote --file=schema-creem.sql
-- The apps' own rows go in the two subscription tables, tagged env 'creem-test' / 'creem-live'.

CREATE TABLE IF NOT EXISTS creem_conf (
  env         TEXT NOT NULL,                    -- creem-test | creem-live
  k           TEXT NOT NULL,                    -- product:<app>:<plan> | webhook_id | webhook_secret | discount:<app>:<CODE> | lock:<app>
  v           TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (env, k)
);

CREATE TABLE IF NOT EXISTS creem_events (
  event_id    TEXT PRIMARY KEY,                 -- evt_…
  type        TEXT NOT NULL,                    -- checkout.completed | subscription.paid | refund.created | …
  app         TEXT,                             -- audioctor | streamdaw | NULL (not ours)
  outcome     TEXT,                             -- granted | renewed | already | refunded | not ours | …
  received_at INTEGER NOT NULL
);
