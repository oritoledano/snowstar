-- ═══════════ Snowstash — connected catalogue + registration checklist ═══════
--
-- A name search can only be as deep as the open databases, and for an
-- independent artist that is usually two or three recordings. The catalogue is
-- the fix: the artist attaches what they ACTUALLY released — from a streaming
-- profile, a distributor export, a society export, or by hand — and the radar
-- scans that instead of guessing.
--
-- Rows carry an ISRC (the recording) and/or an ISWC (the work), because the
-- two sides of the catalogue arrive from different places: distributors know
-- ISRCs, societies know ISWCs. A row with only one of them is itself a
-- finding — an ISWC with no ISRC is a work nobody can match to a recording.

CREATE TABLE IF NOT EXISTS snowstash_catalog (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  artist_name TEXT,
  isrc        TEXT,
  iswc        TEXT,
  writers     TEXT,                            -- JSON array of names
  source      TEXT NOT NULL,                   -- deezer | csv | acum | manual | mutra
  rank        INTEGER,                          -- Deezer popularity, when known
  added_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stash_cat_user ON snowstash_catalog (user_id, added_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stash_cat_isrc ON snowstash_catalog (user_id, isrc) WHERE isrc IS NOT NULL;

-- The six streams, ticked off per user. Societies publish no membership API, so
-- the honest signal is what the artist tells us plus what their identifiers imply.
CREATE TABLE IF NOT EXISTS snowstash_registrations (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  status      TEXT NOT NULL,                    -- done | dismissed
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
