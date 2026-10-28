-- Teams and labels follow the plan (follows add-billing.sql and
-- add-teams-and-labels.sql). Found 2026-10-28: Free managers could make and
-- use teams; the plan's teams_labels feature was checked nowhere.
--
-- Like Pantry: nothing new without a plan that has Teams and labels. A new
-- team or label, putting someone on a team, or giving someone a label is
-- refused. What's there stays: reads, renames, taking someone off a team and
-- deleting keep working, so a manager who moves down loses nothing.
--
-- Apply by hand in the Supabase SQL editor, after add-billing.sql and
-- add-teams-and-labels.sql. Safe to run twice. Tested in PGlite:
-- supabase/tests/teams-plan-guard.test.mjs.

CREATE OR REPLACE FUNCTION public.billing_guard_teams()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'helper_profiles' THEN
        -- Only putting someone on a team; taking them off (NULL) is always fine.
        IF NEW.team_id IS NULL
           OR (TG_OP = 'UPDATE' AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id) THEN
            RETURN NEW;
        END IF;
        PERFORM public.billing_assert_feature(NEW.household_id, 'teams_labels', 'Teams and labels');
    ELSIF TG_TABLE_NAME = 'helper_labels' THEN
        PERFORM public.billing_assert_feature(
            (SELECT l.household_id FROM public.household_labels l WHERE l.id = NEW.label_id),
            'teams_labels', 'Teams and labels');
    ELSE
        PERFORM public.billing_assert_feature(NEW.household_id, 'teams_labels', 'Teams and labels');
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_guard_teams() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS billing_guard_teams ON public.household_teams;
CREATE TRIGGER billing_guard_teams BEFORE INSERT ON public.household_teams
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_teams();
DROP TRIGGER IF EXISTS billing_guard_teams ON public.household_labels;
CREATE TRIGGER billing_guard_teams BEFORE INSERT ON public.household_labels
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_teams();
DROP TRIGGER IF EXISTS billing_guard_teams ON public.helper_labels;
CREATE TRIGGER billing_guard_teams BEFORE INSERT ON public.helper_labels
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_teams();
DROP TRIGGER IF EXISTS billing_guard_teams ON public.helper_profiles;
CREATE TRIGGER billing_guard_teams BEFORE INSERT OR UPDATE OF team_id ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_teams();
