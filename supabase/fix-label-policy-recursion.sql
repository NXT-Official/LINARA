-- Fixes "infinite recursion detected in policy for relation
-- household_labels" (found live 2026-10-06, KNOWN_GAPS.md O39): once
-- add-shared-staff-and-places.sql was applied, every read of labels failed,
-- so Teams & labels on People and the label chips stopped loading.
--
-- Cause: that migration's helper_labels_write (a FOR ALL policy, so it's
-- also checked on reads) looked up household_labels, whose read policy looks
-- up helper_labels. Postgres refuses the loop. Both lookups now go through
-- SECURITY DEFINER functions that read the other table without its
-- policies. Same fix as in add-shared-staff-and-places.sql itself, for a
-- database that already ran it.
--
-- Apply by hand in the SQL editor. Safe to run twice. Tested in PGlite:
-- supabase/tests/shared-staff-and-places.test.mjs ("Labels").

-- Labels, without the two tables' policies reading each other (that loops:
-- "infinite recursion detected in policy for relation household_labels",
-- live 2026-10-06). A label's household, and whether the caller has a label,
-- are read here instead, with RLS out of the way.
CREATE OR REPLACE FUNCTION public.label_household(p_label_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.household_labels WHERE id = p_label_id;
$$;

CREATE OR REPLACE FUNCTION public.i_have_label(p_label_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.helper_labels hl
        JOIN public.helper_profiles hp ON hp.id = hl.helper_id
        WHERE hl.label_id = p_label_id AND hp.user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.label_household(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_have_label(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.label_household(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.i_have_label(UUID) TO authenticated;

DROP POLICY IF EXISTS household_labels_read ON public.household_labels;
CREATE POLICY household_labels_read ON public.household_labels
    FOR SELECT USING (
        (public.current_user_type() IS DISTINCT FROM 'helper'
            AND household_id = public.current_household_id())
        OR (
            household_id IN (SELECT public.my_household_ids())
            AND public.i_have_label(id)
        )
    );

DROP POLICY IF EXISTS helper_labels_write ON public.helper_labels;
CREATE POLICY helper_labels_write ON public.helper_labels
    FOR ALL
    USING (
        public.is_household_manager()
        AND public.helper_works_in(helper_id, public.current_household_id())
        AND public.label_household(label_id) = public.current_household_id()
    )
    WITH CHECK (
        public.is_household_manager()
        AND public.helper_works_in(helper_id, public.current_household_id())
        AND public.label_household(label_id) = public.current_household_id()
    );
