-- StreamDAW Pro pass (2026-10-12): a key request for a pass carries the pass's end (seconds).
-- entitlements.expires_at and streamdaw_orders.plan already exist.
ALTER TABLE streamdaw_activations ADD COLUMN expires_at INTEGER;
