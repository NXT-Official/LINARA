-- Seat limits: a household can't add a helper or a manager past the seats its
-- subscription, or else the free tier, gives it (sell-Linara plan, Task 3,
-- 2026-10-19).
--
-- seat_limit(household, kind) is household_entitlements' helper_seats or
-- manager_seats for kind 'helper' or 'manager' (NULL = unlimited).
-- seats_used(household, kind) counts the household's helpers that aren't
-- INACTIVE (an invited, unclaimed one takes a seat) or its household_managers
-- rows. A BEFORE INSERT trigger on helper_profiles and household_managers
-- refuses the row with 'SEAT_LIMIT:helper' or 'SEAT_LIMIT:manager' when the
-- household is at its limit; the web matches the prefix and offers the plan
-- page. Losing an entitlement costs seats only: nothing existing is removed or
-- hidden, new rows are refused. Only inserts are counted: setting an INACTIVE
-- helper back to ACTIVE is not checked.
--
-- Three inserts never take a new seat, so they always go in:
--   * an INACTIVE helper;
--   * a household's primary manager: creating a household makes that row and
--     every household has exactly one, so a household can always be started
--     (and then buy a plan) even with the free tier off;
--   * a household_managers row that already exists: re-running the backfill in
--     add-household-managers.sql proposes those again, and ON CONFLICT drops
--     them only after this trigger has seen them.
--
-- The functions have no caller check, so nobody can execute them through the
-- API; the trigger runs as their owner (SECURITY DEFINER), which also lets it
-- count rows RLS would hide from whoever is inserting.
--
-- Apply by hand in the SQL editor. AFTER add-subscriptions.sql (needs
-- billing_entitlements()). Safe to run twice.
-- Tested in PGlite: supabase/tests/seat-limits.test.mjs.

CREATE OR REPLACE FUNCTION public.seat_limit(p_household_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entitlements JSONB := public.billing_entitlements(p_household_id);
BEGIN
    IF p_kind = 'helper' THEN
        RETURN (v_entitlements ->> 'helper_seats')::INT;
    ELSIF p_kind = 'manager' THEN
        RETURN (v_entitlements ->> 'manager_seats')::INT;
    END IF;
    RAISE EXCEPTION 'NOT_FOUND:seat kind %', p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION public.seats_used(p_household_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_kind = 'helper' THEN
        RETURN (SELECT count(*)::INT FROM public.helper_profiles
                 WHERE household_id = p_household_id AND status <> 'INACTIVE');
    ELSIF p_kind = 'manager' THEN
        RETURN (SELECT count(*)::INT FROM public.household_managers
                 WHERE household_id = p_household_id);
    END IF;
    RAISE EXCEPTION 'NOT_FOUND:seat kind %', p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind TEXT;
    v_limit INT;
BEGIN
    IF TG_TABLE_NAME = 'helper_profiles' THEN
        v_kind := 'helper';
        IF NEW.status = 'INACTIVE' THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'household_managers' THEN
        v_kind := 'manager';
        IF NEW.role = 'primary_manager' OR EXISTS (
            SELECT 1 FROM public.household_managers hm
             WHERE hm.household_id = NEW.household_id AND hm.user_id = NEW.user_id) THEN
            RETURN NEW;
        END IF;
    ELSE
        RAISE EXCEPTION 'enforce_seat_limit() is not for table %', TG_TABLE_NAME;
    END IF;

    v_limit := public.seat_limit(NEW.household_id, v_kind);
    IF v_limit IS NOT NULL AND public.seats_used(NEW.household_id, v_kind) >= v_limit THEN
        RAISE EXCEPTION 'SEAT_LIMIT:%', v_kind;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
    public.seat_limit(UUID, TEXT),
    public.seats_used(UUID, TEXT),
    public.enforce_seat_limit()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS helper_profiles_seat_limit ON public.helper_profiles;
CREATE TRIGGER helper_profiles_seat_limit
    BEFORE INSERT ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

DROP TRIGGER IF EXISTS household_managers_seat_limit ON public.household_managers;
CREATE TRIGGER household_managers_seat_limit
    BEFORE INSERT ON public.household_managers
    FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();
