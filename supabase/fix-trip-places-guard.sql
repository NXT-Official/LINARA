-- A trip's ends are checked only when they change, and can't be the same
-- place (QA LM-A11, LM-A12; KNOWN_GAPS.md C98).
--
-- Deleting a saved place clears from_place_id and to_place_id one after the
-- other (ON DELETE SET NULL). With the place on both ends, clearing the first
-- re-ran this guard on the second, which still pointed at the place being
-- deleted, so the delete failed with "That place belongs to another
-- household". Now an end the update doesn't touch isn't re-judged, the same
-- rule tickets_helper_works_here follows. A trip from a place to itself is
-- refused when either end is set; ones saved before this stay until edited.
--
-- Run once in the Supabase SQL editor, after add-shared-staff-and-places.sql.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.tickets_places_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_from_place BOOLEAN := TRUE;
    v_to_place BOOLEAN := TRUE;
    v_from_house BOOLEAN := TRUE;
    v_to_house BOOLEAN := TRUE;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id THEN
        v_from_place := NEW.from_place_id IS DISTINCT FROM OLD.from_place_id;
        v_to_place := NEW.to_place_id IS DISTINCT FROM OLD.to_place_id;
        v_from_house := NEW.from_household_id IS DISTINCT FROM OLD.from_household_id;
        v_to_house := NEW.to_household_id IS DISTINCT FROM OLD.to_household_id;
    END IF;
    IF (v_from_place AND NEW.from_place_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.household_places
            WHERE id = NEW.from_place_id AND household_id = NEW.household_id))
       OR (v_to_place AND NEW.to_place_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.household_places
            WHERE id = NEW.to_place_id AND household_id = NEW.household_id)) THEN
        RAISE EXCEPTION 'That place belongs to another household';
    END IF;
    IF (v_from_house AND NEW.from_household_id IS NOT NULL
            AND NOT public.households_share_manager(NEW.from_household_id, NEW.household_id))
       OR (v_to_house AND NEW.to_household_id IS NOT NULL
            AND NOT public.households_share_manager(NEW.to_household_id, NEW.household_id)) THEN
        RAISE EXCEPTION 'A trip can only go to houses run by the same family';
    END IF;
    IF (v_from_place OR v_to_place) AND NEW.from_place_id = NEW.to_place_id
       OR (v_from_house OR v_to_house) AND NEW.from_household_id = NEW.to_household_id THEN
        RAISE EXCEPTION 'A trip goes between two different places';
    END IF;
    RETURN NEW;
END;
$$;
