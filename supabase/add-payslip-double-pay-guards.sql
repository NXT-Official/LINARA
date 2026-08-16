-- Session A of PAYMENTS_REMEDIATION.md: make double-pay structurally
-- impossible. The payslips/vales tables are LIVE (real Xendit payouts), so
-- this is a production change. Apply by hand in the Supabase SQL editor.
-- Idempotent and safe to re-run. Depends on add-payslips-table.sql.
--
-- Session 0 findings this relies on (see PAYMENTS_REMEDIATION.md "Session 0 --
-- FINDINGS"): Q3 returned no rows, i.e. no (helper, cutoff) currently has more
-- than one non-failed payslip, so the UNIQUE index below builds cleanly. There
-- is exactly one row in the table today (the cancelled 100x-bug payout, see
-- KNOWN_GAPS.md C35).
--
-- --------------------------------------------------------------------------
-- WHY THIS SHAPE ("one row per (helper, cutoff), updated in place")
-- --------------------------------------------------------------------------
-- Two double-pay vectors existed (PAYMENTS_REMEDIATION.md section 1):
--
--   Vector A -- a retry after an ambiguous failure re-sent with a FRESH
--   Idempotency-key, so Xendit saw a brand-new request and paid again.
--   Vector B -- initiate_payslip did IF EXISTS (...) then INSERT with no
--   unique constraint behind it, so two concurrent calls (two managers, or
--   one manager in two tabs) both passed the check and both inserted.
--
-- The fix couples three things that have to agree:
--
--   1. The reference id (== Xendit reference_id == Idempotency-key) is now
--      DERIVED HERE, deterministically, from (helper, cutoff) rather than
--      minted fresh by the caller per attempt. A retry therefore replays the
--      SAME Idempotency-key and Xendit collapses it instead of paying twice.
--   2. There is at most ONE payslip row per (helper, cutoff), enforced by a
--      real UNIQUE index -- not a TOCTOU-racy EXISTS check. A failed attempt
--      is RETRIED BY UPDATING THAT ROW IN PLACE (reusing its reference id),
--      never by inserting a second row.
--   3. Because the row is reused, the reference id is stable across attempts,
--      which is what lets xendit-payout-webhook keep matching on
--      reference_id unambiguously (a multi-row-per-cutoff model would give it
--      two rows with the same id and it couldn't tell which to update).
--
-- This deliberately diverges from the "partial unique index WHERE
-- payout_status <> 'failed' + a new row per attempt" originally sketched in
-- PAYMENTS_REMEDIATION.md Session A: that shape is incompatible with reusing
-- the reference id (the rows would collide on payout_reference_id, and the
-- webhook lookup would go ambiguous). Per-attempt history is not lost
-- forever -- it is deferred to Session D's supersedes_payslip_id, which is
-- the right place for an audit trail.
--
-- The 'needs_review' status added below is the safety net for the case
-- idempotency can't cover: an AMBIGUOUS failure (we never got a response, or
-- Xendit accepted but our follow-up write failed) where the payout MIGHT be
-- in flight. Such a row does not unsettle its vales and does not allow a
-- one-click retry -- a human must reconcile against Xendit first. See the
-- caller, src/features/pay/pay.actions.ts, for which outcomes land here.
--
-- --------------------------------------------------------------------------
-- KNOWN LIMITATION of reference-id reuse: a CANCELLED payout cannot be re-sent
-- --------------------------------------------------------------------------
-- Reusing the reference id across retries is what makes Xendit collapse a
-- duplicate -- but it also means an Idempotency-key that Xendit has already
-- seen can never be used for a genuinely NEW payout on the same cutoff. If a
-- payout is cancelled at Xendit (rather than failing), a later retry replays
-- the same key, Xendit answers DUPLICATE, and pay.actions.ts marks the row
-- 'processing' for a payout that is not actually in flight -- so it would sit
-- there forever.
--
-- This is an accepted trade-off (a cancelled payout is rare and operator-
-- driven), not an oversight. The escape hatch is to mint a fresh key for that
-- one cutoff by clearing the stored reference id, which makes the next call
-- derive a new one:
--
--   UPDATE public.payslips
--   SET payout_reference_id = md5(
--         helper_id::text || ':' || cutoff_start::text || ':' ||
--         cutoff_end::text || ':retry-' || extract(epoch from now())::bigint
--       )::uuid::text,
--       payout_status = 'failed',
--       failure_reason = 'Cancelled at Xendit; reference id rotated for retry'
--   WHERE id = '<payslip id>';
--
-- This applies right now to the one pre-existing row (KNOWN_GAPS.md C35, the
-- 100x-bug payout cancelled 2026-08-16): its reference id is the old random
-- UUID that Xendit already knows as CANCELLED. If that cutoff ever needs
-- re-paying, rotate the id as above first.

-- --------------------------------------------------------------------------
-- 1. Add 'needs_review' to the payout_status CHECK constraint.
-- --------------------------------------------------------------------------
-- The original constraint was defined inline in CREATE TABLE, so it carries
-- the auto-generated name payslips_payout_status_check. Drop and re-add it
-- (idempotent: re-running drops the one we just added and recreates it).
ALTER TABLE public.payslips
  DROP CONSTRAINT IF EXISTS payslips_payout_status_check;

ALTER TABLE public.payslips
  ADD CONSTRAINT payslips_payout_status_check
  CHECK (payout_status IN ('pending_send', 'processing', 'succeeded', 'failed', 'needs_review'));

-- --------------------------------------------------------------------------
-- 2. One payslip row per (helper, cutoff) -- the structural backstop for
--    Vector B. Non-partial on purpose: failed rows are updated in place, not
--    duplicated, so there is only ever one row per cutoff regardless of
--    status. Session 0 Q3 confirmed no existing (helper, cutoff) has >1
--    non-failed row; there is a single row overall, so this builds cleanly.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS payslips_one_per_cutoff
  ON public.payslips (helper_id, cutoff_start, cutoff_end);

-- --------------------------------------------------------------------------
-- 3. Rewrite initiate_payslip: derive the reference id, lock/reuse the
--    per-cutoff row, and stop trusting a caller-supplied reference id.
-- --------------------------------------------------------------------------
-- Signature change: p_reference_id is GONE (the RPC derives it now) and the
-- function RETURNS the reference id + status so the caller can hand the id to
-- Xendit. Must DROP before CREATE because the argument list and return type
-- both change. Drop the old 7-arg form and any prior 6-arg form for a clean,
-- re-runnable apply.
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT);

