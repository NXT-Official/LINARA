-- One-off data cleanup, NOT a schema migration. Apply by hand in the Supabase
-- SQL editor. Safe to re-run (deleting an already-deleted row is a no-op).
--
-- Deletes the single legacy payslip from KNOWN_GAPS.md C35: the payout that
-- the 100x currency-unit bug sent to Xendit as PHP 356,250 instead of
-- PHP 3,562.50. That Xendit payout was cancelled 2026-08-16 and re-verified as
-- status "CANCELLED" (disb-5fae2444-abf0-4e2f-b4fb-1470442cb815), so no money
-- is or was in flight.
--
-- Why delete rather than keep and repair (user decision 2026-08-16): the
-- database holds sandbox/test data only -- no real household, no real payroll
-- record, and RA 10361's retention obligation does not attach to it. The row's
-- only remaining effect was to be an awkward edge case:
--   1. Its net_pay (3562.50) disagrees with what Xendit was actually asked for
--      (356250), so it is a permanently wrong reconciliation record.
--   2. Its payout_reference_id is a random UUID that Xendit already knows as
--      CANCELLED. Under the reference-id reuse introduced by
--      add-payslip-double-pay-guards.sql, retrying that cutoff would replay a
--      dead key, so the Aug 1-15 cutoff could never be re-paid without first
--      rotating the id by hand.
--   3. If its payout_status never moved off 'processing' (the webhook
--      writeback into payslips has never been observed end to end -- see C35),
--      the payslips_one_per_cutoff unique index locks that cutoff forever.
-- Deleting it removes all three at once and gives the payout_attempts
-- restructure a clean baseline.
--
-- vales.settled_in_payslip_id is ON DELETE SET NULL, so the vale this payslip
-- claimed is automatically returned to the unsettled pool and becomes eligible
-- for the next real payout. That is the desired outcome -- it was never
-- actually paid.

-- Show what is about to be deleted (run first, eyeball it, then run the
-- DELETE). Expect exactly one row, net_pay 3562.50.
SELECT
    id,
    helper_id,
    cutoff_start,
    cutoff_end,
    net_pay,
    payout_status,
    payout_reference_id,
    payout_external_id,
    requested_at
FROM public.payslips
WHERE payout_reference_id = '3b1da7c1-c212-4a29-97f2-f72df887283e';

-- Which vales will be released back to the pool (expect one, amount 500-ish).
SELECT v.id, v.amount, v.status, v.settled_in_payslip_id
FROM public.vales v
JOIN public.payslips p ON p.id = v.settled_in_payslip_id
WHERE p.payout_reference_id = '3b1da7c1-c212-4a29-97f2-f72df887283e';

-- The delete itself. Targeted by payout_reference_id (UNIQUE) rather than by
-- helper/cutoff, so it cannot match anything created later for the same
-- cutoff.
DELETE FROM public.payslips
WHERE payout_reference_id = '3b1da7c1-c212-4a29-97f2-f72df887283e';

-- Verify: both should return zero rows / the vale should be back to NULL.
SELECT count(*) AS remaining_legacy_rows
FROM public.payslips
WHERE payout_reference_id = '3b1da7c1-c212-4a29-97f2-f72df887283e';

SELECT count(*) AS approved_unsettled_vales
FROM public.vales
WHERE status = 'approved' AND settled_in_payslip_id IS NULL;
