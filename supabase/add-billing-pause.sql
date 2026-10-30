-- What a lapsed or over-limit plan actually pauses (follows add-billing.sql,
-- add-billing-plan-changes.sql and add-teams-plan-guard.sql). Found in the
-- subscription audit, 2026-10-30:
--
--   * Not paying beat cancelling. Grace over (restricted), a household kept
--     every feature of the plan it stopped paying for, forever; a cancelled
--     plan dropped to Free. Restricted only stopped new places being taken.
--   * "Choose what stays active" was saved and never used: nothing read
--     billing_active_selection, so a household over its limits after a
--     downgrade, or after removing add-ons, kept using everything.
--
-- NOW (R6 in documentation/specs/2026-10-26-subscriptions-plan.md: over-limit
-- handling is the same for downgrades and missed payments)
--   * Restricted is Free until it's paid: Free's features and limits, no
--     add-ons. Paying what's owed still prices the plan they're on
--     (billing_quote reads billing_sub_version, unchanged), and paying it
--     brings everything back.
--   * Over the limits (a downgrade, restricted, add-ons removed), the
--     households and kasambahay the manager picked stay active. Without a
--     pick, or a pick the limits have since shrunk under, the picked ones
--     come first and the oldest fill what's left, so not picking isn't a way
--     around it.
--   * A paused household takes nothing new: no new task, Quick Utos,
--     appointment or appointment move, pantry, grocery, team or label, staff
--     invite or remote admin. A paused kasambahay gets no new task, Quick
--     Utos or shift change.
--   * What stays, always: everything already there (read, edit, cancel,
--     delete), repeating tasks already set up, and a kasambahay's own app:
--     her leave, rest days, rest owed, record and pay (RA 10361). Ending an
--     employment and paying final pay are never paused.
--
-- Apply by hand in the Supabase SQL editor, after add-billing-plan-changes.sql
-- and add-teams-plan-guard.sql. Safe to run twice. Tested in PGlite:
-- supabase/tests/billing-pause.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Restricted is Free until it's paid.
-- --------------------------------------------------------------------------

-- The version whose features and limits apply now: the one subscribed to,
-- or Free once grace is over.
CREATE OR REPLACE FUNCTION public.billing_effective_version(p_sub JSONB)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN p_sub ->> 'status' = 'restricted'
                THEN public.billing_current_version('free')
                ELSE public.billing_sub_version(p_sub) END
$$;

-- The limits that apply now, plus what paid add-ons raise them by; null is
-- unlimited. Restricted: Free's, without add-ons.
CREATE OR REPLACE FUNCTION public.billing_limits(p_sub JSONB)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_object_agg(k, CASE
        WHEN pv.limits -> k = 'null'::jsonb THEN 'null'::jsonb
        ELSE to_jsonb((pv.limits ->> k)::int + CASE WHEN p_sub ->> 'status' = 'restricted' THEN 0
            ELSE COALESCE((
                SELECT sum(a.step * (l ->> 'quantity')::int)
                  FROM jsonb_array_elements(p_sub -> 'addons') l
                  JOIN public.billing_addons a ON a.id = l ->> 'addonId'
                 WHERE a.limit_key = k), 0) END) END)
      FROM unnest(public.billing_limit_keys()) k,
           public.billing_plan_versions pv
     WHERE pv.id = public.billing_effective_version(p_sub)
$$;

