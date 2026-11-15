-- 2026-11-15: a code made for one person (Ori: a gift code must not pass from one person to another).
-- for_email: the only account that may use it at checkout; NULL = anyone. Applied to snowstar-members 2026-11-15.
ALTER TABLE coupons ADD COLUMN for_email TEXT;
ALTER TABLE audioctor_coupons ADD COLUMN for_email TEXT;
ALTER TABLE streamdaw_coupons ADD COLUMN for_email TEXT;
