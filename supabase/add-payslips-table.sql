-- Closes KNOWN_GAPS.md gap #9: no real archive backed "wage histories" or
-- "HitPay transfers" for the digital payslip (architecture.md Section 5.3,
-- "Future Phase 3 Setup"). Vendor decision: Xendit, not HitPay -- confirmed
-- live against Xendit's sandbox (POST https://api.xendit.co/v2/payouts,
-- channel_code PH_GCASH/PH_PAYMAYA both returned status: "ACCEPTED"); HitPay
-- returned "Feature access denied" on the same class of call and had no
-- self-serve way to enable it, so it was dropped rather than built around.
--
-- One table, not two (payslips + payment_confirmations, as gap #9 sketched
-- both) -- a payslip here always implies an intended payout, so there's no
-- state a payment_confirmations row would capture that payslips.payout_*
-- doesn't already. Same "denormalize a historical snapshot onto one row"
-- reasoning as Closed Gap C10's ledger_entries.title/kind: base_pay/
-- statutory_employee_share/vale_deductions/net_pay are snapshotted at
-- payout time, not recomputed live from helper_profiles.monthly_rate later
-- (which can change -- see Closed Gap C20 -- and shouldn't retroactively
-- reshape a past cutoff's numbers).
--
-- vales.settled_in_payslip_id (user-confirmed scope, not the simpler
-- "snapshot the running total" alternative): approved vales previously had
-- no concept of "which cutoff already deducted this" -- SpendAndPayday's
-- approvedValesTotal was a lifetime running sum. Without this column, a
-- vale approved between two Pay Now clicks would be double-counted (once
-- per payslip that both see it as "approved" with nothing marking it
-- spent). NULL means "not yet applied to a payout"; a failed payout's vales
-- are unsettled back to NULL (see initiate_payslip's caller,
-- src/features/pay/pay.actions.ts) so they're eligible for the next
-- attempt.
--
-- Apply via the Supabase SQL editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    cutoff_start DATE NOT NULL,
    cutoff_end DATE NOT NULL,
    base_pay NUMERIC(10,2) NOT NULL,
    statutory_employee_share NUMERIC(10,2) NOT NULL,
    vale_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PHP',
    payout_provider TEXT NOT NULL DEFAULT 'xendit',
    -- Xendit Philippines domestic e-wallet channel codes (v2/payouts), the
    -- only two verified live against the sandbox -- not PH_GRABPAY/PH_COINS/
    -- bank codes, which plan.md/architecture.md never asked for and weren't
    -- tested.
    payout_channel_code TEXT NOT NULL CHECK (payout_channel_code IN ('PH_GCASH', 'PH_PAYMAYA')),
    -- Our own idempotency key, generated before calling Xendit and sent as
    -- their `reference_id` -- lets a retried initiate call recognize an
    -- in-flight payout instead of double-sending. UNIQUE enforces that at
    -- the DB level too.
    payout_reference_id TEXT NOT NULL UNIQUE,
    -- Xendit's own id for the transfer (their response `id`, e.g.
    -- "disb-..."), filled in after their API call succeeds -- NULL until
    -- then, and stays NULL if the call itself failed before Xendit ever
    -- accepted it.
    payout_external_id TEXT,
    -- pending_send: DB row exists, Xendit hasn't been called yet (can't
    -- happen inside initiate_payslip's own transaction below, but exists as
    -- a real momentary state between that RPC returning and the caller's
    -- Xendit fetch resolving).
    -- processing: Xendit accepted the request (their "ACCEPTED"/"REQUESTED").
    -- succeeded/failed: terminal, set by the xendit-payout-webhook Edge
    -- Function (or immediately, for failed, if the initiating Xendit call
    -- itself errored -- see pay.actions.ts).
    payout_status TEXT NOT NULL CHECK (payout_status IN ('pending_send', 'processing', 'succeeded', 'failed')) DEFAULT 'pending_send',
    failure_reason TEXT,
    requested_by UUID REFERENCES public.user_profiles(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.vales
  ADD COLUMN IF NOT EXISTS settled_in_payslip_id UUID REFERENCES public.payslips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payslips_helper_created ON public.payslips(helper_id, created_at DESC);

-- --------------------------------------------------
-- ROW LEVEL SECURITY
-- --------------------------------------------------
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- Same "no household_id column of its own, scope via join through
-- helper_profiles" pattern as quick_utos_isolation/vales_isolation/
-- ledger_entries_isolation (architecture.md Section 8). The
-- xendit-payout-webhook Edge Function updates payout_status/
-- payout_external_id/confirmed_at using the service-role key, which
-- bypasses RLS entirely (same posture as every other webhook handler
-- pattern in this repo) -- no separate policy needed for that path.
CREATE POLICY payslips_isolation ON public.payslips
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = payslips.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------
-- ATOMIC PAYSLIP + VALE-SETTLEMENT RPC
-- --------------------------------------------------
-- initiate_payslip -- true atomicity requirement (per AGENTS.md's RPC
-- convention), same class of problem as create_appointment_with_preps
-- (Closed Gap C14): inserting the payslip row and marking the vales it
-- covers as settled must happen together, or a crash/error between the two
-- plain client calls would leave vales either double-countable (insert
-- succeeded, settle didn't) or silently dropped (settle succeeded, insert
-- didn't -- vales.settled_in_payslip_id would point at a payslip that was
-- never actually created, which can't happen since it's a FK, but the
-- inverse ordering risk is the same class of bug C14 was written to avoid).
-- Deliberately does NOT call Xendit itself -- Postgres functions can't make
-- outbound HTTPS calls without the pg_net extension, which this schema
-- doesn't use elsewhere, so the caller (initiatePayoutFn in
-- src/features/pay/pay.actions.ts) calls this RPC first, then calls
-- Xendit, then does a second plain (non-atomic, but low-stakes) UPDATE to
-- record the Xendit response -- see that file for why that split is safe.
CREATE OR REPLACE FUNCTION public.initiate_payslip(
    p_helper_id UUID,
    p_cutoff_start DATE,
    p_cutoff_end DATE,
    p_base_pay NUMERIC,
    p_statutory_employee_share NUMERIC,
    p_channel_code TEXT,
    p_reference_id TEXT
)
RETURNS TABLE (payslip_id UUID, vale_deductions NUMERIC, net_pay NUMERIC)
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

    -- Guards against a double "Pay Now" click paying the same cutoff twice.
    -- A prior FAILED attempt for the same cutoff doesn't block a retry --
    -- everything else (pending_send/processing/succeeded) does.
    IF EXISTS (
        SELECT 1 FROM public.payslips
        WHERE helper_id = p_helper_id
          AND cutoff_start = p_cutoff_start
          AND cutoff_end = p_cutoff_end
          AND payout_status != 'failed'
    ) THEN
        RAISE EXCEPTION 'A payslip already exists for this cutoff';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_vale_total
    FROM public.vales
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);

    INSERT INTO public.payslips (
        helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
        vale_deductions, net_pay, payout_channel_code, payout_reference_id, requested_by
    )
    VALUES (
        p_helper_id, p_cutoff_start, p_cutoff_end, p_base_pay, p_statutory_employee_share,
        v_vale_total, v_net_pay, p_channel_code, p_reference_id, auth.uid()
    )
    RETURNING id INTO v_payslip_id;

    UPDATE public.vales
    SET settled_in_payslip_id = v_payslip_id
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_net_pay;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT)
    TO authenticated;
