-- StreamDAW live links (2026-10-13, "stream without you", phase 2): https://snowstar.company/live/<id>
-- follows a Mac's quick tunnel (https://<words>.trycloudflare.com, new at every start of the tunnel),
-- so the link and QR code people keep survive a restart. Written by the Mac's relay through
-- POST /api/streamdaw/live/register (src/streamdaw.js, streamdawLiveRegister); read by /live/<id>.
--
-- No account behind a row. The relay makes the id and a secret on its first run; the first
-- registration claims the id, and after that only the same secret from the same machine moves it.
--
--   npx wrangler d1 execute snowstar-members --remote --file schema-streamdaw-live.sql
CREATE TABLE IF NOT EXISTS streamdaw_live (
  id            TEXT PRIMARY KEY,               -- 10 characters [a-hjkmnp-z2-9], made on the Mac
  secret_hash   TEXT NOT NULL,                  -- sha256 (base64) of the Mac's secret; the secret itself is never kept
  machine_hash  TEXT NOT NULL,                  -- sha256 hex of "streamdaw-live:" + the licence machine id (made on the Mac)
  url           TEXT,                           -- https://<name>.trycloudflare.com now; NULL = off air
  url_at        INTEGER,                        -- when that address was registered (unix seconds)
  status        TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'blocked' (set by hand: abuse)
  app_version   TEXT,
  relay_version TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,               -- the last registration; rows unseen for 180 days go (daily cron)
  ip_hash       TEXT                            -- sha256 of the last registering IP, truncated: rate limits and abuse only
);
CREATE INDEX IF NOT EXISTS streamdaw_live_updated ON streamdaw_live (updated_at);
