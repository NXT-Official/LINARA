-- Plans and platform settings: admin-priced subscription plans and the
-- free-tier switch (sell-Linara plan, Task 2, 2026-10-19).
--
-- public.plans holds the plans Linara admins price. Money is integer
-- centavos (PHP, tax-inclusive). NULL included_* means unlimited seats;
-- NULL extra_*_centavos means extra seats cannot be bought. Everyone can
-- read active public plans (the pricing page); only platform admins can
-- see drafts or write.
--
-- public.platform_settings is a single row (id = 1) with the free-tier
-- switch. Signed-in users can read it; only platform admins can update it.
-- There is no INSERT/DELETE policy, so the row can't be added to or removed.
--
-- Apply by hand in the SQL editor. AFTER add-platform-admins.sql (needs
-- public.is_platform_admin()). Safe to run twice.
-- Tested in PGlite: supabase/tests/plans.test.mjs.

CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    tagline TEXT NOT NULL DEFAULT '',
    inclusions TEXT[] NOT NULL DEFAULT '{}',
    interval TEXT NOT NULL CHECK (interval IN ('one_time', 'monthly', 'yearly')),
    base_centavos BIGINT NOT NULL DEFAULT 0 CHECK (base_centavos >= 0),
    included_helpers INT NULL CHECK (included_helpers >= 0),
    included_managers INT NULL CHECK (included_managers >= 0),
    included_homes INT NULL CHECK (included_homes >= 0),
    extra_helper_centavos BIGINT NULL CHECK (extra_helper_centavos >= 0),
    extra_manager_centavos BIGINT NULL CHECK (extra_manager_centavos >= 0),
    extra_home_centavos BIGINT NULL CHECK (extra_home_centavos >= 0),
    trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
    is_public BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plans_public_idx ON public.plans (status, is_public, sort_order);

CREATE OR REPLACE FUNCTION public.plans_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_touch ON public.plans;
CREATE TRIGGER plans_touch
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.plans_touch();

CREATE TABLE IF NOT EXISTS public.platform_settings (
    id INT PRIMARY KEY CHECK (id = 1),
    free_tier_enabled BOOLEAN NOT NULL DEFAULT true,
    free_helper_seats INT NULL CHECK (free_helper_seats >= 0),
    free_manager_seats INT NULL CHECK (free_manager_seats >= 0),
    support_email TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;

REVOKE ALL ON public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.platform_settings TO authenticated;

DROP POLICY IF EXISTS plans_public_read ON public.plans;
CREATE POLICY plans_public_read ON public.plans
    FOR SELECT TO anon, authenticated
    USING (status = 'active' AND is_public);

DROP POLICY IF EXISTS plans_platform_admin_all ON public.plans;
CREATE POLICY plans_platform_admin_all ON public.plans
    FOR ALL TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS platform_settings_platform_admin_write ON public.platform_settings;
CREATE POLICY platform_settings_platform_admin_write ON public.platform_settings
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
