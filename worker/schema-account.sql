-- ═══════════ Snowstar account: one identity across every product ═══════════
--
-- This widens the Mutra-only member table into a site-wide account:
--   · passwords become optional, because a Google/Facebook account has none
--   · identities/ links an external provider to a local user
--   · favorites are scoped by product, so a future product's saved items
--     can't collide with Mutra track slugs
--
-- Rebuilding users/favorites (rather than ALTER TABLE) is the only way to relax
-- a NOT NULL in SQLite. Safe to run once; it preserves every existing row.

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE users_new (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,        -- stored lowercased
  name           TEXT,
  pw_hash        TEXT,                        -- NULL for social-only accounts
  pw_salt        TEXT,
  pw_iters       INTEGER,
  newsletter     INTEGER NOT NULL DEFAULT 0,  -- explicit opt-in only
  admin          INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,  -- a provider vouched for the address
  avatar         TEXT,
  signup_source  TEXT,                        -- mutra | snowstar | google | facebook
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER
);

INSERT INTO users_new
  (id, email, name, pw_hash, pw_salt, pw_iters, newsletter, admin,
   email_verified, signup_source, created_at, last_login_at)
SELECT id, email, name, pw_hash, pw_salt, pw_iters, newsletter, admin,
       1, 'mutra', created_at, last_login_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE favorites_new (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product    TEXT NOT NULL DEFAULT 'mutra',
  slug       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, product, slug)
);

INSERT INTO favorites_new (user_id, product, slug, created_at)
SELECT user_id, 'mutra', slug, created_at FROM favorites;

DROP TABLE favorites;
ALTER TABLE favorites_new RENAME TO favorites;

-- one row per external login; a user may hold several (email + Google + Facebook)
CREATE TABLE identities (
  provider    TEXT NOT NULL,                  -- google | facebook
  provider_id TEXT NOT NULL,                  -- the provider's stable subject id
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX idx_identities_user ON identities(user_id);

-- single-use reset links; we store only the hash, never the token itself
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_resets_user ON password_resets(user_id);

-- short-lived CSRF state for the OAuth round trip
CREATE TABLE oauth_states (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  verifier   TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
