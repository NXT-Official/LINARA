-- Cancelled tasks stay on the record instead of being deleted. Apply by hand
-- in the Supabase SQL editor, AFTER add-unpaid-leave-pay.sql (it replaces
-- employment_end_preview as that file left it). Idempotent and safe to
-- re-run. Tested in PGlite: supabase/tests/cancelled-tasks.test.mjs.
--
-- Before this, cancelling a task (Needs you) deleted the ticket, so a
-- cancelled task vanished from the planner and from her week with no trace.
-- Now it's a status, 'cancelled', with who and when stamped by a trigger.
--
--   * Both apps leave cancelled tasks off the board, the Pass, Today and every
--     "still to do" count; the planner and her My Week show them struck
--     through, with who cancelled them.
--   * Restoring one is setting it back to 'todo'; the trigger clears the stamp.
--   * cancelled_by has NO foreign key on purpose: both apps embed the
--     creator's name through tickets -> user_profiles, and a second link
--     between those tables would make that embed ambiguous to PostgREST and
--     break every ticket query. The name is snapshotted instead.
--   * Ending an employment leaves cancelled tasks alone (it used to hand every
--     not-done task to the next person as a fresh to-do).

-- --------------------------------------------------------------------------
-- 1. The status, whatever the live CHECK constraint happens to be named.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid = 'public.tickets'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%status%'
          AND pg_get_constraintdef(c.oid) ILIKE '%blocked%'
    LOOP
        EXECUTE format('ALTER TABLE public.tickets DROP CONSTRAINT %I', v_name);
    END LOOP;
END $$;

ALTER TABLE public.tickets
    ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('todo', 'in_progress', 'done', 'blocked', 'cancelled'));

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;

-- --------------------------------------------------------------------------
-- 2. Who and when, stamped whichever app (or the API) does it. Definer so it
--    can read the canceller's name whatever the caller's policies.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tickets_stamp_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
        NEW.cancelled_at := timezone('utc', now());
        NEW.cancelled_by := auth.uid();
        NEW.cancelled_by_name := (
            SELECT up.full_name FROM public.user_profiles up WHERE up.id = auth.uid()
        );
    ELSIF NEW.status IS DISTINCT FROM 'cancelled' AND OLD.status = 'cancelled' THEN
        NEW.cancelled_at := NULL;
        NEW.cancelled_by := NULL;
        NEW.cancelled_by_name := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_stamp_cancel ON public.tickets;
CREATE TRIGGER tickets_stamp_cancel
    BEFORE UPDATE OF status ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_stamp_cancel();

-- --------------------------------------------------------------------------
-- 3. Ending an employment: cancelled tasks are neither counted as open nor
--    handed on. Otherwise as add-unpaid-leave-pay.sql and
--    add-employment-end.sql left them.
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
    v_latest_paid_end DATE;
    v_problem TEXT;
    v_unpaid INT;
    v_leave RECORD;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can end an employment';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles
    WHERE id = p_helper_id AND household_id = v_household_id;
    IF v_hp.id IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_tz := public.household_timezone(v_household_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_started := COALESCE(v_hp.started_on, (v_hp.created_at AT TIME ZONE v_tz)::date);

    SELECT b.cutoff_start, b.cutoff_end INTO v_start, v_full_end
    FROM public.cutoff_bounds_for(p_last_day, v_hp.payday_interval) b;
    v_start := GREATEST(v_start, v_started);

    SELECT MAX(p.cutoff_end) INTO v_latest_paid_end
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id AND p.kind = 'regular' AND p.payout_status <> 'failed';

    -- Closed periods before her final one with no payment of either kind.
    SELECT COUNT(*) INTO v_unpaid
    FROM public.helper_pay_periods(p_helper_id) pp
    WHERE pp.payslip_id IS NULL AND pp.full_end < v_start;

    -- What her final pay will deduct if she leaves on p_last_day.
    SELECT * INTO v_leave FROM public.unpaid_leave_due(p_helper_id, p_last_day, true);

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
        'full_cutoff_start', (SELECT b.cutoff_start FROM public.cutoff_bounds_for(p_last_day, v_hp.payday_interval) b),
        'full_cutoff_end', v_full_end,
        'final_cutoff_paid', EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.kind = 'regular'
              AND p.payout_status <> 'failed'
              AND p.cutoff_start <= v_full_end AND p.cutoff_end >= v_start
        ),
        'unpaid_periods', v_unpaid,
        'open_tasks', (
            SELECT COUNT(*) FROM public.tickets t
            WHERE t.helper_id = p_helper_id AND t.status NOT IN ('done', 'cancelled')
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
        'unpaid_leave_days', v_leave.leave_days,
        'unpaid_leave_deduction', v_leave.deduction,
        'pending_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'pending'
        ),
        'future_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'approved' AND r.rest_date > p_last_day
        ),
        'rest_owed_minutes', public.rest_owed_balance_minutes(p_helper_id),
        'base_paid_this_year', (
            SELECT COALESCE(SUM(p.base_pay - p.unpaid_leave_deduction), 0) FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.kind = 'regular'
              AND p.payout_status = 'succeeded'
              AND COALESCE(p.helper_ack, 'confirmed') <> 'disputed'
              AND EXTRACT(YEAR FROM p.cutoff_end) = EXTRACT(YEAR FROM p_last_day)
        )
    );
END;
$$;

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
        WHERE helper_id = p_helper_id AND status NOT IN ('done', 'cancelled');
        GET DIAGNOSTICS v_tasks = ROW_COUNT;
    ELSE
        DELETE FROM public.tickets WHERE helper_id = p_helper_id AND status NOT IN ('done', 'cancelled');
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
