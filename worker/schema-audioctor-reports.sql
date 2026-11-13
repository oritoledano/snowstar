-- Audioctor problem reports (2026-11-13).
--
-- StreamDAW has had a way to say "this went wrong" from inside the app since
-- October, and three reports are sitting in it. Audioctor had no such channel
-- at all: a buyer who hit trouble had nothing but the address in the footer,
-- and nothing a dashboard could show.
--
-- Deliberately the same shape as streamdaw_reports rather than a shared table
-- with an app column: that table is live and populated, and a migration on it
-- to gain one column is more risk than a second table is cost. The two are
-- read side by side in the dashboard, which is where they need to agree.
CREATE TABLE IF NOT EXISTS audioctor_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL DEFAULT 'app',   -- app | web | console
  email      TEXT,                          -- only if they want an answer
  body       TEXT NOT NULL,
  context    TEXT,                          -- JSON: version, OS, what it was doing
  ip_hash    TEXT,                          -- a keyed tag for rate limiting, never the address
  status     TEXT NOT NULL DEFAULT 'new',   -- new | seen | closed
  created_at INTEGER NOT NULL
);

-- The dashboard opens on the unread ones and the rate limiter asks by tag and
-- hour; both read this rather than scanning the table.
CREATE INDEX IF NOT EXISTS audioctor_reports_status ON audioctor_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS audioctor_reports_ip ON audioctor_reports (ip_hash, created_at);
