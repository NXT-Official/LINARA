-- Closes KNOWN_GAPS.md gap #7 (appointments never written to; prep-ticket
-- writes and the appointment record were two separate, non-atomic client
-- calls). Three SECURITY DEFINER RPCs, same pattern as claim_helper_invite/
-- bootstrap_manager_household -- each wraps an appointment write and its
-- prep-ticket writes in one Postgres function (one transaction), replacing
-- use-appointments.ts's old two-sequential-calls approach for create,
-- reschedule, and remove alike (user-confirmed scope: all three, not just
-- create). Manager-only, matching insertHouseSopFn/decideValeFn/
-- updateHouseholdBudgetFn's existing role-check pattern -- appointment
-- scheduling is manager-facing functionality (the Temporal Scheduler),
-- with no legitimate helper-initiated path in plan.md.

-- 1. tickets.appointment_id upgrades from plain TEXT (added by
--    add-ticket-board-columns.sql, back when `appointments` itself wasn't
--    written to at all, so there was nothing to reference) to a real FK.
--    ON DELETE CASCADE means delete_appointment_with_preps below doesn't
--    even need to touch tickets itself -- the schema guarantees it, which
--    also covers any future direct-SQL deletes, not just this RPC.
ALTER TABLE public.tickets
    ALTER COLUMN appointment_id TYPE UUID USING appointment_id::uuid,
    ADD CONSTRAINT tickets_appointment_id_fkey
        FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

-- 2. create_appointment_with_preps -- inserts the appointment row and every
--    prep ticket in one transaction. p_preps is a JSONB array of
--    {title, notes, helper_id, scheduled_start, lead_minutes}.
CREATE OR REPLACE FUNCTION public.create_appointment_with_preps(
    p_title TEXT,
    p_scheduled_time TIMESTAMPTZ,
    p_recipe_type TEXT,
    p_preps JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_appointment_id UUID;
    v_prep JSONB;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can schedule appointments';
    END IF;

    INSERT INTO public.appointments (household_id, title, scheduled_time, recipe_type)
    VALUES (v_household_id, p_title, p_scheduled_time, p_recipe_type)
    RETURNING id INTO v_appointment_id;

    FOR v_prep IN SELECT * FROM jsonb_array_elements(p_preps)
    LOOP
        INSERT INTO public.tickets (
            household_id, title, notes, helper_id, scheduled_start,
            appointment_id, appointment_title, lead_minutes, created_by
        )
        VALUES (
            v_household_id,
            v_prep->>'title',
            v_prep->>'notes',
            (v_prep->>'helper_id')::UUID,
            (v_prep->>'scheduled_start')::TIMESTAMPTZ,
            v_appointment_id,
            p_title,
            (v_prep->>'lead_minutes')::INTEGER,
            auth.uid()
        );
    END LOOP;

    RETURN v_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_appointment_with_preps(TEXT, TIMESTAMPTZ, TEXT, JSONB)
    TO authenticated;

-- 3. reschedule_appointment_with_preps -- updates the appointment row and
--    every prep ticket's scheduled_start/appointment_title/reschedule_notice
--    in one transaction. The caller (rescheduleAppointmentFn in
--    src/features/appointments/appointment.actions.ts) computes each
--    ticket's new scheduled_start and reschedule_notice JSON in TypeScript
--    first (reusing the existing isoToDisplayTime/isoToISODate helpers
--    rather than reimplementing that formatting in SQL) and passes the
--    already-computed values in; this function only writes them, atomically.
--    p_ticket_updates is a JSONB array of {id, scheduled_start} plus an
--    optional reschedule_notice key -- omitted (not null) when that ticket's
--    time didn't actually move, so COALESCE below preserves whatever notice
--    was already there instead of clobbering it (matches the old
--    useAppointments.update()'s "only set a notice when the time moved"
--    behavior exactly).
CREATE OR REPLACE FUNCTION public.reschedule_appointment_with_preps(
    p_appointment_id UUID,
    p_title TEXT,
    p_scheduled_time TIMESTAMPTZ,
    p_ticket_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_update JSONB;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can reschedule appointments';
    END IF;

    UPDATE public.appointments
    SET title = p_title, scheduled_time = p_scheduled_time
    WHERE id = p_appointment_id AND household_id = v_household_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found';
    END IF;

    FOR v_update IN SELECT * FROM jsonb_array_elements(p_ticket_updates)
    LOOP
        UPDATE public.tickets
        SET
            scheduled_start = (v_update->>'scheduled_start')::TIMESTAMPTZ,
            appointment_title = p_title,
            reschedule_notice = COALESCE(v_update->'reschedule_notice', reschedule_notice)
        WHERE id = (v_update->>'id')::UUID AND appointment_id = p_appointment_id;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_with_preps(UUID, TEXT, TIMESTAMPTZ, JSONB)
    TO authenticated;

-- 4. delete_appointment_with_preps -- deleting the appointment row is enough;
--    ON DELETE CASCADE (added in step 1) takes care of its prep tickets.
CREATE OR REPLACE FUNCTION public.delete_appointment_with_preps(p_appointment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can remove appointments';
    END IF;

    DELETE FROM public.appointments WHERE id = p_appointment_id AND household_id = v_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_appointment_with_preps(UUID) TO authenticated;
