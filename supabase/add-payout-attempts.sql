-- Session A' of PAYMENTS_REMEDIATION.md: move the payout path onto the
-- industry-standard "intent + attempts" model. Apply by hand in the Supabase
-- SQL editor. Idempotent and safe to re-run.
--
-- !! ORDERING: run supabase/cleanup-c35-legacy-payslip.sql FIRST. !!
-- That cleanup targets rows by payslips.payout_reference_id, which THIS
-- migration drops. Running them the other way round leaves the legacy row
-- stranded with no easy handle.
--
-- Depends on add-payslips-table.sql and add-payslip-double-pay-guards.sql.
--
-- --------------------------------------------------------------------------
-- WHY -- two different idempotency problems were conflated
-- --------------------------------------------------------------------------
-- add-payslip-double-pay-guards.sql (C36) fixed double-pay, but solved both of
-- these with one mechanism:
--
--   BUSINESS idempotency -- "never create two payouts for one cutoff".
--     Scope: the logical payout. Lifetime: permanent.
--     Correct mechanism: a DB unique constraint. We have this, and it stays:
--     payslips_one_per_cutoff on (helper_id, cutoff_start, cutoff_end).
--
--   TRANSPORT idempotency -- "never let one network retry become two API
--     calls". Scope: a single HTTP request. Lifetime: the PSP's retention
--     window (Stripe/Adyen ~24h; Xendit's is undocumented -- Session 0 Q6).
--     Correct mechanism: a per-ATTEMPT idempotency key.
--
-- C36 derived ONE key per (helper, cutoff) and reused it forever. That made
-- the transport key permanent, which has two consequences:
--   1. A payout CANCELLED at the PSP can never be re-sent for that cutoff --
--      the replayed key returns DUPLICATE, so the code marks the row
--      'processing' for a payout that is not in flight. Dead end.
--   2. The protection silently expires anyway. Once the PSP forgets the key,
--      reuse buys no deduplication -- while still blocking a legitimate
--      re-send. Worst of both.
--
-- This migration splits them the way Stripe (PaymentIntent -> Charges), Adyen
-- and PayPal do:
--   public.payslips         -- the INTENT. One per (helper, cutoff). Carries
--                              the unique constraint and the rolled-up status.
--   public.payout_attempts  -- APPEND-ONLY. One row per Xendit API call, each
--                              with its OWN reference id / idempotency key.
--
-- Double-pay is then prevented by the unique constraint plus the status
-- machine (only a 'failed' payslip may spawn a new attempt), NOT by key reuse
-- -- which was never the right tool for "the manager clicked again an hour
-- later". That is a business-logic problem, and the caller additionally
-- reconciles against Xendit (GET by reference_id) before retrying an ambiguous
-- attempt. See src/features/pay/pay.actions.ts.
--
-- Payoff: 'cancelled' now rolls the payslip up to 'failed', and the retry
-- mints a BRAND NEW attempt with a BRAND NEW key -- so the cancelled-payout
-- dead end simply cannot occur.

-- --------------------------------------------------------------------------
-- 1. The attempts table.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payslip_id UUID NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
    -- 1, 2, 3... within a payslip. Human-readable ordering for support.
    attempt_number INT NOT NULL,
    -- Sent to Xendit as BOTH `reference_id` (body) and `Idempotency-key`
    -- (header) -- their docs explicitly allow the same value for both. Fresh
    -- per attempt, and UNIQUE so a bug can never reuse one by accident. This
    -- is also the handle used to reconcile against Xendit
    -- (GET /v2/payouts?reference_id=...) when an attempt's outcome is unknown.
    reference_id TEXT NOT NULL UNIQUE,
    -- Xendit's own id ("disb-..."), known only once they accept.
    psp_payout_id TEXT,
    -- sending   -- row written, HTTP call not yet resolved
    -- accepted  -- Xendit returned 2xx
    -- succeeded -- terminal success (webhook)
    -- failed    -- terminal failure (Xendit rejected, or webhook reported)
    -- cancelled -- cancelled at Xendit
    -- ambiguous -- outcome genuinely unknown; needs human/PSP reconciliation
    status TEXT NOT NULL DEFAULT 'sending'
        CHECK (status IN ('sending', 'accepted', 'succeeded', 'failed', 'cancelled', 'ambiguous')),
    failure_reason TEXT,
    -- What we actually asked Xendit to pay, in PESOS (major units -- see
    -- KNOWN_GAPS.md C35). Snapshotted per attempt so a later reconciliation
    -- can prove what was requested, which is precisely what C35 lacked.
    amount_sent NUMERIC(10,2) NOT NULL,
    channel_code TEXT NOT NULL CHECK (channel_code IN ('PH_GCASH', 'PH_PAYMAYA')),
    requested_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at TIMESTAMPTZ,
    UNIQUE (payslip_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payout_attempts_payslip
    ON public.payout_attempts (payslip_id, attempt_number DESC);

-- --------------------------------------------------------------------------
-- 2. RLS -- same "scope via join" pattern as payslips_isolation, one hop
--    further out (payout_attempts -> payslips -> helper_profiles).
-- --------------------------------------------------------------------------
ALTER TABLE public.payout_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_attempts_isolation ON public.payout_attempts;
CREATE POLICY payout_attempts_isolation ON public.payout_attempts
    FOR ALL USING (
        EXISTS (
            SELECT 1
            FROM public.payslips p
            JOIN public.helper_profiles hp ON hp.id = p.helper_id
            WHERE p.id = payout_attempts.payslip_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------------------------------
-- 3. Backfill any pre-existing payslips into a first attempt, so no row is
--    left without history. No-op if cleanup-c35-legacy-payslip.sql already
--    emptied the table. Guarded on the column still existing so this migration
--    stays re-runnable after step 5 drops it.
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payslips'
          AND column_name = 'payout_reference_id'
    ) THEN
        EXECUTE $backfill$
            INSERT INTO public.payout_attempts (
                payslip_id, attempt_number, reference_id, psp_payout_id,
                status, failure_reason, amount_sent, channel_code,
                requested_by, created_at, resolved_at
            )
            SELECT
                p.id,
                1,
                p.payout_reference_id,
                p.payout_external_id,
                CASE p.payout_status
                    WHEN 'pending_send'  THEN 'sending'
                    WHEN 'processing'    THEN 'accepted'
                    WHEN 'succeeded'     THEN 'succeeded'
                    WHEN 'failed'        THEN 'failed'
                    WHEN 'needs_review'  THEN 'ambiguous'
                    ELSE 'ambiguous'
                END,
                p.failure_reason,
                p.net_pay,
                p.payout_channel_code,
                p.requested_by,
                p.requested_at,
                p.confirmed_at
            FROM public.payslips p
            WHERE NOT EXISTS (
                SELECT 1 FROM public.payout_attempts a WHERE a.payslip_id = p.id
            )
        $backfill$;
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 4. Roll an attempt's outcome up to its payslip, atomically. One place that
--    knows the attempt-status -> payslip-status mapping, called by both the
--    web caller and xendit-payout-webhook (service role bypasses RLS).
-- --------------------------------------------------------------------------
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
    v_payslip_id UUID;
    v_new_payslip_status TEXT;
BEGIN
    IF p_status NOT IN ('accepted', 'succeeded', 'failed', 'cancelled', 'ambiguous') THEN
        RAISE EXCEPTION 'Invalid attempt status: %', p_status;
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

    -- Attempt status -> payslip status. 'cancelled' deliberately maps to
    -- 'failed': the payout is definitively not happening, so the cutoff should
    -- be retryable -- and because keys are now per-attempt, that retry gets a
    -- fresh one instead of replaying a dead key.
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

    -- Only a definitively-not-paid outcome releases the vales. 'ambiguous'
    -- must NOT -- they may already have been paid out.
    IF p_status IN ('failed', 'cancelled') THEN
        UPDATE public.vales
        SET settled_in_payslip_id = NULL
        WHERE settled_in_payslip_id = v_payslip_id;
    END IF;

    RETURN QUERY SELECT v_payslip_id, v_new_payslip_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT)
    TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Rewrite initiate_payslip: same guards and race protection as C36, but it
--    now spawns a fresh ATTEMPT (with a fresh key) instead of reusing one.
-- --------------------------------------------------------------------------
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
RETURNS TABLE (
    payslip_id UUID,
    vale_deductions NUMERIC,
    net_pay NUMERIC,
    attempt_id UUID,
    reference_id TEXT,
    attempt_number INT
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
    v_existing_id UUID;
    v_existing_status TEXT;
    v_attempt_id UUID;
    v_attempt_no INT;
    v_reference_id TEXT;
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

    -- Lock the per-cutoff intent row if it exists, serializing two concurrent
    -- calls for the same cutoff. If none exists, payslips_one_per_cutoff
    -- catches the concurrent-INSERT case below instead.
    SELECT id, payout_status
      INTO v_existing_id, v_existing_status
    FROM public.payslips
    WHERE helper_id = p_helper_id
      AND cutoff_start = p_cutoff_start
      AND cutoff_end = p_cutoff_end
    FOR UPDATE;

    IF FOUND THEN
        -- Only a genuinely 'failed' payslip may spawn another attempt.
        -- needs_review must be reconciled by a human first; everything else is
        -- live or already done.
        IF v_existing_status <> 'failed' THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END IF;
        v_payslip_id := v_existing_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_vale_total
    FROM public.vales
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);

    IF v_payslip_id IS NULL THEN
        BEGIN
            INSERT INTO public.payslips (
                helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
                vale_deductions, net_pay, payout_channel_code, requested_by
            )
            VALUES (
                p_helper_id, p_cutoff_start, p_cutoff_end, p_base_pay, p_statutory_employee_share,
                v_vale_total, v_net_pay, p_channel_code, auth.uid()
            )
            RETURNING id INTO v_payslip_id;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END;
    ELSE
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

    -- Fresh attempt, fresh key. gen_random_uuid() rather than a derived value:
    -- the key must NOT be a function of the cutoff, or we are back to the
    -- permanent-key problem this migration exists to fix.
    SELECT COALESCE(MAX(a.attempt_number), 0) + 1 INTO v_attempt_no
    FROM public.payout_attempts a
    WHERE a.payslip_id = v_payslip_id;

    v_reference_id := gen_random_uuid()::text;

    INSERT INTO public.payout_attempts (
        payslip_id, attempt_number, reference_id, status,
        amount_sent, channel_code, requested_by
    )
    VALUES (
        v_payslip_id, v_attempt_no, v_reference_id, 'sending',
        v_net_pay, p_channel_code, auth.uid()
    )
    RETURNING id INTO v_attempt_id;

    UPDATE public.vales
    SET settled_in_payslip_id = v_payslip_id
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_net_pay,
                        v_attempt_id, v_reference_id, v_attempt_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT)
    TO authenticated;

-- --------------------------------------------------------------------------
-- 6. Retire the payslip-level reference id. It now lives on the attempt, and
--    keeping a second copy invites the two from drifting. payout_external_id
--    is KEPT as a denormalized convenience for the Money tab (it mirrors the
--    latest attempt's psp_payout_id, written by record_payout_attempt_result).
--    Neither column is selected by ../LINARA_MOBILE (services/api/payslips.ts
--    lists its columns explicitly) and neither is in this repo's PayslipRow,
--    so dropping is safe for both clients.
-- --------------------------------------------------------------------------
ALTER TABLE public.payslips DROP COLUMN IF EXISTS payout_reference_id;
