-- StreamDAW: a Mac tied to the Snowstar account that runs it (2026-10-15; src/streamdaw-macs.js).
-- The app opens /apps/streamdaw-connect.html at its first start; the signed-in page posts the Mac's
-- machine ID here. machine_hash = the relay's label on stream health and usage (sha256 hex, 16 chars),
-- so the dashboard can show a trial user's sittings under their name. One row per Mac.
--
--   npx wrangler d1 execute snowstar-members --remote --file schema-streamdaw-macs.sql
CREATE TABLE IF NOT EXISTS streamdaw_macs (
  machine_id    TEXT PRIMARY KEY,                 -- SD + 12-20 hex (the licence's machine ID)
  machine_hash  TEXT NOT NULL,                    -- sha256(machine_id) hex, first 16: sd_streams.machine, sd_usage.machine
  user_id       TEXT NOT NULL,                    -- users.id: the last account to connect this Mac
  app_version   TEXT,
  linked_at     INTEGER NOT NULL,                 -- unix seconds: first linked to this account
  seen_at       INTEGER NOT NULL                  -- unix seconds: last linked (again)
);
CREATE INDEX IF NOT EXISTS streamdaw_macs_user ON streamdaw_macs (user_id);
CREATE INDEX IF NOT EXISTS streamdaw_macs_hash ON streamdaw_macs (machine_hash);
