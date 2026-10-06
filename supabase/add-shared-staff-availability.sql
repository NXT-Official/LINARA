-- What a household's managers need to know about staff who also work in the
-- family's other houses (decided 2026-10-06, KNOWN_GAPS.md O41):
--
--   * shared_staff_time_off(): the approved leave and rest off of staff
--     shared INTO this household. Her leave and rest-off requests belong to
--     her home household (it pays her), so their read policies only let that
--     household's managers see them, and the Beach House's Pass showed her
--     available on her leave day. Dates and windows only: never the kind of
--     leave (it says how she's paid), the reason or her note.
--   * staff_elsewhere(): when staff who work here have tasks at the family's
--     OTHER houses, either way round (her home house sees her Beach House
--     tasks, and the Beach House sees her home ones), so nobody books her
--     for the same hour. Time, house and status only: never the title, notes
--     or photos.
--
-- Read-only, for primary, co-managers and remote admins of the caller's
-- current household. Apply by hand in the SQL editor, after
-- add-shared-staff-and-places.sql, add-leave.sql and
-- add-rest-off-requests.sql. Safe to run twice. Tested in PGlite:
-- supabase/tests/shared-staff-and-places.test.mjs ("Availability").

CREATE OR REPLACE FUNCTION public.shared_staff_time_off(p_from DATE, p_to DATE)
RETURNS TABLE (
    helper_id UUID,
    -- Inclusive, clipped to [p_from, p_to].
    day_from DATE,
    day_to DATE,
    -- NULL for whole days (leave); a window for rest off.
    start_time TIME,
    end_time TIME
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH shared AS (
        SELECT hh.helper_id
        FROM public.helper_households hh
        JOIN public.helper_profiles hp ON hp.id = hh.helper_id AND hp.status = 'ACTIVE'
        WHERE hh.household_id = public.current_household_id()
          AND public.current_user_type() IN ('primary_manager', 'co_manager', 'remote_admin')
    )
    SELECT lr.helper_id, GREATEST(lr.start_date, p_from), LEAST(lr.end_date, p_to),
           NULL::TIME, NULL::TIME
    FROM public.leave_requests lr
    JOIN shared ON shared.helper_id = lr.helper_id
    WHERE lr.status = 'approved' AND lr.start_date <= p_to AND lr.end_date >= p_from
    UNION ALL
    SELECT ro.helper_id, ro.rest_date, ro.rest_date, ro.start_time, ro.end_time
    FROM public.rest_off_requests ro
    JOIN shared ON shared.helper_id = ro.helper_id
    WHERE ro.status = 'approved' AND ro.rest_date BETWEEN p_from AND p_to;
$$;

CREATE OR REPLACE FUNCTION public.staff_elsewhere(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    helper_id UUID,
    household_id UUID,
    household_name TEXT,
    scheduled_start TIMESTAMPTZ,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH here AS (
        SELECT hp.id FROM public.helper_profiles hp
        WHERE hp.household_id = public.current_household_id() AND hp.status = 'ACTIVE'
        UNION
        SELECT hh.helper_id FROM public.helper_households hh
        JOIN public.helper_profiles hp ON hp.id = hh.helper_id AND hp.status = 'ACTIVE'
        WHERE hh.household_id = public.current_household_id()
    )
    SELECT t.helper_id, t.household_id, h.name, t.scheduled_start, t.status
    FROM public.tickets t
    JOIN here ON here.id = t.helper_id
    JOIN public.households h ON h.id = t.household_id
    WHERE t.household_id <> public.current_household_id()
      AND t.status <> 'cancelled'
      AND t.scheduled_start >= p_from AND t.scheduled_start < p_to
      AND public.current_user_type() IN ('primary_manager', 'co_manager', 'remote_admin')
    ORDER BY t.scheduled_start;
$$;

REVOKE ALL ON FUNCTION public.shared_staff_time_off(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_elsewhere(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_staff_time_off(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_elsewhere(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
