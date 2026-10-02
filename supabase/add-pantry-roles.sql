-- Who keeps the pantry (client feedback, 2026-10-02): "manager should be able
-- to assign which staff can do mayor doma stuff ... or just someone to fulfil
-- the checklist", because households trust staff differently.
--
-- helper_profiles.pantry_role, set by a manager from People on the web:
--   * 'lead'   -- in charge of the pantry (a mayordoma, a trusted cook): the
--                 counts, the items, the palengke list, the runs. Any number
--                 of helpers can be leads, alongside the managers.
--   * 'runner' -- pabili: ticks off what she bought and enters what it cost.
--                 Like every helper, she can still say something ran out:
--                 its count goes to zero and it goes on the palengke list
--                 ("Ubos na" in LINARA_MOBILE).
-- There is no "none": every helper can at least say something ran out.
--
-- New helpers start as runners; the manager raises them. Helpers who were
-- already here when this runs become leads, so nobody loses what they could
-- do yesterday.
--
-- Enforced here, not just hidden in the app, since it's about trust: a
-- runner's login used straight against the REST API can't do more than her
-- app shows. RLS can't compare old and new columns, so it's a trigger, the
-- same way helper_profiles_guard_own_update limits her own row
-- (fix-helper-write-access.sql). That guard also keeps a helper from
-- changing her own pantry_role: it isn't one of her availability columns.
--
-- Skipped for managers and remote admins (anyone who isn't a helper), for
-- SECURITY DEFINER functions (current_user isn't `authenticated` there), and
-- for writes made by another trigger: ticking an item bought restocks its
-- pantry item through grocery_restock_pantry (add-grocery-restock.sql),
-- which a runner must be able to set off.
--
-- Apply by hand in the SQL editor, after fix-helper-write-access.sql (whose
-- guard keeps a helper from raising her own role); before or after
-- add-grocery-restock.sql. Safe to run twice: the existing helpers become
-- leads only when the column is first added. Tested in PGlite: supabase/tests/pantry-roles.test.mjs.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'helper_profiles' AND column_name = 'pantry_role'
    ) THEN
        ALTER TABLE public.helper_profiles
            ADD COLUMN pantry_role TEXT NOT NULL DEFAULT 'runner'
            CHECK (pantry_role IN ('lead', 'runner'));
        UPDATE public.helper_profiles SET pantry_role = 'lead';
    END IF;
END;
$$;

-- The caller's pantry role: NULL for anyone who isn't a helper; a helper
-- without a current employment counts as a runner. SECURITY DEFINER for the
-- same reason as current_household_id(): it's read from inside a guard on
-- tables whose policies would otherwise be checked again.
CREATE OR REPLACE FUNCTION public.my_pantry_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN up.user_type <> 'helper' THEN NULL
        ELSE COALESCE(
            (SELECT hp.pantry_role FROM public.helper_profiles hp
              WHERE hp.user_id = up.id AND hp.status = 'ACTIVE'
              LIMIT 1),
            'runner')
    END
    FROM public.user_profiles up
    WHERE up.id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_pantry_role() TO authenticated;

-- True when this write is a runner's own (not a manager's, a lead's, a
-- function's or another trigger's), so the guards below apply.
CREATE OR REPLACE FUNCTION public.pantry_write_is_runners()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT current_user = 'authenticated'
       AND pg_trigger_depth() <= 1
       AND public.my_pantry_role() IS NOT DISTINCT FROM 'runner';
$$;

-- pantry_items: a runner may only set a count to zero.
CREATE OR REPLACE FUNCTION public.pantry_items_guard_runner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.pantry_write_is_runners() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.qty = 0
       AND (to_jsonb(NEW) - ARRAY['qty', 'updated_at'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['qty', 'updated_at']) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Ang namamahala ng pantry lang ang makakapagbago nito';
END;
$$;

DROP TRIGGER IF EXISTS pantry_items_guard_runner ON public.pantry_items;
CREATE TRIGGER pantry_items_guard_runner
    BEFORE INSERT OR UPDATE OR DELETE ON public.pantry_items
    FOR EACH ROW EXECUTE FUNCTION public.pantry_items_guard_runner();

-- grocery_items: a runner may tick an item bought (or untick it) and enter
-- its cost, and add a pantry item that ran out. Nothing else: no free-typed
-- lines, no edits, no removing.
CREATE OR REPLACE FUNCTION public.grocery_items_guard_runner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.pantry_write_is_runners() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW.pantry_item_id IS NOT NULL
       AND NOT NEW.bought
       AND NEW.actual_cost IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - ARRAY['bought', 'actual_cost'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['bought', 'actual_cost']) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Ang namamahala ng pantry lang ang makakapagbago ng palengke list';
END;
$$;

DROP TRIGGER IF EXISTS grocery_items_guard_runner ON public.grocery_items;
CREATE TRIGGER grocery_items_guard_runner
    BEFORE INSERT OR UPDATE OR DELETE ON public.grocery_items
    FOR EACH ROW EXECUTE FUNCTION public.grocery_items_guard_runner();
