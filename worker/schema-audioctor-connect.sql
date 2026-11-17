-- Audioctor's "Sign in" from the app (2026-11-17, worker/src/audioctor/audioctor-connect.js).
-- One row per sign-in the app starts: the app's secret (poll), the page's public id (page), the code both show
-- (short), the Mac, and once approved on the site, the account. Rows past their end are useless and may be cleared.
CREATE TABLE IF NOT EXISTS audioctor_connect (
  poll        TEXT PRIMARY KEY,
  page        TEXT NOT NULL UNIQUE,
  short       TEXT NOT NULL,
  machine_id  TEXT NOT NULL,
  mac_name    TEXT,
  app_version TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_id     TEXT,
  email       TEXT,
  approved_at INTEGER,
  done_at     INTEGER
);
CREATE INDEX IF NOT EXISTS audioctor_connect_machine ON audioctor_connect (machine_id);
