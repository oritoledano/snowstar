-- Snowstar — the live schema, dumped from D1. Generated; do not hand-edit.
--
-- The hand-written schema*.sql files carry the REASONING and stay authoritative
-- for that. This carries the truth about what exists, which they had drifted
-- away from: 0 of 61 tables had no DDL checked in anywhere.
--
-- Regenerate with tools/dump-schema.sh
-- Dumped: 2026-09-16

CREATE TABLE admin_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action   TEXT NOT NULL,
  subject  TEXT,
  detail   TEXT,
  ts       INTEGER NOT NULL
);

CREATE TABLE alerts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL,            
  subject TEXT NOT NULL,
  body    TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  status  TEXT NOT NULL,            
  note    TEXT DEFAULT ''
);

CREATE TABLE app_releases (
  asset       TEXT NOT NULL,                 -- 'streamdaw-macos'
  version     TEXT NOT NULL,                 -- '0.1.0'
  r2_key      TEXT NOT NULL,                 -- object key in the private apps bucket
  filename    TEXT NOT NULL,                 -- what the browser saves it as
  bytes       INTEGER,
  sha256      TEXT,                          -- integrity, shown on the receipt
  notarized   INTEGER NOT NULL DEFAULT 0,
  is_latest   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (asset, version)
);

CREATE TABLE artist_managers (artist_id INTEGER NOT NULL, user_id TEXT NOT NULL, added_at INTEGER NOT NULL, added_by TEXT, PRIMARY KEY (artist_id, user_id));

CREATE TABLE artist_terms (email TEXT PRIMARY KEY, share_bp INTEGER NOT NULL, note TEXT DEFAULT '', updated_at INTEGER);

CREATE TABLE attempts (
  bucket   TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE auth_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  step   TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE catalog_snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  batch      TEXT NOT NULL,
  slug       TEXT NOT NULL,
  prev_patch TEXT,
  ts         INTEGER NOT NULL,
  actor      TEXT NOT NULL,
  note       TEXT
);

CREATE TABLE channels (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id TEXT NOT NULL,
   platform TEXT NOT NULL,
   value TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending',
   created_at INTEGER NOT NULL,
   cleared_at INTEGER,
   UNIQUE(user_id, platform, value)
 );

CREATE TABLE client_logos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  updated_at INTEGER
);

CREATE TABLE collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  share_bp INTEGER NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'listed',
  flag_note TEXT DEFAULT '',
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE collection_tracks (collection_id INTEGER NOT NULL, slug TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (collection_id, slug));

CREATE TABLE collections (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, blurb TEXT, art TEXT, hidden INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);

CREATE TABLE coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, value INTEGER NOT NULL, min_amount INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, active INTEGER NOT NULL DEFAULT 1, note TEXT, classes TEXT, created_at INTEGER NOT NULL, created_by TEXT);

CREATE TABLE deleted_tracks (slug TEXT PRIMARY KEY, title TEXT, deleted_at INTEGER NOT NULL, deleted_by TEXT, audio_key TEXT);

CREATE TABLE download_tokens (
  token_hash     TEXT PRIMARY KEY,
  entitlement_id INTEGER REFERENCES entitlements(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  product        TEXT NOT NULL DEFAULT 'streamdaw',
  asset          TEXT NOT NULL DEFAULT 'streamdaw-macos',  -- which build the link serves
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,           -- link good for a few days
  max_uses       INTEGER NOT NULL DEFAULT 5, -- a few re-taps (email preview bots, retries)
  uses           INTEGER NOT NULL DEFAULT 0,
  used_at        INTEGER                     -- last time it served a download
);

CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  ts INTEGER NOT NULL
, licence_id INTEGER, file_etag TEXT, bytes INTEGER);

CREATE TABLE earnings (id INTEGER PRIMARY KEY AUTOINCREMENT, licence_id INTEGER, slug TEXT NOT NULL, user_id TEXT, email TEXT NOT NULL, name TEXT, share_bp INTEGER NOT NULL, gross_agorot INTEGER NOT NULL, amount_agorot INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'accrued', payout_ref TEXT, created_at INTEGER NOT NULL, paid_at INTEGER);

