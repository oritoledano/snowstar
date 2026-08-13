-- Snowstar / Mutra member accounts
-- Passwords are never stored: only a PBKDF2-SHA256 hash + per-user random salt.
-- Session tokens are likewise stored hashed, so a database leak can't be replayed.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,   -- stored lowercased
  name          TEXT,
  pw_hash       TEXT NOT NULL,
  pw_salt       TEXT NOT NULL,
  pw_iters      INTEGER NOT NULL,
  newsletter    INTEGER NOT NULL DEFAULT 0,  -- explicit opt-in only
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);

-- Throttles brute-force login/signup attempts per IP+email bucket.
CREATE TABLE IF NOT EXISTS attempts (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
