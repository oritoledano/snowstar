-- ═══════════ StreamDAW coupons ═══════════
--
-- DELIBERATELY separate from Mutra's `coupons` table: a software discount code
-- must never be redeemable against a music licence, and vice-versa. Only the
-- pure discount MATH (applyCoupon/couponProblem in coupons.js) is shared.
--
-- percent: value is 1..100.  amount: value is agorot off (like every other sum).
-- A code that takes the price to zero is honoured as a FREE grant — the checkout
-- skips HYP, because a card gateway refuses a zero authorisation.
--
-- Apply ONCE (the ALTER errors if the column already exists).

CREATE TABLE IF NOT EXISTS streamdaw_coupons (
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

-- which coupon (if any) produced an order's price — so the paid return can burn it
ALTER TABLE streamdaw_orders ADD COLUMN coupon TEXT;