CREATE TABLE entitlements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- email is the DURABLE key: a purchase can arrive (Stripe webhook) before the
  -- buyer has ever signed in, so the entitlement is minted against the email and
  -- linked to a user row on first sign-in with that address.
  email       TEXT NOT NULL,                 -- stored lowercased
  product     TEXT NOT NULL DEFAULT 'streamdaw',
  plan        TEXT NOT NULL DEFAULT 'lifetime',  -- lifetime | monthly | annual
  status      TEXT NOT NULL DEFAULT 'active',    -- active | refunded | revoked
  source      TEXT NOT NULL DEFAULT 'hyp',       -- hyp | comp | stripe
  -- the gateway's own id for the purchase; UNIQUE so a webhook that Stripe
  -- retries (it will) can't grant the same thing twice.
  ext_ref     TEXT,
  amount      INTEGER,                        -- minor units actually charged, incl tax
  currency    TEXT NOT NULL DEFAULT 'usd',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,                        -- NULL = perpetual (a lifetime buy)
  revoked_at  INTEGER
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,          -- random, per browser-tab session
  type       TEXT NOT NULL,          -- view | play | license | search | favorite
  detail     TEXT,                   -- track slug, path, or search term
  page       TEXT,                   -- pathname only (no query string)
  country    TEXT,                   -- coarse geo from CF, e.g. "IL"
  referrer   TEXT,                   -- sending host only, e.g. "google.com"
  ts         INTEGER NOT NULL
, duration INTEGER, user_id TEXT);

CREATE TABLE "favorites" (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product    TEXT NOT NULL DEFAULT 'mutra',
  slug       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, product, slug)
);

CREATE TABLE handoffs (
  code_hash  TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE hyp_checkouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL,
  request_id INTEGER REFERENCES licence_requests(id),
  amount     INTEGER NOT NULL,
  status     TEXT NOT NULL,
  hyp_id     TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);

CREATE TABLE identities (
  provider    TEXT NOT NULL,                  -- google | facebook
  provider_id TEXT NOT NULL,                  -- the provider's stable subject id
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);

CREATE TABLE invoice_licences (
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  licence_id INTEGER NOT NULL REFERENCES licences(id),
  PRIMARY KEY (invoice_id, licence_id)
);

CREATE TABLE invoices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider      TEXT,                       -- ezcount|morning|manual
  doc_id        TEXT,
  number        TEXT,
  url           TEXT,
  amount        INTEGER,                    -- agorot incl VAT
  currency      TEXT NOT NULL DEFAULT 'ILS',
  vat_treatment TEXT,                       -- standard|zero_rated
  allocation_no TEXT,                       -- ITA number, only above ₪5,000 ex-VAT
  ts            INTEGER NOT NULL
, licence_id INTEGER, licence_ref TEXT, doc_type INTEGER, status TEXT, last_error TEXT, issued_at INTEGER);

