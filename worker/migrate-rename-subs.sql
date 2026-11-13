-- Run once, by hand:
--   cd worker && npx wrangler d1 execute snowstar-members --remote --file migrate-rename-subs.sql
--
-- The first reseller's name out of the live schema (2026-11-13). Nothing is dropped and no row is
-- deleted: tables and columns are renamed in place, so every value stays where it was. Four tables
-- only the removed code ever touched are kept under a retired_ name rather than dropped, and can go
-- whenever. After this runs, the matching code change is a rename of the same identifiers.
--
-- These two tables were created on 2026-10-29/30 with the first reseller's name in them
-- (streamdaw_paddle_subs, audioctor_paddle_subs) and three more beside them for that
-- reseller's own settings and its webhook de-duplication. That reseller declined the
-- account and never sold anything; Creem took over on 2026-11-11 and wrote into the same
-- two tables, which left the schema claiming a seller we have no relationship with. The
-- name misled a reader once already: the admin screens read streamdaw_subscriptions (the
-- HYP-era table) and showed no subscribers while a live monthly was being billed here.
--
-- What it renames:
--   streamdaw_paddle_subs  -> streamdaw_subs
--   audioctor_paddle_subs  -> audioctor_subs
--   audioctor_orders.paddle_txn -> audioctor_orders.checkout_id
-- and dropped, because only the removed code ever read or wrote them:
--   streamdaw_paddle_conf, audioctor_paddle_conf   (Creem keeps its settings in creem_conf)
--   streamdaw_paddle_events, audioctor_paddle_events (Creem de-duplicates in creem_events)
--   streamdaw_coupons.paddle_discount_id, .paddle_env
--
-- env says which till took the money: 'creem-live' is a real card, 'creem-test' is Creem's
-- test mode, 'test' is the two grants made while the store was being tried out before it
-- opened. Only 'creem-live' is counted as income anywhere (worker/src/money.js).

ALTER TABLE streamdaw_paddle_subs RENAME TO streamdaw_subs;
ALTER TABLE audioctor_paddle_subs RENAME TO audioctor_subs;
ALTER TABLE audioctor_orders RENAME COLUMN paddle_txn TO checkout_id;

ALTER TABLE streamdaw_paddle_conf   RENAME TO retired_streamdaw_conf;
ALTER TABLE audioctor_paddle_conf   RENAME TO retired_audioctor_conf;
ALTER TABLE streamdaw_paddle_events RENAME TO retired_streamdaw_events;
ALTER TABLE audioctor_paddle_events RENAME TO retired_audioctor_events;

ALTER TABLE streamdaw_coupons RENAME COLUMN paddle_discount_id TO reseller_discount_id;
ALTER TABLE streamdaw_coupons RENAME COLUMN paddle_env         TO reseller_env;

-- 'sandbox' was that reseller's word for its test till. These rows are the owner's own trial grants
-- from 29-30 October; nothing was charged for either, and both still work as his licences.
UPDATE streamdaw_subs  SET env = 'test' WHERE env = 'sandbox';
UPDATE audioctor_subs  SET env = 'test' WHERE env = 'sandbox';
UPDATE entitlements    SET source = 'test' WHERE source = 'paddle';

-- The index on the renamed column keeps working under its old name; give it the new one.
CREATE INDEX IF NOT EXISTS idx_adord_checkout ON audioctor_orders (checkout_id);
