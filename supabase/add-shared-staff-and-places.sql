-- Shared staff and places (decided 2026-10-05, KNOWN_GAPS.md O39).
--
-- A family that runs several households (the main house, the beach house)
-- shares its staff between them: the driver takes A from House 1 to House 2,
-- then B back. So:
--
--   * ONE EMPLOYMENT, ONE EMPLOYER. The household she was hired into (her
--     home household, helper_profiles.household_id) pays her and keeps her
--     record: payslips, ledger, leave. Nothing here moves or copies them.
--   * SHE ALSO WORKS IN other households (helper_households). A primary or
--     co-manager adds her to a household they ALSO run: "the same family" is
--     "run by the same people" (user's choice), so nobody pulls staff into a
--     household they don't run. Each of those households can put her on one
--     of its teams.
--   * TEAMS SHE ALSO COVERS (helper_team_covers), besides her home team in
--     each household, in any household she works in.
--   * WHERE A TASK IS. A task is at its household (tickets.household_id). A
--     trip has a from and a to (tickets.from_* / to_*): each a household of
--     the family, or one of the task household's saved places
--     (household_places: School, Office, Lola's).
--
-- What her login can reach (my_household_ids()): her home household plus the
-- ones she also works in, while her employment is ACTIVE. Through it she can
-- update and add her own tasks, open each house's pantry and palengke list,
-- read its teams and saved places, and put Done photos in its folder of the
-- evidence bucket. Her session stays in her home household: everything about
-- her pay keeps working exactly as before.
--
-- What another household's managers see of her (shared_helpers()): her name,
-- station, shift, rest day, availability and team there. Never her pay.
--
-- Also closes an old gap: nothing checked that a task's helper works in the
-- task's household. tickets_helper_works_here does now.
--
-- Apply by hand in the SQL editor, after add-teams-and-labels.sql,
-- add-household-managers.sql, add-helper-task-edit.sql, add-employment-end.sql,
-- the pantry and grocery-receipt migrations and the evidence bucket's
-- storage-policies.sql (LINARA_MOBILE). Safe to run twice. Tested in PGlite:
-- supabase/tests/shared-staff-and-places.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Who runs what.
-- --------------------------------------------------------------------------

-- The caller is a primary or co-manager of this household (in
-- household_managers, so whichever household they're in right now).
CREATE OR REPLACE FUNCTION public.i_run_household(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.household_managers
        WHERE user_id = auth.uid() AND household_id = p_household_id
          AND role IN ('primary_manager', 'co_manager')
    );
$$;

-- Two households of the same family: the same, or run (primary or co) by
-- someone in common.
CREATE OR REPLACE FUNCTION public.households_share_manager(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_a = p_b OR EXISTS (
        SELECT 1
        FROM public.household_managers m1
        JOIN public.household_managers m2 ON m2.user_id = m1.user_id
        WHERE m1.household_id = p_a AND m2.household_id = p_b
          AND m1.role IN ('primary_manager', 'co_manager')
          AND m2.role IN ('primary_manager', 'co_manager')
    );
$$;

-- --------------------------------------------------------------------------
-- 2. Tables.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helper_households (
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    -- Her team in THIS household (her home team is helper_profiles.team_id).
    team_id UUID REFERENCES public.household_teams(id) ON DELETE SET NULL,
    added_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (helper_id, household_id)
);
CREATE INDEX IF NOT EXISTS idx_helper_households_household
    ON public.helper_households(household_id);

CREATE TABLE IF NOT EXISTS public.helper_team_covers (
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.household_teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (helper_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_helper_team_covers_team ON public.helper_team_covers(team_id);

CREATE TABLE IF NOT EXISTS public.household_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS household_places_name_key
    ON public.household_places (household_id, lower(btrim(name)));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'from_household_id'
    ) THEN
        ALTER TABLE public.tickets
            ADD COLUMN from_household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
            ADD COLUMN from_place_id UUID REFERENCES public.household_places(id) ON DELETE SET NULL,
            ADD COLUMN to_household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
            ADD COLUMN to_place_id UUID REFERENCES public.household_places(id) ON DELETE SET NULL,
            ADD CONSTRAINT tickets_one_from CHECK (num_nonnulls(from_household_id, from_place_id) <= 1),
            ADD CONSTRAINT tickets_one_to CHECK (num_nonnulls(to_household_id, to_place_id) <= 1);
    END IF;
    -- Which household sent a Quick Utos, now that she can get them from more
    -- than one. Filled from the sender's household.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quick_utos' AND column_name = 'household_id'
    ) THEN
        ALTER TABLE public.quick_utos
            ADD COLUMN household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;
    END IF;
END;
$$;
ALTER TABLE public.quick_utos ALTER COLUMN household_id SET DEFAULT public.current_household_id();

-- --------------------------------------------------------------------------
-- 3. Where her login reaches.
-- --------------------------------------------------------------------------

-- Her home household and every one she also works in, while employed. For
-- anyone else, just the household they're in.
CREATE OR REPLACE FUNCTION public.my_household_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.current_household_id() WHERE public.current_household_id() IS NOT NULL
    UNION
    SELECT hh.household_id
    FROM public.helper_households hh
    JOIN public.helper_profiles hp ON hp.id = hh.helper_id
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE';
$$;

-- This helper works in this household: it's her home, or she's shared in.
CREATE OR REPLACE FUNCTION public.helper_works_in(p_helper_id UUID, p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.helper_profiles WHERE id = p_helper_id AND household_id = p_household_id
    ) OR EXISTS (
        SELECT 1 FROM public.helper_households
        WHERE helper_id = p_helper_id AND household_id = p_household_id
    );
$$;

-- --------------------------------------------------------------------------
-- 4. Guards. They run as the caller (current_user tells a person from a
--    function), so what they look up across households goes through these
--    two, which don't depend on the caller's household.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helper_home_household(p_helper_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.helper_profiles WHERE id = p_helper_id;
$$;

CREATE OR REPLACE FUNCTION public.team_household(p_team_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.household_teams WHERE id = p_team_id;
$$;

CREATE OR REPLACE FUNCTION public.helper_households_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_home UUID;
BEGIN
    v_home := public.helper_home_household(NEW.helper_id);
    IF v_home = NEW.household_id THEN
        RAISE EXCEPTION 'That''s already her home household';
    END IF;
    IF NEW.team_id IS NOT NULL
       AND public.team_household(NEW.team_id) IS DISTINCT FROM NEW.household_id THEN
        RAISE EXCEPTION 'That team belongs to another household';
    END IF;
    -- Sharing her in takes someone who runs both; changing only her team
    -- there takes someone who runs that household.
    IF current_user = 'authenticated' THEN
        IF TG_OP = 'INSERT' OR NEW.helper_id <> OLD.helper_id OR NEW.household_id <> OLD.household_id THEN
            IF NOT (public.i_run_household(v_home) AND public.i_run_household(NEW.household_id)) THEN
                RAISE EXCEPTION 'You can only share staff between households you run';
            END IF;
        ELSIF NOT public.i_run_household(NEW.household_id) THEN
            RAISE EXCEPTION 'Only that household''s managers can change her team there';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.added_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_households_guard ON public.helper_households;
CREATE TRIGGER helper_households_guard
    BEFORE INSERT OR UPDATE ON public.helper_households
    FOR EACH ROW EXECUTE FUNCTION public.helper_households_guard();

CREATE OR REPLACE FUNCTION public.helper_team_covers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_team_household UUID;
BEGIN
    v_team_household := public.team_household(NEW.team_id);
    IF NOT public.helper_works_in(NEW.helper_id, v_team_household) THEN
        RAISE EXCEPTION 'She doesn''t work in that team''s household';
    END IF;
    IF current_user = 'authenticated' AND NOT public.i_run_household(v_team_household) THEN
        RAISE EXCEPTION 'Only that household''s managers can change its teams';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_team_covers_guard ON public.helper_team_covers;
CREATE TRIGGER helper_team_covers_guard
    BEFORE INSERT OR UPDATE ON public.helper_team_covers
    FOR EACH ROW EXECUTE FUNCTION public.helper_team_covers_guard();

-- A task's helper works in the task's household. Checked only when either
-- changes, so old rows aren't re-judged.
CREATE OR REPLACE FUNCTION public.tickets_helper_works_here()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.helper_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.helper_id IS DISTINCT FROM OLD.helper_id
            OR NEW.household_id IS DISTINCT FROM OLD.household_id)
       AND NOT public.helper_works_in(NEW.helper_id, NEW.household_id) THEN
        RAISE EXCEPTION 'She doesn''t work in this household';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_helper_works_here ON public.tickets;
CREATE TRIGGER tickets_helper_works_here
    BEFORE INSERT OR UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_helper_works_here();

-- A trip's ends: one of this household's saved places, or a household of the
-- same family.
CREATE OR REPLACE FUNCTION public.tickets_places_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (NEW.from_place_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.household_places
            WHERE id = NEW.from_place_id AND household_id = NEW.household_id))
       OR (NEW.to_place_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.household_places
            WHERE id = NEW.to_place_id AND household_id = NEW.household_id)) THEN
        RAISE EXCEPTION 'That place belongs to another household';
    END IF;
    IF (NEW.from_household_id IS NOT NULL
            AND NOT public.households_share_manager(NEW.from_household_id, NEW.household_id))
       OR (NEW.to_household_id IS NOT NULL
            AND NOT public.households_share_manager(NEW.to_household_id, NEW.household_id)) THEN
        RAISE EXCEPTION 'A trip can only go to houses run by the same family';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_places_guard ON public.tickets;
CREATE TRIGGER tickets_places_guard
    BEFORE INSERT OR UPDATE OF from_household_id, from_place_id, to_household_id, to_place_id, household_id
    ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_places_guard();

-- Labels: a household she's shared into can label her with its own labels.
CREATE OR REPLACE FUNCTION public.helper_labels_same_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_label_household UUID;
BEGIN
    SELECT household_id INTO v_label_household FROM public.household_labels WHERE id = NEW.label_id;
    IF v_label_household IS NULL OR NOT public.helper_works_in(NEW.helper_id, v_label_household) THEN
        RAISE EXCEPTION 'That label belongs to another household';
    END IF;
    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 5. Who reads and writes.
-- --------------------------------------------------------------------------
ALTER TABLE public.helper_households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_team_covers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_places ENABLE ROW LEVEL SECURITY;

-- Where she also works: the managers of either household, and she.
DROP POLICY IF EXISTS helper_households_read ON public.helper_households;
CREATE POLICY helper_households_read ON public.helper_households
    FOR SELECT USING (
        public.is_own_helper_profile(helper_id)
        OR (
            public.current_user_type() IS DISTINCT FROM 'helper'
            AND (
                household_id = public.current_household_id()
                OR EXISTS (
                    SELECT 1 FROM public.helper_profiles hp
                    WHERE hp.id = helper_households.helper_id
                      AND hp.household_id = public.current_household_id()
                )
            )
        )
    );

-- Written by a primary or co-manager of either side; the guard holds them
-- to running both.
DROP POLICY IF EXISTS helper_households_write ON public.helper_households;
CREATE POLICY helper_households_write ON public.helper_households
    FOR ALL
    USING (
        public.is_household_manager()
        AND (
            household_id = public.current_household_id()
            OR EXISTS (
                SELECT 1 FROM public.helper_profiles hp
                WHERE hp.id = helper_households.helper_id
                  AND hp.household_id = public.current_household_id()
            )
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND (
            household_id = public.current_household_id()
            OR EXISTS (
                SELECT 1 FROM public.helper_profiles hp
                WHERE hp.id = helper_households.helper_id
                  AND hp.household_id = public.current_household_id()
            )
        )
    );

-- Teams she also covers: that team's household's managers, and she.
DROP POLICY IF EXISTS helper_team_covers_read ON public.helper_team_covers;
CREATE POLICY helper_team_covers_read ON public.helper_team_covers
    FOR SELECT USING (
        public.is_own_helper_profile(helper_id)
        OR (
            public.current_user_type() IS DISTINCT FROM 'helper'
            AND EXISTS (
                SELECT 1 FROM public.household_teams t
                WHERE t.id = helper_team_covers.team_id
                  AND t.household_id = public.current_household_id()
            )
        )
    );

DROP POLICY IF EXISTS helper_team_covers_write ON public.helper_team_covers;
CREATE POLICY helper_team_covers_write ON public.helper_team_covers
    FOR ALL
    USING (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.household_teams t
            WHERE t.id = helper_team_covers.team_id AND t.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.household_teams t
            WHERE t.id = helper_team_covers.team_id AND t.household_id = public.current_household_id()
        )
    );

-- Saved places: read by everyone who works there; written by its managers.
DROP POLICY IF EXISTS household_places_read ON public.household_places;
CREATE POLICY household_places_read ON public.household_places
    FOR SELECT USING (household_id IN (SELECT public.my_household_ids()));

DROP POLICY IF EXISTS household_places_write ON public.household_places;
CREATE POLICY household_places_write ON public.household_places
    FOR ALL
    USING (household_id = public.current_household_id() AND public.is_household_manager())
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_manager());

-- Team names in every household she works in.
DROP POLICY IF EXISTS household_teams_read ON public.household_teams;
CREATE POLICY household_teams_read ON public.household_teams
    FOR SELECT USING (household_id IN (SELECT public.my_household_ids()));

-- Her labels from any household she works in; a shared household's managers
-- label her with their own labels.
DROP POLICY IF EXISTS household_labels_read ON public.household_labels;
CREATE POLICY household_labels_read ON public.household_labels
    FOR SELECT USING (
        (public.current_user_type() IS DISTINCT FROM 'helper'
            AND household_id = public.current_household_id())
        OR (
            household_id IN (SELECT public.my_household_ids())
            AND EXISTS (
                SELECT 1 FROM public.helper_labels hl
                JOIN public.helper_profiles hp ON hp.id = hl.helper_id
                WHERE hl.label_id = household_labels.id AND hp.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS helper_labels_read ON public.helper_labels;
CREATE POLICY helper_labels_read ON public.helper_labels
    FOR SELECT USING (
        public.is_own_helper_profile(helper_id)
        OR (
            public.current_user_type() IS DISTINCT FROM 'helper'
            AND public.helper_works_in(helper_id, public.current_household_id())
        )
    );

DROP POLICY IF EXISTS helper_labels_write ON public.helper_labels;
CREATE POLICY helper_labels_write ON public.helper_labels
    FOR ALL
    USING (
        public.is_household_manager()
        AND public.helper_works_in(helper_id, public.current_household_id())
        AND EXISTS (
            SELECT 1 FROM public.household_labels l
            WHERE l.id = helper_labels.label_id AND l.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND public.helper_works_in(helper_id, public.current_household_id())
        AND EXISTS (
            SELECT 1 FROM public.household_labels l
            WHERE l.id = helper_labels.label_id AND l.household_id = public.current_household_id()
        )
    );

-- Her own tasks in any household she works in: change (the column guard
-- tickets_zz_guard_helper_update still applies) and add for herself.
-- tickets_own_read (add-employment-end.sql) already lets her read them.
DROP POLICY IF EXISTS tickets_own_update_shared ON public.tickets;
CREATE POLICY tickets_own_update_shared ON public.tickets
    FOR UPDATE
    USING (public.is_own_helper_profile(helper_id) AND household_id IN (SELECT public.my_household_ids()))
    WITH CHECK (public.is_own_helper_profile(helper_id) AND household_id IN (SELECT public.my_household_ids()));

DROP POLICY IF EXISTS tickets_own_insert_shared ON public.tickets;
CREATE POLICY tickets_own_insert_shared ON public.tickets
    FOR INSERT
    WITH CHECK (public.is_own_helper_profile(helper_id) AND household_id IN (SELECT public.my_household_ids()));

-- Quick Utos: a shared household's managers send her one and see their own.
-- Her side is unchanged (quick_utos_isolation, through her home household).
DROP POLICY IF EXISTS quick_utos_shared ON public.quick_utos;
CREATE POLICY quick_utos_shared ON public.quick_utos
    FOR ALL
    USING (
        household_id = public.current_household_id()
        AND public.current_user_type() IS DISTINCT FROM 'helper'
        AND public.helper_works_in(recipient_id, public.current_household_id())
    )
    WITH CHECK (
        household_id = public.current_household_id()
        AND public.current_user_type() IS DISTINCT FROM 'helper'
        AND public.helper_works_in(recipient_id, public.current_household_id())
    );

-- Each house she works in: its name and board state, its pantry and
-- palengke list (the pantry-role guards still apply), and its receipts.
DROP POLICY IF EXISTS households_shared_staff_read ON public.households;
CREATE POLICY households_shared_staff_read ON public.households
    FOR SELECT USING (id IN (SELECT public.my_household_ids()));

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['pantry_items', 'grocery_items'] LOOP
        IF to_regclass('public.' || v_table) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_shared_staff', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL USING ('
            || 'public.current_user_type() = ''helper'' AND household_id IN (SELECT public.my_household_ids())'
            || ') WITH CHECK ('
            || 'public.current_user_type() = ''helper'' AND household_id IN (SELECT public.my_household_ids()))',
            v_table || '_shared_staff', v_table);
    END LOOP;

    IF to_regclass('public.grocery_receipts') IS NOT NULL THEN
        DROP POLICY IF EXISTS grocery_receipts_shared_staff_read ON public.grocery_receipts;
        CREATE POLICY grocery_receipts_shared_staff_read ON public.grocery_receipts
            FOR SELECT USING (household_id IN (SELECT public.my_household_ids()));
        DROP POLICY IF EXISTS grocery_receipts_shared_staff_insert ON public.grocery_receipts;
        CREATE POLICY grocery_receipts_shared_staff_insert ON public.grocery_receipts
            FOR INSERT WITH CHECK (
                household_id IN (SELECT public.my_household_ids()) AND uploaded_by = auth.uid()
            );
    END IF;

    -- Done photos and receipts for a house she's shared into go in that
    -- house's folder, where its managers can open them.
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS household_evidence_shared_staff ON storage.objects;
        CREATE POLICY household_evidence_shared_staff ON storage.objects
            FOR ALL TO authenticated
            USING (
                bucket_id = 'household-evidence'
                AND public.current_user_type() = 'helper'
                AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.my_household_ids() AS id)
            )
            WITH CHECK (
                bucket_id = 'household-evidence'
                AND public.current_user_type() = 'helper'
                AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.my_household_ids() AS id)
            );
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- 6. Reads for the apps.
-- --------------------------------------------------------------------------

-- The staff shared INTO the caller's household, for its managers' views:
-- everything the Pass, Schedule and the send gate need, nothing about pay.
CREATE OR REPLACE FUNCTION public.shared_helpers()
RETURNS TABLE (
    id UUID,
    name TEXT,
    station TEXT,
    employment TEXT,
    shift_start TIME,
    shift_end TIME,
    break_start TIME,
    break_end TIME,
    weekly_rest_day INT,
    manual_status TEXT,
    manual_available_until TIMESTAMPTZ,
    team_id UUID,
    home_household_id UUID,
    home_household_name TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hp.id, hp.name, hp.station, hp.employment, hp.shift_start, hp.shift_end,
           hp.break_start, hp.break_end, hp.weekly_rest_day,
           hp.manual_status, hp.manual_available_until,
           hh.team_id, hp.household_id, h.name, hp.created_at
    FROM public.helper_households hh
    JOIN public.helper_profiles hp ON hp.id = hh.helper_id AND hp.status = 'ACTIVE'
    JOIN public.households h ON h.id = hp.household_id
    WHERE hh.household_id = public.current_household_id()
      AND public.current_user_type() IN ('primary_manager', 'co_manager', 'remote_admin')
    ORDER BY hp.name;
$$;

-- The family's households (the caller's, and every one run by someone in
-- common), for naming houses in trips and offering them as places.
CREATE OR REPLACE FUNCTION public.family_households()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT h.id, h.name
    FROM public.households h
    WHERE EXISTS (
        SELECT 1 FROM public.my_household_ids() AS mine(id)
        WHERE public.households_share_manager(mine.id, h.id)
    )
    ORDER BY h.name;
$$;

-- Where she works: each household, whether it's home, and her team there.
CREATE OR REPLACE FUNCTION public.my_workplaces()
RETURNS TABLE (household_id UUID, name TEXT, is_home BOOLEAN, team_id UUID, team_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hp.household_id, h.name, TRUE, hp.team_id, t.name
    FROM public.helper_profiles hp
    JOIN public.households h ON h.id = hp.household_id
    LEFT JOIN public.household_teams t ON t.id = hp.team_id
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE'
    UNION ALL
    SELECT hh.household_id, h.name, FALSE, hh.team_id, t.name
    FROM public.helper_households hh
    JOIN public.helper_profiles hp ON hp.id = hh.helper_id
    JOIN public.households h ON h.id = hh.household_id
    LEFT JOIN public.household_teams t ON t.id = hh.team_id
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE'
    ORDER BY 3 DESC, 2;
$$;

-- "My team's day": her teammates' tasks in [p_from, p_to), in every team she
-- is on or covers. Who, what, when, where and status only (user's choice):
-- no notes, photos, comments or pay. Her own tasks and cancelled ones are
-- left out.
CREATE OR REPLACE FUNCTION public.team_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    ticket_id UUID,
    title TEXT,
    scheduled_start TIMESTAMPTZ,
    status TEXT,
    household_id UUID,
    helper_id UUID,
    helper_name TEXT,
    team_id UUID,
    team_name TEXT,
    from_household_id UUID,
    from_place_id UUID,
    to_household_id UUID,
    to_place_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH me AS (
        SELECT id FROM public.helper_profiles WHERE user_id = auth.uid() AND status = 'ACTIVE'
    ),
    -- Every helper and the teams they're on, in any household: home team,
    -- team where shared, and teams covered.
    membership AS (
        SELECT hp.id AS helper_id, hp.team_id
        FROM public.helper_profiles hp
        WHERE hp.status = 'ACTIVE' AND hp.team_id IS NOT NULL
        UNION
        SELECT hh.helper_id, hh.team_id FROM public.helper_households hh WHERE hh.team_id IS NOT NULL
        UNION
        SELECT c.helper_id, c.team_id FROM public.helper_team_covers c
    ),
    my_teams AS (
        SELECT DISTINCT m.team_id FROM membership m JOIN me ON me.id = m.helper_id
    )
    SELECT DISTINCT ON (tk.id)
           tk.id, tk.title, tk.scheduled_start, tk.status, tk.household_id,
           hp.id, hp.name, t.id, t.name,
           tk.from_household_id, tk.from_place_id, tk.to_household_id, tk.to_place_id
    FROM my_teams mt
    JOIN public.household_teams t ON t.id = mt.team_id
    JOIN membership m ON m.team_id = mt.team_id
    JOIN public.helper_profiles hp ON hp.id = m.helper_id AND hp.status = 'ACTIVE'
    JOIN public.tickets tk ON tk.helper_id = hp.id AND tk.household_id = t.household_id
    WHERE hp.id NOT IN (SELECT id FROM me)
      AND tk.status <> 'cancelled'
      AND tk.scheduled_start >= p_from AND tk.scheduled_start < p_to
    ORDER BY tk.id, t.name;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.i_run_household(uuid)',
        'public.households_share_manager(uuid, uuid)',
        'public.my_household_ids()',
        'public.helper_works_in(uuid, uuid)',
        'public.helper_home_household(uuid)',
        'public.team_household(uuid)',
        'public.shared_helpers()',
        'public.family_households()',
        'public.my_workplaces()',
        'public.team_day(timestamptz, timestamptz)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.helper_households, public.helper_team_covers, public.household_places
    TO authenticated;