CREATE TABLE "jobs" (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_date     TEXT,
  project      TEXT NOT NULL,
  client       TEXT,
  agency       TEXT,
  service      TEXT,
  licensed     INTEGER,
  lic_media    TEXT,
  lic_period   TEXT,
  lic_territory TEXT,
  versions     INTEGER,
  work_id      INTEGER,
  source       TEXT,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE licence_payments (
  licence_id INTEGER NOT NULL REFERENCES licences(id),
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  applied    INTEGER NOT NULL,              -- agorot of this payment used here
  PRIMARY KEY (licence_id, payment_id)
);

CREATE TABLE licence_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT NOT NULL UNIQUE,      -- MU-2608-0041, travels with the money
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,             -- so a non-member can still request
  slug           TEXT NOT NULL,
  tier           TEXT NOT NULL,
  -- lane and list_amount are SNAPSHOTTED. track_overrides lets the owner flip a
  -- track's lane at any time; a request must be judged against what was on
  -- offer when it was made, not what is true today.
  lane           TEXT NOT NULL,
  list_amount    INTEGER,                   -- agorot ex-VAT, NULL on a quote lane
  quoted_amount  INTEGER,                   -- agorot ex-VAT, once the owner prices it
  currency       TEXT NOT NULL DEFAULT 'ILS',
  status         TEXT NOT NULL DEFAULT 'new',   -- new|quoted|granted|declined|cancelled
  licensee_name  TEXT,                      -- the business the licence is FOR
  licensee_tax_id TEXT,                     -- ח.פ / ע.מ, needed on the tax invoice
  use_where      TEXT,
  use_territory  TEXT,
  use_duration   TEXT,
  note           TEXT,
  created_at     INTEGER NOT NULL,
  decided_by     TEXT,
  decided_at     INTEGER,
  decline_note   TEXT
, months INTEGER, duration_id TEXT, project_name TEXT);

CREATE TABLE licence_texts (
  id         TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE licences (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT NOT NULL UNIQUE,
  request_id     INTEGER REFERENCES licence_requests(id),
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  slug           TEXT NOT NULL,
  tier           TEXT NOT NULL,
  terms_id       TEXT NOT NULL,             -- frozen copy id, see licence_texts
  scope_text     TEXT,                      -- the read-back, in the owner's words
  licensee_name  TEXT,
  licensee_tax_id TEXT,
  amount         INTEGER NOT NULL,          -- agorot ex-VAT; 0 for a comp
  currency       TEXT NOT NULL DEFAULT 'ILS',
  grant_reason   TEXT NOT NULL,             -- paid|comp|contra|internal
  -- a quote-lane track means SOMEONE ELSE has a say. Granting one without
  -- confirming that is how you end up in a rights claim rather than a refund.
  controller_cleared INTEGER NOT NULL DEFAULT 0,
  granted_by     TEXT NOT NULL,             -- user id, or system:<gateway>
  granted_at     INTEGER NOT NULL,
  starts_at      INTEGER NOT NULL,
  expires_at     INTEGER,                   -- NULL = perpetual
  revoked_at     INTEGER,
  revoke_reason  TEXT
, project_name TEXT);

CREATE TABLE mail_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  to_name TEXT DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'collab-invite',
  submission_id INTEGER,
  sent_at INTEGER, sent_how TEXT DEFAULT '', last_error TEXT DEFAULT '',
  created_at INTEGER
);

CREATE TABLE managed_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  claimed_user_id TEXT,
  created_at INTEGER
, bio TEXT, avatar TEXT, links TEXT, created_from TEXT, videos TEXT);

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL UNIQUE,
  branch     TEXT NOT NULL,
  priority   TEXT,
  email      TEXT NOT NULL,
  name       TEXT,
  message    TEXT NOT NULL,
  order_ref  TEXT,
  video_url  TEXT,
  platform   TEXT,
  track      TEXT,
  ip         TEXT,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);

CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE oauth_states (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  verifier   TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  amount      INTEGER NOT NULL,             -- agorot INCL VAT — what hit the bank
  vat_amount  INTEGER,                      -- agorot, the VAT portion
  currency    TEXT NOT NULL DEFAULT 'ILS',
  method      TEXT NOT NULL,                -- bank|bit|paybox|cash|card|waived
  status      TEXT NOT NULL DEFAULT 'received',  -- received|refunded
  reference   TEXT,                         -- the ref the payer quoted
  payer_note  TEXT,
  ts          INTEGER NOT NULL,
  recorded_by TEXT NOT NULL
);

CREATE TABLE rights_decls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text_id TEXT NOT NULL,
  signed_name TEXT NOT NULL,
  signer_user_id TEXT NOT NULL,
  acum INTEGER NOT NULL DEFAULT 0,
  splits_snapshot TEXT NOT NULL DEFAULT '[]',
  evidence_kind TEXT DEFAULT '',
  evidence_note TEXT DEFAULT '',
  created_at INTEGER
