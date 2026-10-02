-- The household's own leave rules (client feedback, 2026-10-02: "Recorded
-- leave should be a toggle ... if they want to follow 1 year rule, rule
-- should be custom to manager"). Apply by hand in the Supabase SQL editor,
-- AFTER add-leave.sql. Idempotent and safe to re-run. Tested in PGlite:
-- supabase/tests/leave-policy.test.mjs.
--
-- Two settings on households, changed by a manager from People:
--   sil_waits_first_year  true (the default) is RA 10361 section 29 as
--                         written: service incentive leave from her second
--                         service year. false gives it from her first day.
--   sil_days_per_year     5 by default. The law's 5 is a floor, so it can go
--                         up (to 30), never down.
-- Being more generous than the law is always allowed; being less is not, so
-- neither setting can take anything away from what add-leave.sql gave.
--
-- Service years still run from her first day either way, so the balance
-- resets on the same date each year.
--
-- Replaces sil_service_year, sil_balance_days and leave_guard from
-- add-leave.sql with the same signatures, reading the household's rule
-- instead of the fixed one; nothing else changes. Both apps already read the
-- balance and eligibility from these functions.

ALTER TABLE public.households
    ADD COLUMN IF NOT EXISTS sil_waits_first_year BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.households
    ADD COLUMN IF NOT EXISTS sil_days_per_year INT NOT NULL DEFAULT 5;
ALTER TABLE public.households DROP CONSTRAINT IF EXISTS households_sil_days_per_year_check;
ALTER TABLE public.households
    ADD CONSTRAINT households_sil_days_per_year_check
    CHECK (sil_days_per_year BETWEEN 5 AND 30);

-- Her household's SIL days a year (5 if anything is missing).
CREATE OR REPLACE FUNCTION public.sil_days_per_year(p_helper_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT h.sil_days_per_year
        FROM public.helper_profiles hp
        JOIN public.households h ON h.id = hp.household_id
        WHERE hp.id = p_helper_id
          AND hp.household_id = public.current_household_id()
    ), 5);
$$;
GRANT EXECUTE ON FUNCTION public.sil_days_per_year(UUID) TO authenticated;

