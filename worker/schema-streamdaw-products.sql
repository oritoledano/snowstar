-- StreamDAW sold as products (2026-10-27, streamdaw-products.js): a key request carries the list
-- of products its key must name (format 4), e.g. 'splits,compare@19a3c2f1e00' or 'all'.
-- entitlements.plan takes '<product>:<period>' ('splits:year', 'compare:once'); no change needed there.
ALTER TABLE streamdaw_activations ADD COLUMN products TEXT;
