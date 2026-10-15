-- StreamDAW TURN for customers' Macs (2026-10-15). A Mac's relay asks POST /api/streamdaw/turn with its
-- live link (streamdaw_live: id + secret + machine); the Worker makes Cloudflare TURN credentials for that
-- Mac from Ori's keys (Worker secrets STREAMDAW_TURN_KEY_ID + STREAMDAW_TURN_API_TOKEN) and keeps them
-- here, so the same Mac gets the same ones again while they have 9 h or more left (src/streamdaw.js,
-- streamdawTurn). Rows past their end go in the daily cron.
--
-- Abuse: revoke one Mac's credentials by hand with the username below
--   (POST https://rtc.live.cloudflare.com/v1/turn/keys/<key id>/credentials/<username>/revoke),
--   and block its link: UPDATE streamdaw_live SET status = 'blocked' WHERE id = '…'.
--
--   npx wrangler d1 execute snowstar-members --remote --file schema-streamdaw-turn.sql
CREATE TABLE IF NOT EXISTS streamdaw_turn (
  id          TEXT PRIMARY KEY,                 -- streamdaw_live.id
  ice_json    TEXT NOT NULL,                    -- the iceServers handed to that Mac (port 53 dropped)
  username    TEXT,                             -- Cloudflare's username for them: what a revoke needs
  expires_at  INTEGER NOT NULL,                 -- unix seconds: their end
  minted_at   INTEGER NOT NULL,
  mints       INTEGER NOT NULL DEFAULT 1        -- how many times new ones were made for this Mac
);
CREATE INDEX IF NOT EXISTS streamdaw_turn_expires ON streamdaw_turn (expires_at);
