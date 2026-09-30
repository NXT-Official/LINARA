-- Closes the rest of KNOWN_GAPS.md O4: a helper can leave a household, the
-- household keeps its records, she keeps hers, and she can join another
-- household later with the same account. Apply by hand in the Supabase SQL
-- editor, after add-household-timezone-and-cutoffs.sql and
-- add-rest-off-validation.sql. Idempotent and safe to re-run.
--
-- --------------------------------------------------------------------------
-- THE MODEL
-- --------------------------------------------------------------------------
-- One helper_profiles row is one EMPLOYMENT (one household, one set of terms),
-- not one person. The person is her auth user / user_profiles row, linked to
-- each employment by helper_profiles.user_id. That was already true of the
-- schema; nothing ever exercised it, because nothing ever ended an employment.
--
--   * Ending (end_helper_employment, manager-only): the employment row goes
--     INACTIVE with ended_on = her last working day and stays in the household
--     with every payslip, ledger entry and done task -- RA 10361 retention is
--     the household's obligation and nothing here deletes a payslip. Her
--     user_profiles.household_id is cleared, so current_household_id() stops
--     admitting her to the household's live data (board, pantry, utos).
--   * Her history (new *_own_read policies): she can still READ her own
--     employment rows, payslips, rest-off requests, tasks and the household's
--     name, in every household she has worked for. Read-only: nothing lets a
--     former employee write to a household.
--   * Joining again (join_household_with_invite): an existing helper account
--     claims a new invite code. Same employment-row activation as
--     claim_helper_invite, minus creating the account. One ACTIVE employment
--     at a time, because current_household_id() is single-valued.
--   * Final pay (helper_pay_cutoff + initiate_payslip, at the bottom): an ended
--     employment's payable cutoff is the one containing ended_on, cut short at
--     ended_on. The web pro-rates the base for the days actually worked.
--
-- What deliberately does NOT happen on ending, and why:
--   * Rest owed is not cashed out. After-hours work is time, not money (C39),
--     and there is no peso path out of the ledger. The web shows the balance
--     when ending so the household can settle it with her directly.
--   * 13th-month pay is not computed or paid anywhere in Linara yet (O15). The
--     web shows an estimate when ending, for the same reason.
--   * An unpaid EARLIER cutoff can't be paid through Linara (initiate_payslip
--     only ever pays the current -- or, now, final -- cutoff). The preview
--     warns about it.

-- --------------------------------------------------------------------------
-- 1. Columns
-- --------------------------------------------------------------------------
ALTER TABLE public.helper_profiles
    ADD COLUMN IF NOT EXISTS ended_on DATE,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.helper_profiles.ended_on IS
    'Her last working day in this household (household civil date). Set with '
    'status = INACTIVE by end_helper_employment(); NULL while employed.';

-- A helper between households belongs to none. Managers always have one
-- (bootstrap_manager_household sets it and nothing clears it).
ALTER TABLE public.user_profiles ALTER COLUMN household_id DROP NOT NULL;

-- --------------------------------------------------------------------------
-- 2. Read access to her own history, in any household she has worked for.
--    Additive SELECT policies: Postgres ORs them with the existing
--    household-scoped FOR ALL policies, which keep governing every write.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_self_read ON public.user_profiles;
CREATE POLICY user_profiles_self_read ON public.user_profiles
    FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS helper_profiles_own_read ON public.helper_profiles;
CREATE POLICY helper_profiles_own_read ON public.helper_profiles
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS payslips_own_read ON public.payslips;
CREATE POLICY payslips_own_read ON public.payslips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = payslips.helper_id AND hp.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS rest_off_requests_own_read ON public.rest_off_requests;
CREATE POLICY rest_off_requests_own_read ON public.rest_off_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = rest_off_requests.helper_id AND hp.user_id = auth.uid()
        )
    );

-- Her own tasks only (the record counts the done ones), never the rest of
-- the old household's board.
DROP POLICY IF EXISTS tickets_own_read ON public.tickets;
CREATE POLICY tickets_own_read ON public.tickets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = tickets.helper_id AND hp.user_id = auth.uid()
        )
    );

-- The name on her record ("from the records Reyes Household keeps").
DROP POLICY IF EXISTS households_own_history_read ON public.households;
CREATE POLICY households_own_history_read ON public.households
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.household_id = households.id AND hp.user_id = auth.uid()
        )
    );