, controllers TEXT);

CREATE TABLE rights_texts (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions_seen (
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

CREATE TABLE site_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  x REAL, y REAL, vw INTEGER,
  near TEXT DEFAULT '',
  note TEXT DEFAULT '',
  drawing TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE site_texts (
  key TEXT PRIMARY KEY,
  html TEXT NOT NULL,
  updated_at INTEGER
);

CREATE TABLE snowstash_catalog (
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

CREATE TABLE snowstash_coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,            -- stored upper-cased, ambiguous glyphs avoided
  kind        TEXT NOT NULL DEFAULT 'percent', -- percent | amount
  value       INTEGER NOT NULL,                -- percent 1..100, or agorot off
  min_amount  INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,                          -- epoch seconds, NULL = never
  active      INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE snowstash_orders (
  ref         TEXT PRIMARY KEY,                -- ST-XXXX, travels with the money as HYP Order
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  scan_id     TEXT REFERENCES snowstash_scans(id),
  amount      INTEGER NOT NULL,                -- agorot incl VAT
  currency    TEXT NOT NULL DEFAULT 'ILS',
  status      TEXT NOT NULL DEFAULT 'started', -- started | granted | declined | verify_failed | charged_unverified
  hyp_id      TEXT,
  coupon      TEXT,
  created_at  INTEGER NOT NULL,
  settled_at  INTEGER
);

CREATE TABLE snowstash_registrations (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  status      TEXT NOT NULL,                    -- done | dismissed
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE snowstash_scans (
  id          TEXT PRIMARY KEY,               -- short id, used in the report URL
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  artist_name TEXT NOT NULL,
  mbid        TEXT,                            -- confirmed MusicBrainz artist
  kind        TEXT NOT NULL DEFAULT 'artist',  -- artist | catalog
  status      TEXT NOT NULL DEFAULT 'running', -- running | complete | error
  error       TEXT,
  result_json TEXT,
  health      INTEGER,
  claimable   INTEGER,
  attention   INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE snowstash_unlocks (
  scan_id     TEXT PRIMARY KEY REFERENCES snowstash_scans(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  source      TEXT NOT NULL,                   -- paid | coupon | granted
  ref         TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE stream_breadth (ip TEXT NOT NULL, slug TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (ip, slug));

CREATE TABLE streamdaw_coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,           -- stored upper-cased, ambiguous glyphs avoided
  kind        TEXT NOT NULL DEFAULT 'percent', -- percent | amount
  value       INTEGER NOT NULL,               -- percent 1..100, or agorot off
  min_amount  INTEGER NOT NULL DEFAULT 0,      -- agorot; code applies from here up
  max_uses    INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,                         -- epoch seconds, NULL = never
  active      INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE streamdaw_orders (
  ref         TEXT PRIMARY KEY,             -- SD-XXXX, travels with the money as HYP Order
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'lifetime',
  amount      INTEGER NOT NULL,             -- agorot incl VAT
  currency    TEXT NOT NULL DEFAULT 'ILS',
  status      TEXT NOT NULL DEFAULT 'started', -- started | granted | declined | verify_failed | charged_unverified
  hyp_id      TEXT,
  entitlement_id INTEGER REFERENCES entitlements(id),
  created_at  INTEGER NOT NULL,
  settled_at  INTEGER
, coupon TEXT);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_key TEXT NOT NULL,
  size INTEGER, ext TEXT,
  artist_note TEXT DEFAULT '',
  review_note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER, reviewed_at INTEGER
, managed_artist_id INTEGER, lane TEXT, published_slug TEXT, meta TEXT);

CREATE TABLE track_overrides (slug TEXT PRIMARY KEY, patch TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE track_stacks (child_slug TEXT PRIMARY KEY, parent_slug TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);

CREATE TABLE track_uses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  client     TEXT NOT NULL,
  project    TEXT,
  year       INTEGER,
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE tracks (slug TEXT PRIMARY KEY, title TEXT NOT NULL, audio_key TEXT NOT NULL, orig_title TEXT);

CREATE TABLE "users" (
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
, artist INTEGER NOT NULL DEFAULT 0, artist_name TEXT, first_name TEXT, last_name TEXT, country TEXT, phone TEXT, role TEXT, company TEXT, artist_bio TEXT, artist_links TEXT, artist_videos TEXT);

CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'artist-submissions',
  note TEXT,
  created_at INTEGER NOT NULL,
  told_at INTEGER
);

CREATE TABLE works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  thumb TEXT, preview TEXT, mp4 TEXT, vimeo INTEGER,
  credits TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  media TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER
, year INTEGER, year_src TEXT);

-- ── indexes ──────────────────────────────────────────────────────────────

CREATE INDEX alerts_ts ON alerts (ts DESC);
CREATE INDEX idx_alog_ts ON admin_log (ts DESC);
CREATE INDEX idx_channels_user ON channels(user_id);
CREATE UNIQUE INDEX idx_coll_kind_name ON collections (kind, name);
CREATE INDEX idx_dltok_ent ON download_tokens (entitlement_id);
CREATE INDEX idx_downloads_user ON downloads(user_id, ts);
CREATE INDEX idx_earn_email ON earnings (email, status);
CREATE INDEX idx_ent_email   ON entitlements (email, product);
CREATE UNIQUE INDEX idx_ent_extref ON entitlements (ext_ref);
CREATE INDEX idx_ent_user    ON entitlements (user_id, product);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_ts      ON events(ts);
CREATE INDEX idx_events_type    ON events(type, ts);
CREATE INDEX idx_hypco_status ON hyp_checkouts (status, created_at);
CREATE INDEX idx_identities_user ON identities(user_id);
CREATE UNIQUE INDEX idx_inv_licence ON invoices (licence_id);
CREATE INDEX idx_inv_user ON invoices (user_id);
CREATE INDEX idx_jobs_client ON jobs (client);
CREATE INDEX idx_jobs_date ON jobs (job_date DESC);
CREATE UNIQUE INDEX idx_lic_live_project
  ON licences (user_id, slug, tier, COALESCE(project_name,''))
  WHERE revoked_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX idx_lic_slug ON licences (slug);
CREATE INDEX idx_lic_user ON licences (user_id, revoked_at);
CREATE INDEX idx_lr_status ON licence_requests (status, id);
CREATE INDEX idx_lr_user   ON licence_requests (user_id);
CREATE INDEX idx_msg_ip ON messages (ip, created_at);
CREATE INDEX idx_msg_status ON messages (status, id DESC);
CREATE INDEX idx_pay_user ON payments (user_id);
CREATE INDEX idx_resets_user ON password_resets(user_id);
CREATE INDEX idx_sb_ts ON stream_breadth (ts);
CREATE INDEX idx_sdorders_status ON streamdaw_orders (status, created_at);
CREATE INDEX idx_seen_last ON sessions_seen(last_ts);
CREATE INDEX idx_sessions_exp  ON sessions(expires_at);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_snap_batch ON catalog_snapshots (batch);
CREATE INDEX idx_snap_ts ON catalog_snapshots (ts DESC);
CREATE INDEX idx_stacks_parent ON track_stacks (parent_slug, sort);
CREATE UNIQUE INDEX idx_stash_cat_isrc ON snowstash_catalog (user_id, isrc) WHERE isrc IS NOT NULL;
CREATE INDEX idx_stash_cat_user ON snowstash_catalog (user_id, added_at DESC);
CREATE INDEX idx_stash_scans_user ON snowstash_scans (user_id, created_at DESC);
CREATE INDEX idx_storders_status ON snowstash_orders (status, created_at);
CREATE INDEX idx_uses_slug ON track_uses (slug, year DESC);
CREATE UNIQUE INDEX idx_waitlist_one ON waitlist (email, kind);
