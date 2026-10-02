-- Off-hours work reaches the after-hours ledger whichever app closes the task
-- (KNOWN_GAPS.md O25). Apply by hand in the Supabase SQL editor, AFTER
-- add-cancelled-tasks.sql and fix-helper-write-access.sql. Idempotent and safe
-- to re-run. Tested in PGlite: supabase/tests/ticket-ledger.test.mjs.
--
-- Before this, only the web wrote ledger_entries: use-task-board.ts's
-- onComplete -> use-ledger.ts's record, when a MANAGER clicked Done, and only
-- for the first active helper. Nearly every task is closed by the helper on
-- her phone, so her off-hours work never accrued rest owed, although the app
-- told her it would. Now a trigger on tickets does it for every helper:
--
--   * A task becoming 'done' gets one ledger entry if it was finished outside
--     her shift, the same rule as the web's statusFor() + classify(): off when
--     it's quiet hours (22:00-06:00), her rest day, her break, before or after
--     her shift, or her approved time off; "Available" (her own opt-in) still
--     counts as off-shift work. A task sent off-hours or as an emergency always
--     counts. Times are the household's clock (households.timezone).
--   * Minutes run from actual_start (or five minutes, if she never pressed
--     Start) to actual_end, as the web did.
--   * Unticking it (done -> anything else) removes that entry again, so a
--     mistaken tick never leaves rest owed behind. Rest owed is a pool, not a
--     line on a payslip, so nothing else points at the entry.
--   * The web stops writing task entries itself in the same change, so nothing
--     is counted twice. Quick Utos entries are still written by the web.
--
-- SECURITY DEFINER: since fix-helper-write-access.sql only a manager may write
-- ledger_entries directly, and this has to run on the helper's own update.

-- --------------------------------------------------------------------------
-- 1. One entry per task.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_one_per_ticket
    ON public.ledger_entries (associated_ticket_id)
    WHERE associated_ticket_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2. Was this moment off her shift, and as what? NULL: on shift, not owed.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_ledger_source(
    p_helper_id UUID,
    p_at TIMESTAMPTZ,
    p_after_hours BOOLEAN,
    p_emergency BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hp RECORD;
    v_local TIMESTAMP;
    v_time TIME;
    v_date DATE;
    v_quiet BOOLEAN;
    v_rest_day BOOLEAN;
    v_in_break BOOLEAN;
    v_time_off BOOLEAN;
    v_on_shift BOOLEAN;
BEGIN
    SELECT hp.shift_start, hp.shift_end, hp.break_start, hp.break_end, hp.weekly_rest_day,
           h.timezone
      INTO v_hp
      FROM public.helper_profiles hp
      JOIN public.households h ON h.id = hp.household_id
     WHERE hp.id = p_helper_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_local := p_at AT TIME ZONE v_hp.timezone;
    v_time := v_local::time;
    v_date := v_local::date;
    v_quiet := v_time >= TIME '22:00' OR v_time < TIME '06:00';
    -- weekly_rest_day: Sunday = 0, the same as Postgres' dow.
    v_rest_day := EXTRACT(DOW FROM v_local)::int = v_hp.weekly_rest_day;
    v_in_break := v_hp.break_start IS NOT NULL AND v_hp.break_end IS NOT NULL
        AND v_time >= v_hp.break_start AND v_time < v_hp.break_end;
    v_time_off :=
        EXISTS (
            SELECT 1 FROM public.rest_off_requests r
             WHERE r.helper_id = p_helper_id AND r.status = 'approved'
               AND r.rest_date = v_date
               AND v_time >= r.start_time AND v_time < r.end_time
        )
        OR EXISTS (
            SELECT 1 FROM public.leave_requests l
             WHERE l.helper_id = p_helper_id AND l.status = 'approved'
               AND v_date BETWEEN l.start_date AND l.end_date
        );
    v_on_shift := NOT v_quiet AND NOT v_rest_day AND NOT v_in_break AND NOT v_time_off
        AND v_time >= v_hp.shift_start AND v_time < v_hp.shift_end;

    IF v_on_shift AND NOT COALESCE(p_after_hours, FALSE) AND NOT COALESCE(p_emergency, FALSE) THEN
        RETURN NULL;
    END IF;

    -- use-ledger.ts classify(), in its order; "available" and a plain
    -- override are both 'overtime' once written.
    IF COALESCE(p_emergency, FALSE) THEN
        RETURN 'emergency';
    ELSIF v_rest_day THEN
        RETURN 'rest_day_work';
    ELSIF v_in_break THEN
        RETURN 'rest_break_work';
    END IF;
    RETURN 'overtime';
END;
$$;

REVOKE ALL ON FUNCTION public.ticket_ledger_source(UUID, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 3. Done adds the entry; undone takes it away.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_ledger_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_done TIMESTAMPTZ;
    v_start TIMESTAMPTZ;
    v_source TEXT;
BEGIN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
        -- An unassigned task done by a manager is nobody's after-hours work.
        IF NEW.helper_id IS NULL THEN
            RETURN NEW;
        END IF;
        -- Her phone's clock stamps actual_end; never trust one in the future.
        v_done := LEAST(COALESCE(NEW.actual_end, now()), now());
        v_start := COALESCE(NEW.actual_start, v_done - INTERVAL '5 minutes');
        v_source := public.ticket_ledger_source(
            NEW.helper_id, v_done, NEW.is_after_hours, NEW.emergency
        );
        IF v_source IS NOT NULL THEN
            -- resolution_type left out: ledger_entries_default_resolution
            -- fills it from her own default, as for the web's entries.
            INSERT INTO public.ledger_entries (
                helper_id, source_type, associated_ticket_id, title, kind,
                duration_minutes, resolved, resolved_at, created_at
            ) VALUES (
                NEW.helper_id, v_source, NEW.id, NEW.title, 'task',
                GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_done - v_start)) / 60)::int),
                TRUE, v_done, v_done
            )
            ON CONFLICT (associated_ticket_id) WHERE associated_ticket_id IS NOT NULL
            DO NOTHING;
        END IF;
    ELSIF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
        DELETE FROM public.ledger_entries WHERE associated_ticket_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ticket_ledger_sync() FROM PUBLIC;

DROP TRIGGER IF EXISTS tickets_ledger_sync ON public.tickets;
CREATE TRIGGER tickets_ledger_sync
    AFTER UPDATE OF status ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.ticket_ledger_sync();