-- Whether a household's plan includes a feature now. As in add-billing.sql,
-- with restricted reading Free's features.
CREATE OR REPLACE FUNCTION public.billing_household_has(p_household UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID := public.billing_household_owner(p_household);
    v_features JSONB;
BEGIN
    IF p_key = ANY (public.billing_every_plan_keys()) THEN
        RETURN true;
    END IF;
    IF p_key = 'staff_pay_hr' AND NOT public.pay_hr_enabled() THEN
        RETURN false;
    END IF;
    SELECT pv.features INTO v_features FROM public.billing_plan_versions pv
     WHERE pv.id = public.billing_effective_version(public.billing_subscription_json(v_owner));
    RETURN COALESCE((v_features ->> p_key)::boolean, false);
END;
$$;

-- --------------------------------------------------------------------------
-- 2. What stays active.
-- --------------------------------------------------------------------------

-- The owner's households that stay active: the picked ones first, then the
-- oldest, up to the limit. Null when the limit is unlimited (all of them).
CREATE OR REPLACE FUNCTION public.billing_active_households(p_owner UUID)
RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_limit JSONB := public.billing_limits(public.billing_subscription_json(p_owner)) -> 'households';
    v_picked UUID[];
BEGIN
    IF v_limit IS NULL OR v_limit = 'null'::jsonb THEN
        RETURN NULL;
    END IF;
    SELECT s.households INTO v_picked FROM public.billing_active_selection s
     WHERE s.manager_id = p_owner;
    RETURN COALESCE((
        SELECT array_agg(x.household_id)
          FROM (SELECT hm.household_id
                  FROM public.household_managers hm
                 WHERE hm.user_id = p_owner AND hm.role = 'primary_manager'
                 ORDER BY array_position(v_picked, hm.household_id) NULLS LAST,
                          hm.added_at, hm.household_id
                 LIMIT (v_limit #>> '{}')::int) x), '{}');
END;
$$;

-- The owner's kasambahay that stay active, as people (user_id, or the
-- profile id while the invite is open), each once across the owner's
-- households (R7): from the households that stay active only (one that's
-- paused would take a place for nothing), the picked ones first, then the
-- longest there, up to the limit. Null when the limit is unlimited.
CREATE OR REPLACE FUNCTION public.billing_active_kasambahay(p_owner UUID)
RETURNS TEXT[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_limit JSONB := public.billing_limits(public.billing_subscription_json(p_owner)) -> 'kasambahay';
    v_households UUID[] := public.billing_active_households(p_owner);
    v_picked UUID[];
BEGIN
    IF v_limit IS NULL OR v_limit = 'null'::jsonb THEN
        RETURN NULL;
    END IF;
    SELECT s.kasambahay INTO v_picked FROM public.billing_active_selection s
     WHERE s.manager_id = p_owner;
    RETURN COALESCE((
        SELECT array_agg(x.person)
          FROM (SELECT COALESCE(hp.user_id::text, hp.id::text) AS person
                  FROM public.helper_profiles hp
                 WHERE hp.household_id IN (SELECT public.billing_owned_households(p_owner))
                   AND (v_households IS NULL OR hp.household_id = ANY (v_households))
                   AND hp.status <> 'INACTIVE'
                 GROUP BY 1
                 ORDER BY min(array_position(v_picked, hp.id)) NULLS LAST,
                          min(hp.created_at), 1
                 LIMIT (v_limit #>> '{}')::int) x), '{}');
END;
$$;

-- Whether a household is paused: its owner is over the households limit and
-- it isn't one that stays active.
CREATE OR REPLACE FUNCTION public.billing_household_paused(p_household UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID := public.billing_household_owner(p_household);
    v_active UUID[];
BEGIN
    IF p_household IS NULL OR v_owner IS NULL THEN
        RETURN false;
    END IF;
    v_active := public.billing_active_households(v_owner);
    RETURN v_active IS NOT NULL AND NOT (p_household = ANY (v_active));
END;
$$;

-- Whether a kasambahay is paused: her household is, or its owner is over the
-- kasambahay limit and she isn't one who stays active. Someone whose
-- employment has ended isn't counted, so isn't paused.
CREATE OR REPLACE FUNCTION public.billing_helper_paused(p_helper UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    hp public.helper_profiles%ROWTYPE;
    v_owner UUID;
    v_active TEXT[];
BEGIN
    SELECT * INTO hp FROM public.helper_profiles WHERE id = p_helper;
    IF hp.id IS NULL OR hp.status = 'INACTIVE' THEN
        RETURN false;
    END IF;
    IF public.billing_household_paused(hp.household_id) THEN
        RETURN true;
    END IF;
    v_owner := public.billing_household_owner(hp.household_id);
    IF v_owner IS NULL THEN
        RETURN false;
    END IF;
    v_active := public.billing_active_kasambahay(v_owner);
    RETURN v_active IS NOT NULL
       AND NOT (COALESCE(hp.user_id::text, hp.id::text) = ANY (v_active));
END;
$$;

-- Raises when the household, or the kasambahay, is paused.
CREATE OR REPLACE FUNCTION public.billing_assert_active(p_household UUID, p_helper UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.billing_household_paused(p_household) THEN
        RAISE EXCEPTION 'This household is paused on the plan, so nothing new can be added to it. Choose what stays active on Your plan, or upgrade.'
            USING ERRCODE = 'P0001';
    END IF;
    IF p_helper IS NOT NULL AND public.billing_helper_paused(p_helper) THEN
        RAISE EXCEPTION 'This kasambahay is paused on the plan, so new tasks and schedule changes for her wait. Choose who stays active on Your plan, or upgrade.'
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

-- What stays active, as in add-billing.sql, read against the limits that
-- apply now, and a kasambahay only from a household that's picked too.
CREATE OR REPLACE FUNCTION public.billing_save_selection(p_households UUID[], p_kasambahay UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_limits JSONB := public.billing_limits(public.billing_subscription_json(v_uid));
    v_households UUID[] := COALESCE(p_households, '{}');
    v_kasambahay UUID[] := COALESCE(p_kasambahay, '{}');
BEGIN
    IF cardinality(v_households) <> (SELECT count(DISTINCT x) FROM unnest(v_households) x)
       OR cardinality(v_kasambahay) <> (SELECT count(DISTINCT x) FROM unnest(v_kasambahay) x) THEN
        RAISE EXCEPTION 'Something is picked twice.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_households) x
                WHERE x NOT IN (SELECT public.billing_owned_households(v_uid)))
       OR EXISTS (SELECT 1 FROM unnest(v_kasambahay) x
                   WHERE x NOT IN (SELECT hp.id FROM public.helper_profiles hp
                                    WHERE hp.household_id IN
                                          (SELECT public.billing_owned_households(v_uid)))) THEN
        RAISE EXCEPTION 'Something picked isn''t there any more. Pick again.';
    END IF;
    IF cardinality(v_households) = 0 THEN
        RAISE EXCEPTION 'Keep at least one household active.';
    END IF;
    IF v_limits -> 'households' <> 'null'::jsonb
       AND cardinality(v_households) > (v_limits ->> 'households')::int THEN
        RAISE EXCEPTION 'Pick up to % households.', v_limits ->> 'households';
    END IF;
    IF v_limits -> 'kasambahay' <> 'null'::jsonb
       AND cardinality(v_kasambahay) > (v_limits ->> 'kasambahay')::int THEN
        RAISE EXCEPTION 'Pick up to % kasambahay.', v_limits ->> 'kasambahay';
    END IF;
    IF v_limits -> 'households' <> 'null'::jsonb AND EXISTS (
        SELECT 1 FROM public.helper_profiles hp
         WHERE hp.id = ANY (v_kasambahay) AND NOT (hp.household_id = ANY (v_households))) THEN
        RAISE EXCEPTION 'Pick kasambahay from the households that stay active.';
    END IF;
    INSERT INTO public.billing_active_selection (manager_id, households, kasambahay, updated_at)
    VALUES (v_uid, v_households, v_kasambahay, now())
    ON CONFLICT (manager_id) DO UPDATE SET households = EXCLUDED.households,
        kasambahay = EXCLUDED.kasambahay, updated_at = now();
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Enforcement.
-- --------------------------------------------------------------------------

-- Pantry, groceries, teams, labels and remote admin (every caller of this):
-- a paused household adds none of them either. Otherwise as in add-billing.sql.
CREATE OR REPLACE FUNCTION public.billing_assert_feature(p_household UUID, p_key TEXT, p_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_household IS NOT NULL AND NOT public.billing_household_has(p_household, p_key) THEN
        RAISE EXCEPTION '% isn''t on this household''s plan.', p_name USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.billing_assert_active(p_household, NULL);
END;
$$;

-- A new kasambahay, or one taken back on: not into a paused household.
-- Otherwise as in add-billing.sql.
CREATE OR REPLACE FUNCTION public.billing_guard_helpers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF NEW.status = 'INACTIVE' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'INACTIVE'
       AND NEW.household_id = OLD.household_id THEN
        RETURN NEW;
    END IF;
    PERFORM public.billing_assert_active(NEW.household_id, NULL);
    v_owner := public.billing_household_owner(NEW.household_id);
    IF NEW.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.helper_profiles hp
         WHERE hp.user_id = NEW.user_id AND hp.id <> NEW.id AND hp.status <> 'INACTIVE'
           AND hp.household_id IN (SELECT public.billing_owned_households(v_owner))) THEN
        RETURN NEW;
    END IF;
    PERFORM public.billing_assert_room(v_owner, 'kasambahay');
    RETURN NEW;
END;
$$;

-- A new task, or a task given to someone. A repeating task's next day (made
-- by spawn_routine_tasks_for: routine_id names an earlier task) keeps coming:
-- it's what was already set up, not something new. routine_id is read from
-- the row as json, so this works before add-repeating-tasks.sql too.
CREATE OR REPLACE FUNCTION public.billing_guard_tasks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_routine TEXT := to_jsonb(NEW) ->> 'routine_id';
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF v_routine IS NOT NULL AND v_routine <> NEW.id::text THEN
            RETURN NEW;
        END IF;
        PERFORM public.billing_assert_active(NEW.household_id, NEW.helper_id);
    ELSIF NEW.helper_id IS NOT NULL AND NEW.helper_id IS DISTINCT FROM OLD.helper_id THEN
        PERFORM public.billing_assert_active(NULL, NEW.helper_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_guard_quick_utos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.billing_assert_active(
        (SELECT hp.household_id FROM public.helper_profiles hp WHERE hp.id = NEW.recipient_id),
        NEW.recipient_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_guard_appointments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND to_jsonb(NEW) -> 'scheduled_time' IS NOT DISTINCT FROM to_jsonb(OLD) -> 'scheduled_time' THEN
        RETURN NEW;
    END IF;
    PERFORM public.billing_assert_active(NEW.household_id, NULL);
    RETURN NEW;
END;
$$;

-- Her shift and rest day. Her status (ending the employment) isn't one.
CREATE OR REPLACE FUNCTION public.billing_guard_shifts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.shift_start IS DISTINCT FROM OLD.shift_start
       OR NEW.shift_end IS DISTINCT FROM OLD.shift_end
       OR NEW.weekly_rest_day IS DISTINCT FROM OLD.weekly_rest_day THEN
        PERFORM public.billing_assert_active(NULL, NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_guard_tasks ON public.tickets;
CREATE TRIGGER billing_guard_tasks BEFORE INSERT OR UPDATE OF helper_id ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_tasks();
DROP TRIGGER IF EXISTS billing_guard_quick_utos ON public.quick_utos;
CREATE TRIGGER billing_guard_quick_utos BEFORE INSERT ON public.quick_utos
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_quick_utos();
DROP TRIGGER IF EXISTS billing_guard_appointments ON public.appointments;
DO $$
BEGIN
    -- Moving an appointment is a schedule change, where the column exists.
    EXECUTE format('CREATE TRIGGER billing_guard_appointments BEFORE INSERT%s ON public.appointments
                    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_appointments()',
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'appointments'
                             AND column_name = 'scheduled_time')
             THEN ' OR UPDATE OF scheduled_time' ELSE '' END);
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_shifts ON public.helper_profiles;
CREATE TRIGGER billing_guard_shifts BEFORE UPDATE OF shift_start, shift_end, weekly_rest_day
    ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_shifts();

-- --------------------------------------------------------------------------
-- 4. Grants: all internal.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_effective_version(jsonb)',
        'public.billing_limits(jsonb)',
        'public.billing_household_has(uuid, text)',
        'public.billing_active_households(uuid)',
        'public.billing_active_kasambahay(uuid)',
        'public.billing_household_paused(uuid)',
        'public.billing_helper_paused(uuid)',
        'public.billing_assert_active(uuid, uuid)',
        'public.billing_assert_feature(uuid, text, text)',
        'public.billing_guard_helpers()',
        'public.billing_guard_tasks()',
        'public.billing_guard_quick_utos()',
        'public.billing_guard_appointments()',
        'public.billing_guard_shifts()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END LOOP;
END;
$$;
