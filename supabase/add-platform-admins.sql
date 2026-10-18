-- Platform admins: Linara staff who can price plans, read analytics and
-- answer support across households (sell-Linara plan, Task 1, 2026-10-19).
--
-- public.platform_admins lists them; public.is_platform_admin() is the one
-- check every later admin policy and RPC uses. Nobody can add or remove an
-- admin through the API: there is no INSERT/UPDATE/DELETE policy and the
-- grants are SELECT only. Admins are added from the SQL editor, e.g. the
-- owner:
--
--   INSERT INTO public.platform_admins (user_id, note)
--   SELECT id, 'owner' FROM auth.users WHERE email = '<you>'
--   ON CONFLICT DO NOTHING;
--
-- am_i_platform_admin() is the wrapper the web app calls to decide whether
-- to show the "Linara admin" area; it only ever answers about the caller.
--
-- Apply by hand in the SQL editor. AFTER the base schema (needs auth.users).
-- Safe to run twice. Tested in PGlite: supabase/tests/platform-admins.test.mjs.

CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by UUID NULL,
    note TEXT NULL
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;

-- SECURITY DEFINER so the check works from inside other tables' policies
-- without recursing through this table's own policy.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.am_i_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin();
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.am_i_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_platform_admin() TO authenticated;

DROP POLICY IF EXISTS platform_admins_read ON public.platform_admins;
CREATE POLICY platform_admins_read ON public.platform_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_platform_admin());
