-- Privacy (2026-10-14): what the published privacy policy promises, in the database.
--
-- Goes with the Worker change of the same day (crypto.js ipTag, reset.js erasePerson,
-- retention.js, streamdaw-telemetry.js). Apply ONCE, AFTER that Worker is deployed (so the
-- raw addresses the old Worker writes until then are cleared too). From worker/:
--   npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-privacy-2026-10-14.sql)"
-- (the --file import fails on this login; --command works, as for schema-streamdaw-order-machine.sql).
-- The two ALTERs fail harmlessly if they were already applied: run the rest on its own then.

-- 1. An erased person's orders stay for tax, stripped of the person, marked here. retention.js
--    deletes them 7 years after the end of their tax year. Until this runs, erasePerson strips
--    them without the mark (and they are then kept, not deleted after 7 years).
ALTER TABLE streamdaw_orders ADD COLUMN erased_at INTEGER;
ALTER TABLE snowstash_orders ADD COLUMN erased_at INTEGER;

-- 2. Two tables that exist only in D1 (made by hand; no DDL was checked in). Written down
--    from the code that uses them (mail.js, reset.js) so a fresh database and the tests have
--    them. IF NOT EXISTS: the live ones are left exactly as they are.
CREATE TABLE IF NOT EXISTS user_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,                  -- lowercased recipient
  user_id     TEXT,
  department  TEXT,
  subject     TEXT,
  body        TEXT,                           -- up to 20,000 characters; kept 2 years (retention.js)
  sent_at     INTEGER NOT NULL,               -- unix seconds
  provider_id TEXT,
  read_at     INTEGER
);
CREATE TABLE IF NOT EXISTS people_archive (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  artist_name TEXT,
  source      TEXT,
  first_seen  INTEGER,
  archived_at INTEGER,
  reason      TEXT,
  had         TEXT
);

-- 3. Addresses already stored: raw IPs and unsalted (reversible) IP hashes. New rows carry keyed
--    tags (crypto.js ipTag). Clearing these only resets rate-limit counts.
UPDATE streamdaw_reports SET ip_hash = NULL WHERE ip_hash IS NOT NULL;
UPDATE streamdaw_live SET ip_hash = NULL WHERE ip_hash IS NOT NULL;
UPDATE messages SET ip = NULL WHERE ip IS NOT NULL;
DELETE FROM stream_breadth;
DELETE FROM attempts;

-- 4. Indexes for the daily retention sweeps (retention.js, streamdaw-telemetry.js).
CREATE INDEX IF NOT EXISTS idx_user_messages_sent ON user_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_user_messages_email ON user_messages(email);
CREATE INDEX IF NOT EXISTS idx_attempts_reset ON attempts(reset_at);
CREATE INDEX IF NOT EXISTS idx_auth_log_ts ON auth_log(ts);
CREATE INDEX IF NOT EXISTS idx_sdrep_created ON streamdaw_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_dltok_exp ON download_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_sdorders_erased ON streamdaw_orders(erased_at, created_at);

-- 5. [Ori decides] People archived by the old rule ("an email is never lost") before this
--    change. The policy now says a deleted account is deleted; these rows say otherwise for
--    the people already in them. To make it true for them too, un-comment and run:
-- DELETE FROM people_archive;
