-- StreamDAW remote updates (2026-10-15): signed relay + pages bundles, and the word on each app
-- version. Read by GET /api/streamdaw/update (src/streamdaw-updates.js), which every StreamDAW app
-- asks at launch and once a day; written by scripts/publish-bundle.sh (a bundle) and the dashboard
-- (StreamDAW > App > Updates: pull a bundle, mark an app version nag or dangerous).
--
--   npx wrangler d1 execute snowstar-members --remote --file schema-streamdaw-updates.sql
CREATE TABLE IF NOT EXISTS streamdaw_bundles (
  version          TEXT PRIMARY KEY,               -- UTC stamp YYYY.MMDD.HHMM, made by publish-bundle.sh (never typed)
  min_app_version  TEXT NOT NULL,                  -- the oldest app this relay may run under
  sha256           TEXT NOT NULL,                  -- of the .tgz; the app also checks the Ed25519 signature inside it
  bytes            INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,                           -- what changed, shown to the host
  r2_key           TEXT NOT NULL,                  -- in snowstar-apps (APPS): streamdaw/bundles/<version>.tgz
  status           TEXT NOT NULL DEFAULT 'active', -- 'active' | 'pulled' (every app stops using a pulled one)
  created_at       INTEGER NOT NULL,               -- unix seconds
  pulled_at        INTEGER
);
-- The word on an app version (the .pkg people installed). No row = 'ok'.
CREATE TABLE IF NOT EXISTS streamdaw_app_versions (
  version     TEXT PRIMARY KEY,                    -- 0.5.8
  policy      TEXT NOT NULL DEFAULT 'ok',          -- 'ok' | 'nag' (a stronger banner) | 'dangerous' (GO LIVE refused)
  message     TEXT,                                -- shown with nag / dangerous
  notes       TEXT,                                -- "what's new", shown while this version is the latest
  updated_at  INTEGER NOT NULL
);
-- Which versions are out there: one row per install, from the update check. The id is random, made
-- by the app for this alone (never the machine id or the live link's id); no IP is kept. Rows unseen
-- for 180 days go (daily cron).
CREATE TABLE IF NOT EXISTS streamdaw_update_installs (
  install_id      TEXT PRIMARY KEY,                -- 32 hex characters
  app_version     TEXT NOT NULL,
  bundle_version  TEXT,                            -- the relay + pages it runs ('0' = the app's own, from before stamps)
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  checks          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS streamdaw_update_installs_seen ON streamdaw_update_installs (last_seen);
-- A bundle that crashed at start twice on a Mac (the app rolled back by itself), said once per install.
CREATE TABLE IF NOT EXISTS streamdaw_bundle_bad (
  version     TEXT NOT NULL,
  install_id  TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (version, install_id)
);
