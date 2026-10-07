-- StreamDAW: the Mac an order was bought for (2026-10-07).
--
-- "Get Pro" in the app opens the sale page with ?machine=SD…; checkout keeps that Mac on
-- the order, and when the money is in the key request is filed by itself — the buyer no
-- longer signs in afterwards to paste a machine ID. owner_name is the name for the licence
-- (the buyer's Snowstar account name). Both NULL for orders from the page alone.
--
-- Apply once (wrangler's --file import fails on this login; --command works):
--   npx wrangler d1 execute snowstar-members --remote --command "$(sed 's/--.*$//' schema-streamdaw-order-machine.sql)"
ALTER TABLE streamdaw_orders ADD COLUMN machine_id TEXT;
ALTER TABLE streamdaw_orders ADD COLUMN owner_name TEXT;
