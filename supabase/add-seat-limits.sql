-- Seat limits: a household can't add a helper or a manager past the seats its
-- subscription, or else the free tier, gives it (sell-Linara plan, Task 3,
-- 2026-10-19).
--
-- seat_limit(household, kind) is billing_household_entitlements' helper_seats or
-- manager_seats for kind 'helper' or 'manager' (NULL = unlimited). Seats are
-- PER HOME, on purpose: a subscription for 2 homes with 3 helper seats lets
-- each home have 3. seats_used(household, kind) counts the household's helpers
-- that aren't INACTIVE (an invited, unclaimed one takes a seat) or its
-- household_managers rows. A trigger on helper_profiles and household_managers
-- refuses a row that would take a seat the household doesn't have, with
-- 'SEAT_LIMIT:helper' or 'SEAT_LIMIT:manager'; the web matches the prefix and
-- offers the plan page. Losing an entitlement costs seats only: nothing
-- existing is removed or hidden, new seats are refused.
--
-- What takes a seat, and so is checked:
--   * inserting a helper that isn't INACTIVE, or a manager row;
--   * setting an INACTIVE helper back to any other status;
--   * moving a helper that isn't INACTIVE, or a manager row, to another
--     household (counted against the household it moves to).
-- What doesn't, so always goes in:
--   * an INACTIVE helper, inserted or moved;
--   * a household's primary manager: creating a household makes that row and
--     every household has exactly one, so a household can always be started
--     (and then buy a plan) even with the free tier off;
--   * a household_managers row that already exists: re-running the backfill in
--     add-household-managers.sql proposes those again, and ON CONFLICT drops
--     them only after this trigger has seen them.
--
-- Two writers adding at once would both count the seats before either row
-- exists and both pass. The trigger therefore takes a transaction-scoped
-- advisory lock per household and kind before counting, so the second waits for
-- the first to commit and then sees its row.
--
-- The functions have no caller check, so nobody can execute them through the
-- API; the trigger runs as their owner (SECURITY DEFINER), which also lets it
-- count rows RLS would hide from whoever is writing.
--
-- Apply by hand in the SQL editor AFTER LINARA_ADMIN's 017-billing-subscriptions.sql
-- (the console owns the billing schema; this trigger enforces its seat limits
-- on this app's tables). Safe to run twice.
-- Tested in PGlite: supabase/tests/seat-limits.test.mjs.

CREATE OR REPLACE FUNCTION public.seat_limit(p_household_id UUID, p_kind TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entitlements JSONB := public.billing_household_entitlements(p_household_id);
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

-- On an UPDATE the row being changed is still its old self in the table, so
-- seats_used doesn't count it: an INACTIVE helper isn't counted, and a row
-- moving in is counted in the household it comes from.
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
        IF TG_OP = 'UPDATE' AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
           AND OLD.status <> 'INACTIVE' THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'household_managers' THEN
        v_kind := 'manager';
        IF NEW.role = 'primary_manager' THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' THEN
            IF NEW.household_id IS NOT DISTINCT FROM OLD.household_id THEN
                RETURN NEW;
            END IF;
        ELSIF EXISTS (SELECT 1 FROM public.household_managers hm
                       WHERE hm.household_id = NEW.household_id AND hm.user_id = NEW.user_id) THEN
            RETURN NEW;
        END IF;
    ELSE
        RAISE EXCEPTION 'enforce_seat_limit() is not for table %', TG_TABLE_NAME;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.household_id::text || ':' || v_kind));
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
    BEFORE INSERT OR UPDATE OF status, household_id ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

DROP TRIGGER IF EXISTS household_managers_seat_limit ON public.household_managers;
CREATE TRIGGER household_managers_seat_limit
    BEFORE INSERT OR UPDATE OF household_id ON public.household_managers
    FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();
