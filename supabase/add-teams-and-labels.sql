-- Teams and labels, for a household with tens or hundreds of staff (decided
-- 2026-10-05: one large estate run as departments; separate properties stay
-- separate households). KNOWN_GAPS.md O36.
--
--   * A TEAM is a department: Kitchen, Grounds, Security, the Main House.
--     A helper is on at most one, and it's what the manager's views group by
--     (the Pass's lanes, Schedule's rows, payroll subtotals, rest-day
--     coverage). helper_profiles.team_id; NULL means "no team yet".
--   * A LABEL is anything else worth filtering by: Night shift, Trainee,
--     Building B. Any number per helper (helper_labels).
--
-- Both are chosen when she's invited and can be changed on People. Primary
-- and co-managers write them (they manage helpers, plan.md 1.2); a remote
-- admin reads them. Every manager reads them all.
--
-- A helper sees her own team and her own labels, on her Record in
-- LINARA_MOBILE (user's choice, 2026-10-05: the manager screen shows only
-- what she could see too, so a label can't become a private note about her).
-- She can't read a label nobody has given her, and can't change her own: her
-- helper_profiles row is held to her availability columns by
-- helper_profiles_zz_guard_own_update (fix-helper-write-access.sql), which
-- team_id isn't one of. Team names are household-wide, like helper_profiles.
--
-- A team or label from another household can't be attached (trigger, since
-- a plain foreign key can't say "the same household").
--
-- Apply by hand in the SQL editor, after fix-helper-write-access.sql and
-- add-household-managers.sql. Safe to run twice. Tested in PGlite:
-- supabase/tests/teams-and-labels.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Tables.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS household_teams_name_key
    ON public.household_teams (household_id, lower(btrim(name)));

-- tone: one of a fixed set the web maps to its palette, so a label reads at
-- a glance in a long list without anyone picking hex codes.
CREATE TABLE IF NOT EXISTS public.household_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
    tone TEXT NOT NULL DEFAULT 'sand'
        CHECK (tone IN ('sand', 'pine', 'clay', 'sky', 'sage', 'plum')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS household_labels_name_key
    ON public.household_labels (household_id, lower(btrim(name)));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'helper_profiles' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE public.helper_profiles
            ADD COLUMN team_id UUID REFERENCES public.household_teams(id) ON DELETE SET NULL;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_helper_profiles_team ON public.helper_profiles(team_id)
    WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.helper_labels (
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES public.household_labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (helper_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_helper_labels_label ON public.helper_labels(label_id);

-- --------------------------------------------------------------------------
-- 2. Same household only.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helper_profiles_team_same_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.team_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.household_teams t
        WHERE t.id = NEW.team_id AND t.household_id = NEW.household_id
    ) THEN
        RAISE EXCEPTION 'That team belongs to another household';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_profiles_team_same_household ON public.helper_profiles;
CREATE TRIGGER helper_profiles_team_same_household
    BEFORE INSERT OR UPDATE OF team_id, household_id ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.helper_profiles_team_same_household();

CREATE OR REPLACE FUNCTION public.helper_labels_same_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.helper_profiles hp
        JOIN public.household_labels l ON l.household_id = hp.household_id
        WHERE hp.id = NEW.helper_id AND l.id = NEW.label_id
    ) THEN
        RAISE EXCEPTION 'That label belongs to another household';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_labels_same_household ON public.helper_labels;
CREATE TRIGGER helper_labels_same_household
    BEFORE INSERT OR UPDATE ON public.helper_labels
    FOR EACH ROW EXECUTE FUNCTION public.helper_labels_same_household();

-- --------------------------------------------------------------------------
-- 3. Who reads and writes.
-- --------------------------------------------------------------------------
ALTER TABLE public.household_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_labels ENABLE ROW LEVEL SECURITY;

-- Teams: everyone in the household reads; primary and co-managers write.
DROP POLICY IF EXISTS household_teams_read ON public.household_teams;
CREATE POLICY household_teams_read ON public.household_teams
    FOR SELECT USING (household_id = public.current_household_id());

DROP POLICY IF EXISTS household_teams_write ON public.household_teams;
CREATE POLICY household_teams_write ON public.household_teams
    FOR ALL
    USING (household_id = public.current_household_id() AND public.is_household_manager())
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_manager());

-- Labels: managers read them all; a helper reads only the ones she has.
DROP POLICY IF EXISTS household_labels_read ON public.household_labels;
CREATE POLICY household_labels_read ON public.household_labels
    FOR SELECT USING (
        household_id = public.current_household_id()
        AND (
            public.current_user_type() IS DISTINCT FROM 'helper'
            OR EXISTS (
                SELECT 1 FROM public.helper_labels hl
                JOIN public.helper_profiles hp ON hp.id = hl.helper_id
                WHERE hl.label_id = household_labels.id AND hp.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS household_labels_write ON public.household_labels;
CREATE POLICY household_labels_write ON public.household_labels
    FOR ALL
    USING (household_id = public.current_household_id() AND public.is_household_manager())
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_manager());

-- Who has which label: managers read the household's; a helper reads her own.
DROP POLICY IF EXISTS helper_labels_read ON public.helper_labels;
CREATE POLICY helper_labels_read ON public.helper_labels
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = helper_labels.helper_id
              AND hp.household_id = public.current_household_id()
              AND (public.current_user_type() IS DISTINCT FROM 'helper' OR hp.user_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS helper_labels_write ON public.helper_labels;
CREATE POLICY helper_labels_write ON public.helper_labels
    FOR ALL
    USING (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = helper_labels.helper_id AND hp.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = helper_labels.helper_id AND hp.household_id = public.current_household_id()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.household_teams, public.household_labels, public.helper_labels
    TO authenticated;
