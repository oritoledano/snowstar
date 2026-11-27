-- The ledger and the owed list, as the dashboard shows them (General > Owed).
--
-- One row, replaced whole by contracts/push.sh from the Mac that holds the files. The
-- files are the source of truth; this is a copy for reading, never edited here. It is in
-- D1 and not in the site's repo because that repo is public and this names work that is
-- not released yet.
--
--   npx wrangler d1 execute snowstar-members --remote --file schema-ops-ledger.sql
CREATE TABLE IF NOT EXISTS ops_ledger (
  id        TEXT PRIMARY KEY,      -- 'snowstar': one document for the whole operation
  json      TEXT NOT NULL,         -- contracts/check.mjs --snapshot
  pushed_at INTEGER NOT NULL       -- ms
);
