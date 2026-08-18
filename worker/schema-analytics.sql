-- Visitor journey + track-play analytics.
--
-- Privacy: we never store raw IPs or any fingerprint. A visit is identified only
-- by a random id the browser keeps for the current tab session, so it can't be
-- linked to a person or followed across sessions. Location is coarse (country
-- code from Cloudflare's edge) and referrers are reduced to the sending host.

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,          -- random, per browser-tab session
  type       TEXT NOT NULL,          -- view | play | license | search | favorite
  detail     TEXT,                   -- track slug, path, or search term
  page       TEXT,                   -- pathname only (no query string)
  country    TEXT,                   -- coarse geo from CF, e.g. "IL"
  referrer   TEXT,                   -- sending host only, e.g. "google.com"
  ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(type, ts);

-- One row per visit, so "who's on the site and what did they do" is one cheap read.
CREATE TABLE IF NOT EXISTS sessions_seen (
  session_id  TEXT PRIMARY KEY,
  first_ts    INTEGER NOT NULL,
  last_ts     INTEGER NOT NULL,
  country     TEXT,
  referrer    TEXT,
  views       INTEGER NOT NULL DEFAULT 0,
  plays       INTEGER NOT NULL DEFAULT 0,
  licenses    INTEGER NOT NULL DEFAULT 0,
  notified    INTEGER NOT NULL DEFAULT 0   -- alert already emailed for this visit
);
CREATE INDEX IF NOT EXISTS idx_seen_last ON sessions_seen(last_ts);

-- Small key/value for counters the alerting needs (e.g. today's email count).
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- Only accounts flagged here can read the stats API.
ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;

-- Listen duration (seconds actually heard, from a 'play_end' event) and the
-- signed-in visitor's user_id (resolved server-side from their session
-- cookie, never from the client beacon) — both nullable, since most events
-- are anonymous views/plays with no duration to report.
ALTER TABLE events ADD COLUMN duration INTEGER;
ALTER TABLE events ADD COLUMN user_id TEXT;
