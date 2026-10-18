-- Renaming a station failed on live with `column "station" does not exist`
-- (found 2026-10-08, right after add-household-stations.sql was applied).
-- The rename trigger also renamed the station on the house's SOPs, but the
-- live house_sops has no station column. Now it does that only when the
-- column is there; staff still follow the new name as before.
--
-- Apply by hand in the SQL editor, after add-household-stations.sql. Safe to
-- run twice. Tested in PGlite: supabase/tests/household-stations.test.mjs.

CREATE OR REPLACE FUNCTION public.household_stations_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
        RETURN NEW;
    END IF;
    UPDATE public.helper_profiles
       SET station = NEW.name
     WHERE household_id = NEW.household_id AND lower(station) = lower(OLD.name);
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'house_sops' AND column_name = 'station'
    ) THEN
        EXECUTE 'UPDATE public.house_sops SET station = $1
                 WHERE household_id = $2 AND lower(station) = lower($3)'
        USING NEW.name, NEW.household_id, OLD.name;
    END IF;
    RETURN NEW;
END;
$$;
