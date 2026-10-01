-- Buying a palengke item restocks the pantry item it came from (KNOWN_GAPS.md
-- O23; client feedback 2026-10-02: "Palengke items purchased, goes to Pantry
-- stock"). ARCHITECTURE.md §9.2 always said this happened; nothing did it.
--
-- A trigger rather than app code, so both apps get it from the one write they
-- already make (LINARA_MOBILE's setGroceryItemBought):
--   * ticking an item bought adds its qty to the linked pantry item;
--   * unticking it (a mis-tap) takes the same qty back off, never below 0.
-- Only items with a pantry_item_id restock anything. Those are the ones added
-- from a low pantry item ("Ilista sa palengke" on mobile, "Add to list" on a
-- suggestion on the web), so the unit already matches. A free-typed item
-- ("ulam for Sunday") has no pantry row and is left alone.
--
-- SECURITY INVOKER: whoever ticks the item can already write pantry_items
-- (pantry_items_isolation is household-wide), so RLS still applies.
--
-- Apply by hand in the SQL editor. Safe to run twice.

CREATE OR REPLACE FUNCTION public.grocery_restock_pantry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_delta NUMERIC;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT NEW.bought THEN
            RETURN NEW;
        END IF;
        v_delta := NEW.qty;
    ELSIF NEW.bought IS NOT DISTINCT FROM OLD.bought THEN
        RETURN NEW;
    ELSIF NEW.bought THEN
        v_delta := NEW.qty;
    ELSE
        v_delta := -OLD.qty;
    END IF;

    IF NEW.pantry_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.pantry_items
       SET qty = GREATEST(0, qty + v_delta),
           updated_at = now()
     WHERE id = NEW.pantry_item_id
       AND household_id = NEW.household_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_restock_pantry ON public.grocery_items;
CREATE TRIGGER grocery_restock_pantry
    AFTER INSERT OR UPDATE OF bought ON public.grocery_items
    FOR EACH ROW
    EXECUTE FUNCTION public.grocery_restock_pantry();