CREATE FUNCTION public.initiate_payslip(
    p_helper_id UUID,
    p_cutoff_start DATE,
    p_cutoff_end DATE,
    p_base_pay NUMERIC,
    p_statutory_employee_share NUMERIC,
    p_channel_code TEXT
)
-- reference_id / resulting_status are named to avoid colliding with the
-- payslips.payout_status column and the vales.status column referenced in the
-- body (an OUT param named "status" would shadow vales.status in the settle
-- query). The first three OUT names mirror the original function.
RETURNS TABLE (
    payslip_id UUID,
    vale_deductions NUMERIC,
    net_pay NUMERIC,
    reference_id TEXT,
    resulting_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_vale_total NUMERIC;
    v_net_pay NUMERIC;
    v_payslip_id UUID;
    v_reference_id TEXT;
    v_existing_id UUID;
    v_existing_status TEXT;
    v_existing_ref TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can initiate a payout';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.helper_profiles
        WHERE id = p_helper_id AND household_id = v_household_id
    ) THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    -- Lock the per-cutoff row if it exists. This serializes two concurrent
    -- initiate calls for the same cutoff (the second blocks here until the
    -- first commits/rolls back), closing Vector B's existing-row case. If no
    -- row exists yet, the UNIQUE index closes the concurrent-INSERT case
    -- below instead.
    SELECT id, payout_status, payout_reference_id
      INTO v_existing_id, v_existing_status, v_existing_ref
    FROM public.payslips
    WHERE helper_id = p_helper_id
      AND cutoff_start = p_cutoff_start
      AND cutoff_end = p_cutoff_end
    FOR UPDATE;

    IF FOUND THEN
        -- Only a genuinely 'failed' prior attempt may be retried. Everything
        -- else blocks: pending_send/processing/succeeded because a payout is
        -- live or done, and needs_review because a human must reconcile the
        -- ambiguous prior attempt against Xendit before we touch it again.
        IF v_existing_status <> 'failed' THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END IF;
        -- Retry: reuse this row AND its reference id, so Xendit sees the same
        -- Idempotency-key as the failed attempt.
        v_payslip_id := v_existing_id;
        v_reference_id := v_existing_ref;
    ELSE
        -- New cutoff: derive a stable reference id from (helper, cutoff). Any
        -- later retry recomputes/reuses the same value, so the Idempotency-key
        -- is a pure function of the cutoff.
        v_reference_id := md5(
            p_helper_id::text || ':' || p_cutoff_start::text || ':' || p_cutoff_end::text
        )::uuid::text;
    END IF;

    -- Snapshot the vale total now (inside the lock), so a vale approved
    -- between attempts is counted consistently.
    SELECT COALESCE(SUM(amount), 0) INTO v_vale_total
    FROM public.vales
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);

    IF v_payslip_id IS NULL THEN
        -- Fresh insert. If a concurrent transaction inserted the same cutoff
        -- between our SELECT and here, the UNIQUE index rejects the loser with
        -- unique_violation, which we surface as the same friendly message.
        BEGIN
            INSERT INTO public.payslips (
                helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
                vale_deductions, net_pay, payout_channel_code, payout_reference_id, requested_by
            )
            VALUES (
                p_helper_id, p_cutoff_start, p_cutoff_end, p_base_pay, p_statutory_employee_share,
                v_vale_total, v_net_pay, p_channel_code, v_reference_id, auth.uid()
            )
            RETURNING id INTO v_payslip_id;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END;
    ELSE
        -- Retry of a failed row: reset it to pending_send and refresh the
        -- snapshot in case the rate or vales changed since the failed attempt.
        UPDATE public.payslips
        SET payout_status = 'pending_send',
            failure_reason = NULL,
            payout_external_id = NULL,
            base_pay = p_base_pay,
            statutory_employee_share = p_statutory_employee_share,
            vale_deductions = v_vale_total,
            net_pay = v_net_pay,
            payout_channel_code = p_channel_code,
            requested_by = auth.uid(),
            requested_at = timezone('utc', now()),
            confirmed_at = NULL
        WHERE id = v_payslip_id;
    END IF;

    -- Settle this helper's unsettled approved vales against this payslip. On a
    -- retry the caller had unsettled them (only genuine failures unsettle --
    -- see pay.actions.ts), so this re-claims them for the fresh attempt.
    UPDATE public.vales
    SET settled_in_payslip_id = v_payslip_id
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_net_pay, v_reference_id, 'pending_send'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT)
    TO authenticated;
