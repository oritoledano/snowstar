-- StreamDAW free download, behind a Snowstar account (2026-10-13).
-- One row per installer served by GET /api/streamdaw/download/free: who took it and which build.
-- The account is the only personal data, and it is held by id (users.email is the join), so
-- clearing an account forgets its rows: ON DELETE SET NULL, and reset.js sweeps by id as well.
-- req_log keeps a fortnight; this table is the history.
--
-- Apply once, from worker/ (before or after the Worker deploy: the insert is soft):
--   npx wrangler d1 execute snowstar-members --remote --file=schema-streamdaw-free-downloads.sql
CREATE TABLE IF NOT EXISTS streamdaw_free_downloads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  version     TEXT,                          -- app_releases.version served
  created_at  INTEGER NOT NULL               -- epoch seconds
);
CREATE INDEX IF NOT EXISTS idx_sdfree_ts   ON streamdaw_free_downloads (created_at);
CREATE INDEX IF NOT EXISTS idx_sdfree_user ON streamdaw_free_downloads (user_id, created_at);
