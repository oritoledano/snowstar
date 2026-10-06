-- ═══════════ StreamDAW: stream health and usage (the dashboard's Health monitor) ═══════════
--
-- Written by the relay on each StreamDAW user's Mac (server/telemetry.js in the StreamDAW
-- repo), every 30 s while a stream is on air, and once more when it ends. Nothing here can
-- name a person: ids are hashes, never a session name, a listener's name or an address.
--
-- Apply once:  npx wrangler d1 execute snowstar-members --remote --file=schema-streamdaw-telemetry.sql
--
-- D1's free plan writes 100,000 rows a day. A stream costs 2 rows per heartbeat (its row
-- and one sample): 240 an hour, so ~400 stream-hours a day before the $5 plan is needed.

-- one row per stream (a Mac + a session name), its LATEST heartbeat
CREATE TABLE IF NOT EXISTS sd_streams (
  id              TEXT PRIMARY KEY,           -- sha256(machine|session), 16 hex
  machine         TEXT,                       -- sha256 of the licence's machine id, 16 hex
  app             TEXT,                       -- StreamDAW version on that Mac
  relay           TEXT,                       -- relay version
  tier            TEXT,                       -- free | trial | pro
  state           TEXT NOT NULL,              -- live | grace | idle | ended
  on_air          INTEGER NOT NULL DEFAULT 0,
  ended           TEXT,                       -- why it ended (the relay's words)
  first_at        INTEGER NOT NULL,           -- ms, first heartbeat of this sitting
  last_at         INTEGER NOT NULL,           -- ms, the latest heartbeat
  on_air_sec      INTEGER,
  connected_sec   INTEGER,                    -- time with at least one person connected
  listeners       INTEGER,
  peak            INTEGER,
  mode            TEXT,                       -- inEar | live
  source          TEXT,                       -- stems | plugin
  tracks          INTEGER,
  a_jitter_ms     REAL,                       -- audio: mean arrival jitter across people
  a_jitter_max_ms REAL,
  a_loss_pct      REAL,                       -- audio: worst person's packet loss
  a_underruns     INTEGER,                    -- audio: underruns, all people
  a_kbps          INTEGER,                    -- audio: what reaches everyone, together
  a_margin_min_ms INTEGER,                    -- audio: the thinnest buffer anyone holds
  v_fps           REAL,                       -- video: mean frames per second
  v_dropped       INTEGER,                    -- video: frames dropped, all people, since they joined
  v_lost_pct      REAL,                       -- video: worst packet loss
  v_kbps          INTEGER,
  people          TEXT                        -- JSON, the latest per-person health (at most 50)
);
CREATE INDEX IF NOT EXISTS idx_sd_streams_last ON sd_streams(last_at);
CREATE INDEX IF NOT EXISTS idx_sd_streams_machine ON sd_streams(machine);

-- one row per stream per heartbeat (10 s buckets), for the graphs; kept 14 days
CREATE TABLE IF NOT EXISTS sd_samples (
  stream_id   TEXT NOT NULL,
  at          INTEGER NOT NULL,               -- ms, rounded down to 10 s
  on_air      INTEGER,
  listeners   INTEGER,
  a_jitter_ms REAL,
  a_loss_pct  REAL,
  a_underruns INTEGER,
  a_kbps      INTEGER,
  v_fps       REAL,
  v_dropped   INTEGER,
  v_kbps      INTEGER,
  PRIMARY KEY (stream_id, at)
);
CREATE INDEX IF NOT EXISTS idx_sd_samples_at ON sd_samples(at);

-- one row per sitting, when it ends: how long people were really connected, how many, on
-- what, which features (the relay's usage record, kept whole in `record`)
CREATE TABLE IF NOT EXISTS sd_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  at                INTEGER NOT NULL,         -- ms, when it arrived
  machine           TEXT,
  app               TEXT,
  tier              TEXT,
  minutes_on_air    REAL,
  minutes_connected REAL,
  peak              INTEGER,
  devices           INTEGER,
  free_limit_hit    INTEGER,
  record            TEXT                      -- JSON, the whole record
);
CREATE INDEX IF NOT EXISTS idx_sd_usage_at ON sd_usage(at);
CREATE INDEX IF NOT EXISTS idx_sd_usage_machine ON sd_usage(machine);
