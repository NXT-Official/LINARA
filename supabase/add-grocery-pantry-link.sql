-- A typed grocery line links itself to the pantry item it names (decided
-- 2026-10-07, KNOWN_GAPS.md O46).
--
-- Only a line with pantry_item_id restocks the pantry when it's bought
-- (add-grocery-restock.sql), and only lines added from a low pantry item had
-- one. A line typed by hand ("Rice Crackers", "Add a line" on a run, a lead's
-- own line on mobile) never restocked anything, even when the pantry has an
-- item of that very name. It also didn't count as covering that item, so the
-- low-stock suggestion still showed and the same thing got listed twice.
--
-- So a line with no pantry item, not yet bought, takes the pantry item in its
-- household with the same name and the same unit (case and spaces ignored),
-- when there is exactly one. Otherwise it stays unlinked: kangkong for
-- tonight isn't pantry stock, "Bigas 1 sack" against a pantry kept in kg
-- would restock the wrong amount, and two items called the same can't be told
-- apart. An existing link is never changed or removed. A bought line isn't
-- linked after the fact either: its restock already happened (or didn't), and
-- unticking it would take off stock it never added.
--
-- A trigger, so both apps and start_grocery_run() get it from the writes they
-- already make. Named to run after grocery_items_guard_runner (a runner still
-- can't add a typed line) and before grocery_items_run_guard.
--
-- Also links the unbought lines already listed, by the same rule.
--
-- Apply by hand in the SQL editor, after add-grocery-restock.sql. Safe to run
-- twice. Tested in PGlite: supabase/tests/grocery-pantry-link.test.mjs.

CREATE OR REPLACE FUNCTION public.grocery_pantry_match(
    p_household_id UUID,
    p_name TEXT,
    p_unit TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(p.id))[1] END
    FROM public.pantry_items p
    WHERE p.household_id = p_household_id
      AND lower(btrim(p.name)) = lower(btrim(p_name))
      AND lower(btrim(p.unit)) = lower(btrim(p_unit));
$$;

CREATE OR REPLACE FUNCTION public.grocery_items_link_pantry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.pantry_item_id IS NULL AND NOT NEW.bought THEN
        NEW.pantry_item_id := public.grocery_pantry_match(NEW.household_id, NEW.name, NEW.unit);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_items_link_pantry ON public.grocery_items;
CREATE TRIGGER grocery_items_link_pantry
    BEFORE INSERT OR UPDATE OF name, unit ON public.grocery_items
    FOR EACH ROW EXECUTE FUNCTION public.grocery_items_link_pantry();

UPDATE public.grocery_items g
   SET pantry_item_id = public.grocery_pantry_match(g.household_id, g.name, g.unit)
 WHERE g.pantry_item_id IS NULL
   AND NOT g.bought
   AND public.grocery_pantry_match(g.household_id, g.name, g.unit) IS NOT NULL;