-- The service year containing p_on, counted from her first day. SIL starts
-- in her second service year, or on her first day if the household doesn't
-- wait.
CREATE OR REPLACE FUNCTION public.sil_service_year(p_helper_id UUID, p_on DATE)
RETURNS TABLE (year_start DATE, year_end DATE, eligible BOOLEAN, eligible_from DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first DATE;
    v_years INT;
    v_waits BOOLEAN;
BEGIN
    SELECT COALESCE(hp.started_on, hp.created_at::date), h.sil_waits_first_year
    INTO v_first, v_waits
    FROM public.helper_profiles hp
    JOIN public.households h ON h.id = hp.household_id
    WHERE hp.id = p_helper_id
      AND hp.household_id = public.current_household_id();

    IF v_first IS NULL THEN
        RETURN;
    END IF;

    eligible_from := CASE WHEN v_waits THEN (v_first + interval '1 year')::date ELSE v_first END;
    IF p_on < v_first THEN
        year_start := v_first;
        year_end := (v_first + interval '1 year' - interval '1 day')::date;
        eligible := false;
        RETURN NEXT;
        RETURN;
    END IF;

    v_years := EXTRACT(YEAR FROM age(p_on, v_first))::int;
    year_start := (v_first + make_interval(years => v_years))::date;
    year_end := (v_first + make_interval(years => v_years + 1) - interval '1 day')::date;
    eligible := v_years >= 1 OR NOT v_waits;
    RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sil_service_year(UUID, DATE) TO authenticated;

-- SIL days left in the service year containing p_on (today by default).
CREATE OR REPLACE FUNCTION public.sil_balance_days(p_helper_id UUID, p_on DATE DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year RECORD;
    v_used INT;
    v_allowed INT := public.sil_days_per_year(p_helper_id);
BEGIN
    SELECT * INTO v_year
    FROM public.sil_service_year(p_helper_id, COALESCE(p_on, public.household_today()));

    IF NOT FOUND OR NOT v_year.eligible THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(l.days), 0) INTO v_used
    FROM public.leave_requests l
    WHERE l.helper_id = p_helper_id
      AND l.kind = 'sil'
      AND l.status = 'approved'
      AND l.start_date BETWEEN v_year.year_start AND v_year.year_end;

    -- RA 10361 section 29: five days a year, or more if the household gives more.
    RETURN GREATEST(0, v_allowed - v_used);
END;
$$;
GRANT EXECUTE ON FUNCTION public.sil_balance_days(UUID, DATE) TO authenticated;

-- add-leave.sql's rules for every leave write, with the SIL limits read
-- from the household. Internal (callers hold her helper_profiles lock).
CREATE OR REPLACE FUNCTION public.leave_guard(
    p_helper_id UUID,
    p_kind TEXT,
    p_start DATE,
    p_end DATE,
    p_exclude_id UUID,
    p_count_pending BOOLEAN
)
RETURNS TABLE (leave_days INT, leave_minutes INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INT;
    v_minutes INT := 0;
    v_per_day INT;
    v_clash RECORD;
    v_year RECORD;
    v_used INT;
    v_balance INT;
    v_pending INT;
    v_allowed INT;
BEGIN
    IF p_kind NOT IN ('sil', 'in_kind', 'unpaid', 'extra_paid') THEN
        RAISE EXCEPTION 'Unknown kind of leave: %', p_kind;
    END IF;
    IF p_end < p_start THEN
        RAISE EXCEPTION 'The last day must be on or after the first day';
    END IF;
    IF p_end - p_start + 1 > 90 THEN
        RAISE EXCEPTION 'One request can cover at most 90 days';
    END IF;

    v_days := public.leave_working_days(p_helper_id, p_start, p_end);
    IF v_days = 0 THEN
        RAISE EXCEPTION 'Those dates are all rest days, so there is nothing to take';
    END IF;

    SELECT l.kind, l.status, l.start_date, l.end_date INTO v_clash
    FROM public.leave_requests l
    WHERE l.helper_id = p_helper_id
      AND l.status IN ('pending', 'approved')
      AND l.id IS DISTINCT FROM p_exclude_id
      AND p_start <= l.end_date
      AND p_end >= l.start_date
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'That overlaps % leave (%) from % to %',
            v_clash.status, v_clash.kind, v_clash.start_date, v_clash.end_date;
    END IF;

    SELECT r.rest_date, r.status INTO v_clash
    FROM public.rest_off_requests r
    WHERE r.helper_id = p_helper_id
      AND r.status IN ('pending', 'approved')
      AND r.rest_date BETWEEN p_start AND p_end
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'There is % rest off on %; cancel or decline it first',
            v_clash.status, v_clash.rest_date;
    END IF;

    IF p_kind = 'sil' THEN
        SELECT * INTO v_year FROM public.sil_service_year(p_helper_id, p_start);
        IF NOT FOUND OR NOT v_year.eligible THEN
            RAISE EXCEPTION 'Service incentive leave starts after one year of service (from %). The household can turn this off under People, Leave rules',
                v_year.eligible_from;
        END IF;
        IF p_end > v_year.year_end THEN
            RAISE EXCEPTION 'A new service year starts on %; split this into two requests',
                v_year.year_end + 1;
        END IF;
        v_allowed := public.sil_days_per_year(p_helper_id);
        SELECT COALESCE(SUM(l.days), 0) INTO v_used
        FROM public.leave_requests l
        WHERE l.helper_id = p_helper_id
          AND l.kind = 'sil'
          AND l.id IS DISTINCT FROM p_exclude_id
          AND (l.status = 'approved' OR (p_count_pending AND l.status = 'pending'))
          AND l.start_date BETWEEN v_year.year_start AND v_year.year_end;
        IF v_days > v_allowed - v_used THEN
            RAISE EXCEPTION 'Not enough service incentive leave: % days left this service year, % asked for',
                GREATEST(0, v_allowed - v_used), v_days;
        END IF;

    ELSIF p_kind = 'in_kind' THEN
        v_per_day := public.leave_minutes_per_day(p_helper_id);
        IF COALESCE(v_per_day, 0) = 0 THEN
            RAISE EXCEPTION 'Her shift hours are not set, so a day off in kind can''t be counted';
        END IF;
        v_minutes := v_days * v_per_day;
        v_balance := public.rest_owed_balance_minutes(p_helper_id);
        v_pending := 0;
        IF p_count_pending THEN
            SELECT COALESCE(SUM(l.minutes), 0) INTO v_pending
            FROM public.leave_requests l
            WHERE l.helper_id = p_helper_id AND l.kind = 'in_kind' AND l.status = 'pending'
              AND l.id IS DISTINCT FROM p_exclude_id;
            v_pending := v_pending + COALESCE((
                SELECT SUM(r.minutes) FROM public.rest_off_requests r
                WHERE r.helper_id = p_helper_id AND r.status = 'pending'
            ), 0);
        END IF;
        IF v_minutes + v_pending > v_balance THEN
            RAISE EXCEPTION 'Not enough rest owed: % minutes available, % already requested, % more asked for',
                v_balance, v_pending, v_minutes;
        END IF;
    END IF;

    RETURN QUERY SELECT v_days, v_minutes;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_guard(UUID, TEXT, DATE, DATE, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
