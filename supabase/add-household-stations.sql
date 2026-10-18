-- Each household keeps its own list of stations (decided 2026-10-08,
-- KNOWN_GAPS.md O37).
--
-- helper_profiles.station was CHECK-limited to Yaya, Cook, Laundry, Driver
-- and House, so a large estate's gardeners, guards or maintenance staff had
-- no station. Now:
--
--   * household_stations: a household's stations, named by its managers.
--     Every household starts with the five, plus any other name its staff
--     already have; a new household starts with the five.
--   * helper_profiles.station keeps holding the station's NAME, so both apps
--     read it as before. The CHECK goes; instead a new or changed station has
--     to be one of the household's (spelled as the list spells it).
--   * Renaming a station renames it on everyone who has it (and on the
--     house's SOPs). Removing one is refused while anyone current is on it;
--     staff who have left keep the name they had, as a record. A household
--     always keeps at least one.
--
-- Who: everyone in a household reads its list; primary and co-managers
-- change it (the same rule as teams, add-teams-and-labels.sql).
--
-- Apply by hand in the SQL editor. Safe to run twice. Tested in PGlite:
-- supabase/tests/household-stations.test.mjs.

CREATE TABLE IF NOT EXISTS public.household_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL DEFAULT public.current_household_id()
        REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
    -- The order pickers list them in: the five first, new ones after.
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS household_stations_name_key
    ON public.household_stations (household_id, lower(btrim(name)));

-- --------------------------------------------------------------------------
-- 1. The five, for every household now and every new one.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_household_stations(p_household_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.household_stations (household_id, name, sort_order)
    SELECT p_household_id, s.name, s.ord
    FROM (VALUES ('Yaya', 1), ('Cook', 2), ('Laundry', 3), ('Driver', 4), ('House', 5))
        AS s(name, ord)
    ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_household_stations(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.households_seed_stations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_household_stations(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_seed_stations ON public.households;
CREATE TRIGGER households_seed_stations
    AFTER INSERT ON public.households
    FOR EACH ROW EXECUTE FUNCTION public.households_seed_stations();

DO $$
DECLARE
    v_household UUID;
BEGIN
    FOR v_household IN SELECT id FROM public.households LOOP
        PERFORM public.seed_household_stations(v_household);
    END LOOP;
END;
$$;

-- Any other station a household's staff already have joins its list.
INSERT INTO public.household_stations (household_id, name)
SELECT DISTINCT ON (hp.household_id, lower(btrim(hp.station)))
       hp.household_id, btrim(hp.station)
FROM public.helper_profiles hp
WHERE btrim(coalesce(hp.station, '')) <> ''
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 2. helper_profiles.station: any of the household's, not the fixed five.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid = 'public.helper_profiles'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%station%'
    LOOP
        EXECUTE format('ALTER TABLE public.helper_profiles DROP CONSTRAINT %I', v_name);
    END LOOP;
END;
$$;

-- The household's spelling of the station, or NULL if it has none by that name.
CREATE OR REPLACE FUNCTION public.household_station_name(p_household_id UUID, p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.name FROM public.household_stations s
    WHERE s.household_id = p_household_id AND lower(s.name) = lower(btrim(p_name));
$$;
GRANT EXECUTE ON FUNCTION public.household_station_name(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.helper_profiles_station_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_name TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.station IS NOT DISTINCT FROM OLD.station
       AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id THEN
        RETURN NEW;
    END IF;
    v_name := public.household_station_name(NEW.household_id, NEW.station);
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'There''s no station called "%" in this household', NEW.station;
    END IF;
    NEW.station := v_name;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_profiles_station_guard ON public.helper_profiles;
CREATE TRIGGER helper_profiles_station_guard
    BEFORE INSERT OR UPDATE OF station, household_id ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.helper_profiles_station_guard();

-- --------------------------------------------------------------------------
-- 3. Renaming and removing.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_stations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_on INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT count(*) INTO v_on FROM public.helper_profiles hp
        WHERE hp.household_id = OLD.household_id
          AND lower(hp.station) = lower(OLD.name)
          AND hp.status IS DISTINCT FROM 'INACTIVE';
        IF v_on > 0 THEN
            RAISE EXCEPTION '% on "%". Give them another station first.',
                CASE WHEN v_on = 1 THEN '1 person is' ELSE v_on || ' people are' END, OLD.name;
        END IF;
        -- The household being deleted takes its stations with it.
        IF EXISTS (SELECT 1 FROM public.households WHERE id = OLD.household_id)
           AND NOT EXISTS (
               SELECT 1 FROM public.household_stations
               WHERE household_id = OLD.household_id AND id <> OLD.id
           ) THEN
            RAISE EXCEPTION 'A household needs at least one station';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
        RAISE EXCEPTION 'A station stays in its household';
    END IF;
    NEW.name := btrim(NEW.name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_stations_guard ON public.household_stations;
CREATE TRIGGER household_stations_guard
    BEFORE UPDATE OR DELETE ON public.household_stations
    FOR EACH ROW EXECUTE FUNCTION public.household_stations_guard();

-- A new name follows onto everyone who had the old one, the ones who left
-- included, and onto the house's SOPs if they carry a station (the live
-- house_sops has no such column; every rename failed on it, fixed by
-- fix-station-rename.sql).
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

DROP TRIGGER IF EXISTS household_stations_rename ON public.household_stations;
CREATE TRIGGER household_stations_rename
    AFTER UPDATE OF name ON public.household_stations
    FOR EACH ROW EXECUTE FUNCTION public.household_stations_rename();

-- --------------------------------------------------------------------------
-- 4. Policies.
-- --------------------------------------------------------------------------
ALTER TABLE public.household_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_stations_read ON public.household_stations;
CREATE POLICY household_stations_read ON public.household_stations
    FOR SELECT USING (household_id IN (SELECT public.my_household_ids()));

DROP POLICY IF EXISTS household_stations_write ON public.household_stations;
CREATE POLICY household_stations_write ON public.household_stations
    FOR ALL
    USING (household_id = public.current_household_id() AND public.is_household_manager())
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_manager());

REVOKE ALL ON public.household_stations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_stations TO authenticated;