-- The Privacy Wall compared helper_id to a scalar subquery, which errors
-- ("more than one row returned") the moment she has a second employment.
-- Same rule, set-valued: her notes, from any of her employments, and still
-- nobody else's -- a manager is never helper_profiles.user_id.
DROP POLICY IF EXISTS helper_notes_privacy ON public.helper_notes;
CREATE POLICY helper_notes_privacy ON public.helper_notes
    FOR ALL USING (
        helper_id IN (SELECT hp.id FROM public.helper_profiles hp WHERE hp.user_id = auth.uid())
    );

-- --------------------------------------------------------------------------
-- 3. The cutoff a helper is paid for right now: the household's current one
--    while she's employed, or -- once ended -- the one containing her last
--    day, ending ON that day. full_cutoff_end is where that cutoff would
--    normally end, so the caller can pro-rate (days worked / days in cutoff).
--    Single source for both initiate_payslip and the web's final-pay figures.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helper_pay_cutoff(p_helper_id UUID)
RETURNS TABLE (cutoff_start DATE, cutoff_end DATE, full_cutoff_end DATE, is_final BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_interval TEXT;
    v_status TEXT;
    v_ended DATE;
    v_final BOOLEAN;
    v_day DATE;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT hp.payday_interval, hp.status, hp.ended_on
      INTO v_interval, v_status, v_ended
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id;

    IF v_interval IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_final := v_status = 'INACTIVE' AND v_ended IS NOT NULL;
    v_day := CASE
        WHEN v_final THEN v_ended
        ELSE (now() AT TIME ZONE public.household_timezone(v_household_id))::date
    END;

    RETURN QUERY
    SELECT b.cutoff_start,
           CASE WHEN v_final THEN v_ended ELSE b.cutoff_end END,
           b.cutoff_end,
           v_final
    FROM public.cutoff_bounds_for(v_day, v_interval) b;
END;
$$;

-- --------------------------------------------------------------------------
-- 4. What ending her employment on p_last_day would do -- read-only, for the
--    web's confirmation screen. Validation problems come back as `problem`
--    (a code the UI words) rather than as an exception, so the manager sees
--    why before pressing anything. end_helper_employment re-checks them all.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employment_end_preview(p_helper_id UUID, p_last_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_hp public.helper_profiles%ROWTYPE;
    v_tz TEXT;
    v_today DATE;
    v_started DATE;
    v_start DATE;
    v_full_end DATE;
    v_prev_start DATE;
    v_prev_end DATE;
    v_latest_paid_end DATE;
    v_problem TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can end an employment';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles
    WHERE id = p_helper_id AND household_id = v_household_id;
    IF v_hp.id IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_tz := public.household_timezone(v_household_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_started := (v_hp.created_at AT TIME ZONE v_tz)::date;

    SELECT b.cutoff_start, b.cutoff_end INTO v_start, v_full_end
    FROM public.cutoff_bounds_for(p_last_day, v_hp.payday_interval) b;
    SELECT b.cutoff_start, b.cutoff_end INTO v_prev_start, v_prev_end
    FROM public.cutoff_bounds_for(v_start - 1, v_hp.payday_interval) b;

    SELECT MAX(p.cutoff_end) INTO v_latest_paid_end
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id AND p.payout_status <> 'failed';

    v_problem := CASE
        WHEN v_hp.status <> 'ACTIVE' THEN 'not_active'
        WHEN p_last_day > v_today THEN 'future'
        WHEN p_last_day < v_started THEN 'before_start'
        WHEN v_latest_paid_end IS NOT NULL AND v_latest_paid_end > p_last_day THEN 'already_paid_past'
        ELSE NULL
    END;

    RETURN jsonb_build_object(
        'problem', v_problem,
        'today', v_today,
        'started_on', v_started,
        'latest_paid_cutoff_end', v_latest_paid_end,
        'final_cutoff_start', v_start,
        'final_cutoff_end', p_last_day,
        'full_cutoff_end', v_full_end,
        'final_cutoff_paid', EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id
              AND p.cutoff_start = v_start AND p.cutoff_end = p_last_day
              AND p.payout_status <> 'failed'
        ),
        'previous_cutoff_start', v_prev_start,
        'previous_cutoff_end', v_prev_end,
        -- Only a warning if she was employed during it at all.
        'previous_cutoff_unpaid', v_started <= v_prev_end AND NOT EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id
              AND p.cutoff_start = v_prev_start AND p.cutoff_end = v_prev_end
              AND p.payout_status <> 'failed'
        ),
        'open_tasks', (
            SELECT COUNT(*) FROM public.tickets t
            WHERE t.helper_id = p_helper_id AND t.status <> 'done'
        ),
        'pending_vales', (
            SELECT COUNT(*) FROM public.vales v
            WHERE v.helper_id = p_helper_id AND v.status = 'pending'
        ),
        'unsettled_vale_total', (
            SELECT COALESCE(SUM(v.amount), 0) FROM public.vales v
            WHERE v.helper_id = p_helper_id AND v.status = 'approved'
              AND v.settled_in_payslip_id IS NULL
        ),
        'pending_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'pending'
        ),
        'future_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'approved' AND r.rest_date > p_last_day
        ),
        'rest_owed_minutes', public.rest_owed_balance_minutes(p_helper_id),
        -- For the 13th-month estimate: basic pay actually paid this calendar
        -- year through Linara. The web adds the final cutoff's base and divides
        -- by 12 (RA 10361 Sec. 25's 1/12 of basic salary earned in the year).
        'base_paid_this_year', (
            SELECT COALESCE(SUM(p.base_pay), 0) FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.payout_status = 'succeeded'
              AND EXTRACT(YEAR FROM p.cutoff_end) = EXTRACT(YEAR FROM p_last_day)
              AND NOT (p.cutoff_start = v_start AND p.cutoff_end = p_last_day)
        )
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 5. End an employment. Manager-only, one transaction.
--
--    Her not-done tasks either move to another active helper (reset to todo,
--    since "blocked"/"in progress" were HER states) or are removed -- a board
--    task assigned to someone who no longer works here would sit there
--    forever. Pending vale and rest-off requests are closed, and approved
--    rest-off after her last day is cancelled. Her quick utos are cleared.
--    Done tasks, payslips, ledger entries and rest-off history all stay.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_helper_employment(
    p_helper_id UUID,
    p_last_day DATE,
    p_reassign_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_hp public.helper_profiles%ROWTYPE;
    v_preview JSONB;
    v_tasks INT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can end an employment';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles
    WHERE id = p_helper_id AND household_id = v_household_id
    FOR UPDATE;
    IF v_hp.id IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_preview := public.employment_end_preview(p_helper_id, p_last_day);
    IF v_preview->>'problem' IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot end this employment: %', v_preview->>'problem';
    END IF;

    IF p_reassign_to IS NOT NULL THEN
        IF p_reassign_to = p_helper_id OR NOT EXISTS (
            SELECT 1 FROM public.helper_profiles
            WHERE id = p_reassign_to AND household_id = v_household_id AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'Tasks can only move to another active helper in this household';
        END IF;

        UPDATE public.tickets
        SET helper_id = p_reassign_to,
            status = 'todo',
            block_reason = NULL,
            actual_start = NULL
        WHERE helper_id = p_helper_id AND status <> 'done';
        GET DIAGNOSTICS v_tasks = ROW_COUNT;
    ELSE
        DELETE FROM public.tickets WHERE helper_id = p_helper_id AND status <> 'done';
        GET DIAGNOSTICS v_tasks = ROW_COUNT;
    END IF;

    DELETE FROM public.quick_utos WHERE recipient_id = p_helper_id;

    UPDATE public.vales SET status = 'declined'
    WHERE helper_id = p_helper_id AND status = 'pending';

    UPDATE public.rest_off_requests
    SET status = 'declined',
        decline_reason = 'Employment ended',
        decided_by = auth.uid(),
        decided_at = timezone('utc', now())
    WHERE helper_id = p_helper_id AND status = 'pending';

    UPDATE public.rest_off_requests
    SET status = 'cancelled',
        decided_by = auth.uid(),
        decided_at = timezone('utc', now())
    WHERE helper_id = p_helper_id AND status = 'approved' AND rest_date > p_last_day;

    UPDATE public.helper_profiles
    SET status = 'INACTIVE',
        ended_on = p_last_day,
        ended_at = timezone('utc', now()),
        ended_by = auth.uid(),
        invite_code = NULL,
        manual_status = NULL,
        manual_available_until = NULL
    WHERE id = p_helper_id;

    -- Detach her account from the household's live data. Guarded so it can
    -- only ever clear a HELPER's link to THIS household.
    IF v_hp.user_id IS NOT NULL THEN
        UPDATE public.user_profiles
        SET household_id = NULL
        WHERE id = v_hp.user_id AND user_type = 'helper' AND household_id = v_household_id;
    END IF;

    RETURN jsonb_build_object(
        'helper_id', p_helper_id,
        'ended_on', p_last_day,
        'tasks_moved', CASE WHEN p_reassign_to IS NOT NULL THEN v_tasks ELSE 0 END,
        'tasks_removed', CASE WHEN p_reassign_to IS NULL THEN v_tasks ELSE 0 END
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 6. An existing helper account joins a household with a new invite code.
--    claim_helper_invite creates the account's user_profiles row and so can
--    only run once per account; this is the same activation for an account
--    that already has one (she worked somewhere before, left, and has a new
--    employer). Returning to the SAME household is just a new invite there.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_household_with_invite(p_invite_code TEXT)
RETURNS TABLE (helper_id UUID, household_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_user_type TEXT;
    v_invite public.helper_profiles%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT up.user_type INTO v_user_type FROM public.user_profiles up WHERE up.id = v_uid;
    IF v_user_type IS DISTINCT FROM 'helper' THEN
        RAISE EXCEPTION 'Only a helper account can join a household with an invite code';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.helper_profiles hp
        WHERE hp.user_id = v_uid AND hp.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'This account is still employed in a household';
    END IF;

    SELECT * INTO v_invite FROM public.helper_profiles hp
    WHERE hp.invite_code = p_invite_code AND hp.status = 'PENDING_CLAIM'
    FOR UPDATE;
    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION 'Invitation code not found or already claimed';
    END IF;

    UPDATE public.helper_profiles hp
    SET user_id = v_uid, status = 'ACTIVE'
    WHERE hp.id = v_invite.id;

    UPDATE public.user_profiles up
    SET household_id = v_invite.household_id
    WHERE up.id = v_uid;

    RETURN QUERY SELECT v_invite.id, v_invite.household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.helper_pay_cutoff(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.employment_end_preview(UUID, DATE) FROM public, anon;
REVOKE ALL ON FUNCTION public.end_helper_employment(UUID, DATE, UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.join_household_with_invite(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.helper_pay_cutoff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employment_end_preview(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_helper_employment(UUID, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household_with_invite(TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. initiate_payslip, now paying the cutoff helper_pay_cutoff names: the
--    current one while she's employed (unchanged behaviour), the final,
--    shortened one once she has left. Same signature, same net-pay rule,
--    same double-pay guard (payslips_one_per_cutoff keys on the shortened
--    bounds, and end_helper_employment refuses a last day inside a cutoff
--    that was already paid in full). An unclaimed invite can't be paid.
--
--    Kept LAST in this file on purpose: src/features/pay/net-pay.test.ts
--    reads everything from this CREATE FUNCTION onward and asserts it never
--    touches the ledger.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT);

CREATE FUNCTION public.initiate_payslip(
    p_helper_id UUID,
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
    attempt_number INT,
    cutoff_start DATE,
    cutoff_end DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_helper_status TEXT;
    v_cutoff_start DATE;
    v_cutoff_end DATE;
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

    SELECT hp.status INTO v_helper_status
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id;

    IF v_helper_status IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;
    IF v_helper_status = 'PENDING_CLAIM' THEN
        RAISE EXCEPTION 'This invite has not been claimed yet';
    END IF;

    SELECT c.cutoff_start, c.cutoff_end
      INTO v_cutoff_start, v_cutoff_end
    FROM public.helper_pay_cutoff(p_helper_id) c;

    SELECT id, payout_status
      INTO v_existing_id, v_existing_status
    FROM public.payslips
    WHERE helper_id = p_helper_id
      AND payslips.cutoff_start = v_cutoff_start
      AND payslips.cutoff_end = v_cutoff_end
    FOR UPDATE;

    IF FOUND THEN
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
                p_helper_id, v_cutoff_start, v_cutoff_end, p_base_pay, p_statutory_employee_share,
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
                        v_attempt_id, v_reference_id, v_attempt_no,
                        v_cutoff_start, v_cutoff_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT)
    TO authenticated;
