-- FAQs: questions and answers Linara staff write once and anyone, signed in or
-- not, reads on the public FAQ page (sell-Linara plan, Task 7, 2026-10-19).
--
-- Only published rows are visible to the public. Platform admins see drafts
-- and are the only people who can create, edit or delete a row; the grants
-- give authenticated write access and RLS narrows it to admins.
--
-- Apply by hand in the SQL editor. AFTER add-platform-admins.sql (needs
-- public.is_platform_admin()). Safe to run twice.
-- Tested in PGlite: supabase/tests/faqs.test.mjs.

CREATE TABLE IF NOT EXISTS public.faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 200),
    answer TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 4000),
    category TEXT NOT NULL DEFAULT 'General' CHECK (length(category) BETWEEN 1 AND 40),
    sort_order INT NOT NULL DEFAULT 0,
    published BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NULL
);

CREATE INDEX IF NOT EXISTS faqs_published_category_sort_idx
    ON public.faqs (published, category, sort_order);

CREATE OR REPLACE FUNCTION public.faqs_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS faqs_touch ON public.faqs;
CREATE TRIGGER faqs_touch
    BEFORE INSERT OR UPDATE ON public.faqs
    FOR EACH ROW EXECUTE FUNCTION public.faqs_touch();

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faqs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faqs TO authenticated;

DROP POLICY IF EXISTS faqs_public_read ON public.faqs;
CREATE POLICY faqs_public_read ON public.faqs
    FOR SELECT TO anon, authenticated
    USING (published);

DROP POLICY IF EXISTS faqs_platform_admin_all ON public.faqs;
CREATE POLICY faqs_platform_admin_all ON public.faqs
    FOR ALL TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
