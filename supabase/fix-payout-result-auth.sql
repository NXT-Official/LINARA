-- Security test, 2026-11-03: record_payout_attempt_result had no caller check,
-- and Supabase's default grant let anon execute it. Anyone holding a payout
-- attempt id, signed in or not, could mark the payout succeeded (a payslip that
-- says the helper was paid) or failed (which releases its vales and leave).
-- add-remote-admin-pay.sql's note "record_payout_attempt_result checks the
-- household" was never true; this makes it so.
--
-- Who may call it now:
--   * A signed-in user only if they are a primary manager, co-manager or remote
--     admin of the payslip's household (household_managers, not the profile's
--     user_type, so a removed co-manager is out). That is the web app's
--     "reconcile a stuck payout" (src/features/pay/pay.actions.ts), which runs
--     with the manager's own token.
--   * No user: the xendit-payout-webhook's service-role client or the SQL editor.
--     A request carrying an anon or authenticated JWT without a user is refused,
--     in case a grant to anon ever comes back.
-- A signed-in caller asking about an attempt that doesn't exist gets the same
-- "Forbidden" as one that isn't theirs, so attempt ids can't be probed.
--
-- The body is otherwise add-unpaid-leave-pay.sql's, unchanged.
-- Apply by hand in the SQL editor, after add-unpaid-leave-pay.sql and
-- add-household-managers.sql. Idempotent and safe to re-run.
-- Tested in PGlite: supabase/tests/payout-result-auth.test.mjs.

CREATE OR REPLACE FUNCTION public.record_payout_attempt_result(
    p_attempt_id UUID,
    p_status TEXT,
    p_psp_payout_id TEXT DEFAULT NULL,
    p_failure_reason TEXT DEFAULT NULL
)
RETURNS TABLE (payslip_id UUID, payslip_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_jwt_role TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    v_payslip_id UUID;
    v_new_payslip_status TEXT;
BEGIN
    IF p_status NOT IN ('accepted', 'succeeded', 'failed', 'cancelled', 'ambiguous') THEN
        RAISE EXCEPTION 'Invalid attempt status: %', p_status;
    END IF;

    IF v_uid IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
              FROM public.payout_attempts pa
              JOIN public.payslips p ON p.id = pa.payslip_id
              JOIN public.helper_profiles hp ON hp.id = p.helper_id
              JOIN public.household_managers hm
                ON hm.household_id = hp.household_id AND hm.user_id = v_uid
             WHERE pa.id = p_attempt_id
               AND hm.role IN ('primary_manager', 'co_manager', 'remote_admin')
        ) THEN
            RAISE EXCEPTION 'Forbidden: only a manager of this household can record a payout result';
        END IF;
    ELSIF v_jwt_role IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Forbidden: sign in to record a payout result';
    END IF;

    UPDATE public.payout_attempts
    SET status = p_status,
        psp_payout_id = COALESCE(p_psp_payout_id, psp_payout_id),
        failure_reason = p_failure_reason,
        resolved_at = CASE
            WHEN p_status IN ('succeeded', 'failed', 'cancelled') THEN timezone('utc', now())
            ELSE resolved_at
        END
    WHERE id = p_attempt_id
    RETURNING payout_attempts.payslip_id INTO v_payslip_id;

    IF v_payslip_id IS NULL THEN
        RAISE EXCEPTION 'Payout attempt not found';
    END IF;

    v_new_payslip_status := CASE p_status
        WHEN 'accepted'  THEN 'processing'
        WHEN 'succeeded' THEN 'succeeded'
        WHEN 'failed'    THEN 'failed'
        WHEN 'cancelled' THEN 'failed'
        WHEN 'ambiguous' THEN 'needs_review'
    END;

    UPDATE public.payslips
    SET payout_status = v_new_payslip_status,
        failure_reason = p_failure_reason,
        payout_external_id = COALESCE(p_psp_payout_id, payout_external_id),
        confirmed_at = CASE
            WHEN p_status IN ('succeeded', 'failed', 'cancelled') THEN timezone('utc', now())
            ELSE confirmed_at
        END
    WHERE id = v_payslip_id;

    -- Only a definitively-not-paid outcome releases what the payslip took.
    -- 'ambiguous' must NOT: it may already have been paid out.
    IF p_status IN ('failed', 'cancelled') THEN
        UPDATE public.vales
        SET settled_in_payslip_id = NULL
        WHERE settled_in_payslip_id = v_payslip_id;
        UPDATE public.leave_requests
        SET settled_in_payslip_id = NULL
        WHERE settled_in_payslip_id = v_payslip_id;
    END IF;

    RETURN QUERY SELECT v_payslip_id, v_new_payslip_status;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT) TO authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT) TO service_role;
    END IF;
END;
$$;
