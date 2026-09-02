-- ═══════════ Mutra licensing ═══════════
--
-- Licences and payments are SEPARATE, joined many-to-many. A single "orders"
-- table breaks on all four cases that actually happen here:
--   * a comp for a friend's showreel      — licence, no payment
--   * a KAYMA quote invoiced on 30 days   — licence before payment
--   * one ₪1,800 transfer for four tracks — one payment, four licences
--   * a refund                            — payment reversed, licence revoked
--
-- MONEY IS IN AGOROT, AS INTEGER. Never floats: 0.1 + 0.2 is not 0.3, and a
-- rounding drift in a tax record is not a bug you get to fix quietly.
-- Licence amounts are EX-VAT (matching the catalogue's displayed prices).
-- Payment amounts are INCL-VAT — that is what actually landed in the bank.

-- ── what a visitor asked for ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licence_requests (
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
);
CREATE INDEX IF NOT EXISTS idx_lr_status ON licence_requests (status, id);
CREATE INDEX IF NOT EXISTS idx_lr_user   ON licence_requests (user_id);

-- ── what was actually granted ──────────────────────────────────────────────
-- Rows here are IMMUTABLE. A correction is revoke-and-regrant, never an UPDATE,
-- so the history of what was permitted at any past moment stays readable.
CREATE TABLE IF NOT EXISTS licences (
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
);
-- The fat-finger guard, enforced by SQLite rather than by the UI: one LIVE
-- licence per (member, track, tier). Also gives a future payment webhook
-- idempotency for free — a duplicate delivery hits this and stops.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lic_live
  ON licences (user_id, slug, tier) WHERE revoked_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lic_user ON licences (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_lic_slug ON licences (slug);

-- ── the licence wording, frozen at grant ───────────────────────────────────
-- Same shape and same reasoning as rights_texts: INSERT OR IGNORE, never edit a
-- row. Changing the wording means a new id, so a licence granted last March
-- still resolves to the words that were shown last March.
CREATE TABLE IF NOT EXISTS licence_texts (
  id         TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ── money that arrived ─────────────────────────────────────────────────────
-- Column names match what the member drawer already renders, so that section
-- lights up as soon as rows exist.
CREATE TABLE IF NOT EXISTS payments (
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
CREATE INDEX IF NOT EXISTS idx_pay_user ON payments (user_id);

-- One ₪1,800 transfer covering four tracks is one payment row and four
-- licences. Without this join you either duplicate the payment or merge
-- licences that have different terms.
CREATE TABLE IF NOT EXISTS licence_payments (
  licence_id INTEGER NOT NULL REFERENCES licences(id),
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  applied    INTEGER NOT NULL,              -- agorot of this payment used here
  PRIMARY KEY (licence_id, payment_id)
);

-- ── invoices live in the invoicing system, not here ────────────────────────
-- Only a REFERENCE is stored. Minting invoice numbers in D1 would risk a gap
-- in a statutory sequence the moment a write rolls back.
CREATE TABLE IF NOT EXISTS invoices (
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
);
CREATE INDEX IF NOT EXISTS idx_inv_user ON invoices (user_id);
CREATE TABLE IF NOT EXISTS invoice_licences (
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  licence_id INTEGER NOT NULL REFERENCES licences(id),
  PRIMARY KEY (invoice_id, licence_id)
);

-- ── append-only trail ──────────────────────────────────────────────────────
-- Admin actions were scattered with no common record. Six months on, "who
-- granted this and why" needs an answer for a rights dispute as much as for tax.
CREATE TABLE IF NOT EXISTS admin_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action   TEXT NOT NULL,
  subject  TEXT,
  detail   TEXT,
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alog_ts ON admin_log (ts DESC);

-- ── live-DB catch-up (2026-09-03): objects created in production that the ──
-- ── schema file was missing. A rebuilt database must keep every guarantee. ──

-- columns the invoicing system added to invoices in production:
--   licence_id INTEGER, licence_ref TEXT, doc_type INTEGER, status TEXT,
--   last_error TEXT, issued_at INTEGER
-- and the double-issue guard (one tax document per licence, ever):
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_licence ON invoices (licence_id);

-- the earnings ledger: one row per shareholder per paid licence (earnings.js)
CREATE TABLE IF NOT EXISTS earnings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  licence_id    INTEGER,
  slug          TEXT NOT NULL,
  user_id       TEXT,
  email         TEXT NOT NULL,
  name          TEXT,
  share_bp      INTEGER NOT NULL,           -- this person's slice of the artist pool
  gross_agorot  INTEGER NOT NULL,           -- the whole licence fee
  amount_agorot INTEGER NOT NULL,           -- what this person earned
  status        TEXT NOT NULL DEFAULT 'accrued',   -- accrued|paid
  payout_ref    TEXT,                        -- the evidence a settlement points at
  created_at    INTEGER NOT NULL,
  paid_at       INTEGER
);

-- per-artist deal: the artist-pool share for FUTURE sales (default 50% lives
-- in code as ARTIST_SHARE_BP; a row here overrides it for one uploader)
CREATE TABLE IF NOT EXISTS artist_terms (
  email      TEXT PRIMARY KEY,
  share_bp   INTEGER NOT NULL,
  note       TEXT DEFAULT '',
  updated_at INTEGER
);
