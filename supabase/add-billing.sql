-- Subscriptions: plans, a manager's subscription, payments through Xendit,
-- and the plan's features and limits enforced here, not only in the apps
-- (documentation/specs/2026-10-26-subscriptions-plan.md, R1 to R10).
--
-- WHO PAYS
--   The manager account, not the household (R2). A household's plan is its
--   primary manager's. No subscription row means Free.
--
-- PLANS
--   billing_plans with immutable versions (R3): the console publishes a new
--   version to change a price or what's included, and subscribers stay on
--   the version they paid for. Features are a fixed list in code (R4); a
--   version maps them on or off. A kasambahay's leave and rest days, the
--   after-hours ledger (rest owed) and her work record are on every version:
--   her weekly rest day and yearly leave are hers by law (RA 10361).
--
-- STATUS (worked out from the dates, so no job has to flip it)
--   active / trialing  until current_period_end
--   past_due           the 7 days after it (grace): nothing changes yet
--   restricted         after grace: nothing new can be added until it's paid
--   A subscription set to cancel at period end is Free once the period ends.
--
-- PAYMENTS (Xendit invoices, test mode until prod exists)
--   billing-checkout (Edge Function) asks billing_create_payment for the
--   amount, which is worked out here from the catalog, never taken from the
--   browser, then creates the Xendit invoice and attaches it. The
--   xendit-billing-webhook function re-reads the invoice from Xendit and hands
--   it to billing_apply_invoice, which logs it in billing_events once per
--   invoice and status (R10) and applies a payment once: a replayed callback
--   changes nothing. An amount that doesn't match is refused and kept for
--   review.
--
-- ENFORCED HERE
--   * Pantry and groceries: new pantry items, grocery items and runs need a
--     plan with Pantry.
--   * Remote admin: inviting or making one needs a plan with Remote admin.
--   * Limits: households (as primary manager), kasambahay (each person once
--     across the manager's households, R7; an invite takes a place) and
--     co-managers (co-managers and remote admins, with open invites). Taken
--     under a lock per manager, so two invites at the last place can't both
--     get in.
--   * Restricted: nothing in the limits above can be added.
--   Existing rows are never removed or changed by any of this.
--
-- NOT YET: renewal reminders (R11), auto-renew (cards, Maya), promotions,
-- BIR receipts (R14), pausing what isn't picked to stay active while
-- restricted (the web asks; the database doesn't hold it to it yet).
--
-- Apply by hand in the Supabase SQL editor, after add-household-managers.sql,
-- restrict-create-household.sql and add-pay-hr-switch.sql. Safe to run twice.
-- Tested in PGlite: supabase/tests/billing.test.mjs.

-- --------------------------------------------------------------------------
-- 1. The catalog.
-- --------------------------------------------------------------------------

-- The features a plan can include, the same list as src/features/plan/plan.sample.ts.
CREATE OR REPLACE FUNCTION public.billing_feature_keys()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['tasks', 'quick_utos', 'schedule', 'pantry', 'time_off', 'after_hours',
                 'teams_labels', 'remote_admin', 'work_record', 'staff_pay_hr']
$$;
-- On every plan: a kasambahay's rest, leave and record (RA 10361).
CREATE OR REPLACE FUNCTION public.billing_every_plan_keys()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['time_off', 'after_hours', 'work_record']
$$;
CREATE OR REPLACE FUNCTION public.billing_limit_keys()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['households', 'kasambahay', 'co_managers']
$$;

-- Features: every known key, each true or false, the every-plan ones true.
-- Limits: every known key, each a whole number from 0 or null (unlimited).
CREATE OR REPLACE FUNCTION public.billing_valid_version(p_features JSONB, p_limits JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_typeof(p_features) = 'object' AND jsonb_typeof(p_limits) = 'object'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_features) k)
           = (SELECT array_agg(k ORDER BY k) FROM unnest(public.billing_feature_keys()) k)
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(p_features) e WHERE jsonb_typeof(e.value) <> 'boolean')
       AND NOT EXISTS (SELECT 1 FROM unnest(public.billing_every_plan_keys()) k
                        WHERE p_features ->> k IS DISTINCT FROM 'true')
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_limits) k)
           = (SELECT array_agg(k ORDER BY k) FROM unnest(public.billing_limit_keys()) k)
       AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(p_limits) e
             WHERE NOT (jsonb_typeof(e.value) = 'null'
                        OR (jsonb_typeof(e.value) = 'number'
                            AND (e.value #>> '{}') ~ '^[0-9]{1,6}$')))
$$;

CREATE TABLE IF NOT EXISTS public.billing_plans (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,30}$'),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'retired')),
    display_order INT NOT NULL DEFAULT 0,
    -- A plan never published: what the console is editing, in the console's
    -- PlanContent shape. Published plans keep their content in versions.
    draft JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES public.billing_plans(id),
    version INT NOT NULL CHECK (version >= 1),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
    -- Centavos per cycle; null when not sold that way.
    price_monthly BIGINT CHECK (price_monthly BETWEEN 0 AND 100000000),
    price_annual BIGINT CHECK (price_annual BETWEEN 0 AND 100000000),
    price_one_time BIGINT CHECK (price_one_time BETWEEN 0 AND 100000000),
    trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 90),
    features JSONB NOT NULL,
    limits JSONB NOT NULL,
    -- Sample prices until marketing sets real ones: never shown publicly.
    price_placeholder BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ,
    -- What changed from the version before, in a few words (the console's history).
    summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 300),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (plan_id, version),
    CHECK (public.billing_valid_version(features, limits)),
    CHECK (price_monthly IS NOT NULL OR price_annual IS NOT NULL OR price_one_time IS NOT NULL)
);

-- A published version can't change: a price edit is a new version (R3).
CREATE OR REPLACE FUNCTION public.billing_versions_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.published_at IS NOT NULL THEN
            RAISE EXCEPTION 'A published plan version can''t be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'A published plan version can''t change. Publish a new version.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_versions_immutable ON public.billing_plan_versions;
CREATE TRIGGER billing_versions_immutable BEFORE UPDATE OR DELETE ON public.billing_plan_versions
    FOR EACH ROW EXECUTE FUNCTION public.billing_versions_immutable();

CREATE TABLE IF NOT EXISTS public.billing_addons (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,30}$'),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
    limit_key TEXT NOT NULL CHECK (limit_key = ANY (public.billing_limit_keys())),
    step INT NOT NULL CHECK (step BETWEEN 1 AND 100),
    -- Centavos a month; a yearly plan pays twelve. Null until marketing sets it.
    monthly_price BIGINT CHECK (monthly_price BETWEEN 0 AND 99999999),
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT active OR monthly_price IS NOT NULL)
);

-- --------------------------------------------------------------------------
-- 2. Subscriptions, payments, the webhook log, what stays active.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
    manager_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_version_id UUID NOT NULL REFERENCES public.billing_plan_versions(id),
    cycle TEXT NOT NULL CHECK (cycle IN ('monthly', 'annual', 'one_time')),
    -- [{"addonId": "extra_kasambahay", "quantity": 1}], quantities 1 to 10.
    addons JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(addons) = 'array'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- plan: a plan change, or paying what's owed on the plan it has.
    -- addons: add-ons bought on the plan it has.
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'addons')),
    plan_version_id UUID NOT NULL REFERENCES public.billing_plan_versions(id),
    cycle TEXT NOT NULL CHECK (cycle IN ('monthly', 'annual', 'one_time')),
    addons JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Centavos.
    amount BIGINT NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'review')),
    xendit_invoice_id TEXT UNIQUE,
    invoice_url TEXT,
    payment_method TEXT,
    payment_channel TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_payments_by_manager
    ON public.billing_payments (manager_id, created_at DESC);

-- Every Xendit callback, raw, once per invoice and status (R10).
CREATE TABLE IF NOT EXISTS public.billing_events (
    id BIGSERIAL PRIMARY KEY,
    event_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    outcome TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which households and kasambahay stay active when over the limits (R6).
CREATE TABLE IF NOT EXISTS public.billing_active_selection (
    manager_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    households UUID[] NOT NULL DEFAULT '{}',
    kasambahay UUID[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No app-role access to any of it: everything goes through the functions below.
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_active_selection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plans, public.billing_plan_versions, public.billing_addons,
    public.billing_subscriptions, public.billing_payments, public.billing_events,
    public.billing_active_selection FROM anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. Seed: the console's launch catalog, placeholder prices (marketing sets
--    the real ones). Only when there's no catalog yet.
-- --------------------------------------------------------------------------
INSERT INTO public.billing_plans (id, status, display_order) VALUES
    ('free', 'published', 1), ('normal', 'published', 2), ('premium', 'published', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_plan_versions
    (plan_id, version, name, description, price_monthly, price_annual, trial_days,
     features, limits, price_placeholder, published_at)
SELECT v.plan_id, 1, v.name, v.description, v.monthly, v.annual, v.trial,
       (SELECT jsonb_object_agg(k, k = ANY (v.features) OR k = ANY (public.billing_every_plan_keys()))
          FROM unnest(public.billing_feature_keys()) k),
       v.limits, v.placeholder, now()
  FROM (VALUES
    ('free', 'Free', 'For one household getting started.', 0::bigint, NULL::bigint, 0,
     ARRAY['tasks', 'quick_utos', 'schedule'],
     '{"households": 1, "kasambahay": 1, "co_managers": 0}'::jsonb, false),
    ('normal', 'Normal', 'All the essentials for a household and its staff.', 19900, 199000, 14,
     ARRAY['tasks', 'quick_utos', 'schedule', 'pantry'],
     '{"households": 1, "kasambahay": 3, "co_managers": 1}'::jsonb, true),
    ('premium', 'Premium', 'Everything in Normal, plus the advanced features.', 39900, 399000, 14,
     public.billing_feature_keys(),
     '{"households": 3, "kasambahay": null, "co_managers": 3}'::jsonb, true)
  ) AS v(plan_id, name, description, monthly, annual, trial, features, limits, placeholder)
 WHERE NOT EXISTS (SELECT 1 FROM public.billing_plan_versions pv WHERE pv.plan_id = v.plan_id);

INSERT INTO public.billing_addons (id, name, limit_key, step, monthly_price) VALUES
    ('extra_household', 'Extra household', 'households', 1, 10000),
    ('extra_kasambahay', 'Extra kasambahay', 'kasambahay', 1, 5000)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. Reading a plan.
-- --------------------------------------------------------------------------

-- The plan's newest published version, or null.
CREATE OR REPLACE FUNCTION public.billing_current_version(p_plan_id TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT pv.id FROM public.billing_plan_versions pv
     WHERE pv.plan_id = p_plan_id AND pv.published_at IS NOT NULL
     ORDER BY pv.version DESC LIMIT 1
$$;

-- A version in the apps' CatalogPlan shape (src/features/plan/plan.types.ts).
CREATE OR REPLACE FUNCTION public.billing_version_json(p_version_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'id', pv.plan_id, 'name', pv.name, 'description', pv.description,
        'prices', jsonb_build_object('monthly', pv.price_monthly, 'annual', pv.price_annual,
                                     'one_time', pv.price_one_time),
        'trialDays', pv.trial_days, 'features', pv.features, 'limits', pv.limits,
        'version', pv.version, 'pricePlaceholder', pv.price_placeholder)
      FROM public.billing_plan_versions pv WHERE pv.id = p_version_id
$$;

-- What's on sale: the published plans' newest versions, the active add-ons,
-- and the global switches. Readable signed out, for the landing page.
CREATE OR REPLACE FUNCTION public.billing_catalog()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'plans', COALESCE((
            SELECT jsonb_agg(public.billing_version_json(public.billing_current_version(p.id))
                             ORDER BY p.display_order, p.id)
              FROM public.billing_plans p
             WHERE p.status = 'published' AND public.billing_current_version(p.id) IS NOT NULL),
            '[]'::jsonb),
        'addons', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'limitKey', a.limit_key,
                                                'step', a.step, 'monthlyPrice', a.monthly_price)
                             ORDER BY a.id)
              FROM public.billing_addons a WHERE a.active), '[]'::jsonb),
        'switches', jsonb_build_object('staff_pay_hr', public.pay_hr_enabled()))
$$;

-- The manager's subscription with its status worked out from the dates.
-- Free (the newest published Free version) when there's none, or when a
-- cancelled one's period has ended.
CREATE OR REPLACE FUNCTION public.billing_subscription_json(p_manager UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s public.billing_subscriptions%ROWTYPE;
    v public.billing_plan_versions%ROWTYPE;
    v_status TEXT;
BEGIN
    SELECT * INTO s FROM public.billing_subscriptions WHERE manager_id = p_manager;
    IF s.manager_id IS NOT NULL THEN
        SELECT * INTO v FROM public.billing_plan_versions WHERE id = s.plan_version_id;
    END IF;
    IF s.manager_id IS NULL
       OR (s.cancel_at_period_end AND s.current_period_end IS NOT NULL
           AND s.current_period_end <= now()) THEN
        SELECT * INTO v FROM public.billing_plan_versions
         WHERE id = public.billing_current_version('free');
        RETURN jsonb_build_object(
            'planId', COALESCE(v.plan_id, 'free'), 'planVersion', COALESCE(v.version, 1),
            'cycle', 'monthly', 'addons', '[]'::jsonb, 'status', 'active',
            'cancelAtPeriodEnd', false, 'periodEnd', NULL);
    END IF;
    v_status := CASE
        WHEN s.current_period_end IS NULL OR now() < s.current_period_end THEN s.status
        WHEN now() < s.current_period_end + interval '7 days' THEN 'past_due'
        ELSE 'restricted' END;
    RETURN jsonb_build_object(
        'planId', v.plan_id, 'planVersion', v.version, 'cycle', s.cycle, 'addons', s.addons,
        'status', v_status, 'cancelAtPeriodEnd', s.cancel_at_period_end,
        'periodEnd', to_jsonb(s.current_period_end));
END;
$$;

-- The version a subscription json is on.
CREATE OR REPLACE FUNCTION public.billing_sub_version(p_sub JSONB)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT pv.id FROM public.billing_plan_versions pv
     WHERE pv.plan_id = p_sub ->> 'planId' AND pv.version = (p_sub ->> 'planVersion')::int
$$;

-- The plan's limits plus what its add-ons raise them by; null is unlimited.
CREATE OR REPLACE FUNCTION public.billing_limits(p_sub JSONB)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_object_agg(k, CASE
        WHEN pv.limits -> k = 'null'::jsonb THEN 'null'::jsonb
        ELSE to_jsonb((pv.limits ->> k)::int + COALESCE((
            SELECT sum(a.step * (l ->> 'quantity')::int)
              FROM jsonb_array_elements(p_sub -> 'addons') l
              JOIN public.billing_addons a ON a.id = l ->> 'addonId'
             WHERE a.limit_key = k), 0)) END)
      FROM unnest(public.billing_limit_keys()) k,
           public.billing_plan_versions pv
     WHERE pv.id = public.billing_sub_version(p_sub)
$$;

-- The households a manager is primary of.
CREATE OR REPLACE FUNCTION public.billing_owned_households(p_manager UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT hm.household_id FROM public.household_managers hm
     WHERE hm.user_id = p_manager AND hm.role = 'primary_manager'
$$;

-- What the limits are measured against, across every household the manager
-- owns: kasambahay counted once each (R7), invited or working; co-managers
-- and remote admins counted once each, with open invites.
CREATE OR REPLACE FUNCTION public.billing_usage(p_manager UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'households', (SELECT count(*) FROM public.billing_owned_households(p_manager)),
        'kasambahay', (
            SELECT count(DISTINCT COALESCE(hp.user_id::text, hp.id::text))
              FROM public.helper_profiles hp
             WHERE hp.household_id IN (SELECT public.billing_owned_households(p_manager))
               AND hp.status <> 'INACTIVE'),
        'co_managers', (
            SELECT count(DISTINCT hm.user_id) FROM public.household_managers hm
             WHERE hm.household_id IN (SELECT public.billing_owned_households(p_manager))
               AND hm.role IN ('co_manager', 'remote_admin') AND hm.user_id <> p_manager)
          + (SELECT count(*) FROM public.manager_invites mi
              WHERE mi.household_id IN (SELECT public.billing_owned_households(p_manager))
                AND mi.claimed_at IS NULL AND mi.revoked_at IS NULL AND mi.expires_at > now()))
$$;

-- The household's primary manager: whose plan the household is on.
CREATE OR REPLACE FUNCTION public.billing_household_owner(p_household UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT hm.user_id FROM public.household_managers hm
     WHERE hm.household_id = p_household AND hm.role = 'primary_manager'
$$;

-- Whether a household's plan includes a feature. On-every-plan features are
-- always on; staff pay & HR also needs its global switch (R5).
CREATE OR REPLACE FUNCTION public.billing_household_has(p_household UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID := public.billing_household_owner(p_household);
    v_features JSONB;
BEGIN
    IF p_key = ANY (public.billing_every_plan_keys()) THEN
        RETURN true;
    END IF;
    IF p_key = 'staff_pay_hr' AND NOT public.pay_hr_enabled() THEN
        RETURN false;
    END IF;
    SELECT pv.features INTO v_features FROM public.billing_plan_versions pv
     WHERE pv.id = public.billing_sub_version(public.billing_subscription_json(v_owner));
    RETURN COALESCE((v_features ->> p_key)::boolean, false);
END;
$$;

-- The plan of the household the caller is in, for anyone in it: a
-- co-manager or remote admin gets the owner's plan (R2), and the helper app
-- reads it to lock Pantry. No prices or payments in it.
CREATE OR REPLACE FUNCTION public.my_household_plan()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_household UUID := public.current_household_id();
    v_owner UUID;
    v_sub JSONB;
BEGIN
    IF auth.uid() IS NULL OR v_household IS NULL THEN
        RAISE EXCEPTION 'Not in a household';
    END IF;
    v_owner := public.billing_household_owner(v_household);
    v_sub := public.billing_subscription_json(v_owner);
    RETURN jsonb_build_object(
        'planId', v_sub ->> 'planId', 'status', v_sub ->> 'status', 'subscription', v_sub,
        'features', (SELECT jsonb_object_agg(k, public.billing_household_has(v_household, k))
                       FROM unnest(public.billing_feature_keys()) k),
        'limits', public.billing_limits(v_sub));
END;
$$;

-- --------------------------------------------------------------------------
-- 5. What a change costs (the same rules as src/features/plan/plan.logic.ts).
-- --------------------------------------------------------------------------

-- Add-on lines checked and tidied: known active add-ons, whole quantities 0
-- to 10, each once, zeros dropped, sorted by id.
CREATE OR REPLACE FUNCTION public.billing_clean_addons(p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    l JSONB;
    v_out JSONB := '[]'::jsonb;
    v_seen TEXT[] := '{}';
    v_id TEXT;
    v_qty INT;
BEGIN
    IF p_addons IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;
    IF jsonb_typeof(p_addons) <> 'array' OR jsonb_array_length(p_addons) > 20 THEN
        RAISE EXCEPTION 'Add-ons aren''t in the right form.';
    END IF;
    FOR l IN SELECT * FROM jsonb_array_elements(p_addons) LOOP
        IF jsonb_typeof(l) <> 'object' OR jsonb_typeof(l -> 'addonId') <> 'string'
           OR jsonb_typeof(l -> 'quantity') <> 'number'
           OR (l ->> 'quantity') !~ '^[0-9]{1,2}$' THEN
            RAISE EXCEPTION 'Add 0 to 10 of each add-on.';
        END IF;
        v_id := l ->> 'addonId';
        v_qty := (l ->> 'quantity')::int;
        IF v_qty > 10 THEN
            RAISE EXCEPTION 'Add 0 to 10 of each add-on.';
        END IF;
        IF v_id = ANY (v_seen) THEN
            RAISE EXCEPTION 'An add-on is listed twice.';
        END IF;
        v_seen := v_seen || v_id;
        IF v_qty = 0 THEN
            CONTINUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.billing_addons a WHERE a.id = v_id AND a.active) THEN
            RAISE EXCEPTION 'One of the add-ons isn''t offered.';
        END IF;
        v_out := v_out || jsonb_build_array(jsonb_build_object('addonId', v_id, 'quantity', v_qty));
    END LOOP;
    RETURN (SELECT COALESCE(jsonb_agg(e ORDER BY e ->> 'addonId'), '[]'::jsonb)
              FROM jsonb_array_elements(v_out) e);
END;
$$;

-- What a version, cycle and add-ons cost each cycle. Raises when it can't be had.
CREATE OR REPLACE FUNCTION public.billing_price(p_version UUID, p_cycle TEXT, p_addons JSONB)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v public.billing_plan_versions%ROWTYPE;
    v_price BIGINT;
    v_months INT := CASE p_cycle WHEN 'monthly' THEN 1 WHEN 'annual' THEN 12 END;
BEGIN
    SELECT * INTO v FROM public.billing_plan_versions WHERE id = p_version;
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'That plan isn''t offered.';
    END IF;
    v_price := CASE p_cycle WHEN 'monthly' THEN v.price_monthly WHEN 'annual' THEN v.price_annual
                            WHEN 'one_time' THEN v.price_one_time END;
    IF v_price IS NULL THEN
        RAISE EXCEPTION 'That plan isn''t sold that way.';
    END IF;
    IF jsonb_array_length(p_addons) > 0 AND (v_months IS NULL OR v_price = 0) THEN
        RAISE EXCEPTION 'Add-ons need a paid monthly or yearly plan.';
    END IF;
    RETURN v_price + COALESCE((
        SELECT sum(a.monthly_price * v_months * (l ->> 'quantity')::int)
          FROM jsonb_array_elements(p_addons) l
          JOIN public.billing_addons a ON a.id = l ->> 'addonId'), 0);
END;
$$;

-- --------------------------------------------------------------------------
-- 6. Payments (server key only: called by the billing Edge Functions).
-- --------------------------------------------------------------------------

-- Starts a payment for the manager and returns it; the amount comes from
-- the catalog. kind 'plan': a plan, cycle and add-ons that cost something
-- and aren't what the manager already has (paying what's owed on the plan
-- they have is allowed). kind 'addons': the add-ons the plan should have
-- after; only what's added is charged, for the period that's running.
CREATE OR REPLACE FUNCTION public.billing_create_payment(
    p_manager UUID, p_kind TEXT, p_plan_id TEXT, p_cycle TEXT, p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB;
    v_lines JSONB := public.billing_clean_addons(p_addons);
    v_version UUID;
    v_cycle TEXT;
    v_amount BIGINT;
    v_row public.billing_payments%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.household_managers hm
                    WHERE hm.user_id = p_manager AND hm.role = 'primary_manager') THEN
        RAISE EXCEPTION 'Only a household''s primary manager pays for its plan.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || p_manager::text));
    v_sub := public.billing_subscription_json(p_manager);

    IF p_kind = 'plan' THEN
        IF p_cycle NOT IN ('monthly', 'annual', 'one_time') THEN
            RAISE EXCEPTION 'Choose monthly or yearly.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.billing_plans p
                        WHERE p.id = p_plan_id AND p.status = 'published') THEN
            RAISE EXCEPTION 'That plan isn''t offered.';
        END IF;
        v_version := public.billing_current_version(p_plan_id);
        -- Paying what's owed keeps the version they're on.
        IF p_plan_id = v_sub ->> 'planId' THEN
            v_version := public.billing_sub_version(v_sub);
        END IF;
        v_cycle := p_cycle;
        v_amount := public.billing_price(v_version, v_cycle, v_lines);
        IF v_amount = 0 THEN
            RAISE EXCEPTION 'Nothing to pay on this plan.';
        END IF;
        IF p_plan_id = v_sub ->> 'planId' AND v_cycle = v_sub ->> 'cycle'
           AND v_lines = v_sub -> 'addons'
           AND v_sub ->> 'status' NOT IN ('past_due', 'restricted') THEN
            RAISE EXCEPTION 'That''s the plan you already have.';
        END IF;
    ELSIF p_kind = 'addons' THEN
        v_version := public.billing_sub_version(v_sub);
        v_cycle := v_sub ->> 'cycle';
        IF v_cycle = 'one_time' OR public.billing_price(v_version, v_cycle, '[]'::jsonb) = 0 THEN
            RAISE EXCEPTION 'Add-ons are for paid monthly or yearly plans: Normal and Premium.';
        END IF;
        IF v_sub ->> 'status' IN ('past_due', 'restricted') THEN
            RAISE EXCEPTION 'Pay what''s owed first, then add more.';
        END IF;
        IF v_lines = v_sub -> 'addons' THEN
            RAISE EXCEPTION 'Nothing changed.';
        END IF;
        v_amount := public.billing_price(v_version, v_cycle, v_lines)
                  - public.billing_price(v_version, v_cycle, v_sub -> 'addons');
        IF v_amount <= 0 THEN
            RAISE EXCEPTION 'Nothing to pay for this change.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unknown payment.';
    END IF;

    INSERT INTO public.billing_payments (manager_id, kind, plan_version_id, cycle, addons, amount)
    VALUES (p_manager, p_kind, v_version, v_cycle, v_lines, v_amount)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('id', v_row.id, 'amount', v_row.amount, 'kind', v_row.kind,
        'description', (SELECT pv.name FROM public.billing_plan_versions pv WHERE pv.id = v_version)
            || CASE WHEN p_kind = 'addons' THEN ' add-ons' ELSE
               CASE v_cycle WHEN 'annual' THEN ', yearly' WHEN 'monthly' THEN ', monthly' ELSE '' END END);
END;
$$;

-- Records the Xendit invoice made for a pending payment.
CREATE OR REPLACE FUNCTION public.billing_attach_invoice(
    p_payment UUID, p_invoice_id TEXT, p_invoice_url TEXT, p_expires_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.billing_payments
       SET xendit_invoice_id = p_invoice_id, invoice_url = p_invoice_url, expires_at = p_expires_at
     WHERE id = p_payment AND status = 'pending' AND xendit_invoice_id IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That payment can''t take an invoice.';
    END IF;
END;
$$;

-- A payment that couldn't get an invoice: marked failed so it doesn't hang.
CREATE OR REPLACE FUNCTION public.billing_fail_payment(p_payment UUID, p_reason TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.billing_payments SET status = 'failed', failure_reason = left(p_reason, 300)
     WHERE id = p_payment AND status = 'pending'
$$;

-- Applies a Xendit invoice, as read back from Xendit by the webhook. Logged
-- once per invoice and status; a payment is applied once. Returns what
-- happened: 'applied', 'duplicate', 'ignored', 'expired', 'review' or
-- 'unknown'.
CREATE OR REPLACE FUNCTION public.billing_apply_invoice(p_invoice JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id TEXT := p_invoice ->> 'id';
    v_status TEXT := upper(COALESCE(p_invoice ->> 'status', ''));
    v_key TEXT;
    p public.billing_payments%ROWTYPE;
    v_sub JSONB;
    v_paid BIGINT;
    v_outcome TEXT;
    v_months INT;
BEGIN
    IF v_id IS NULL OR v_status = '' THEN
        RAISE EXCEPTION 'Not an invoice.';
    END IF;
    -- PAID and SETTLED are the same payment.
    v_key := 'invoice:' || v_id || ':' || CASE WHEN v_status IN ('PAID', 'SETTLED') THEN 'PAID'
                                              ELSE v_status END;
    BEGIN
        INSERT INTO public.billing_events (event_key, payload, outcome)
        VALUES (v_key, p_invoice, 'received');
    EXCEPTION WHEN unique_violation THEN
        RETURN 'duplicate';
    END;

    SELECT * INTO p FROM public.billing_payments
     WHERE xendit_invoice_id = v_id
     FOR UPDATE;
    IF p.id IS NULL THEN
        v_outcome := 'unknown';
    ELSIF v_status = 'EXPIRED' THEN
        -- Only a payment still waiting expires; a paid one stays paid.
        IF p.status = 'pending' THEN
            UPDATE public.billing_payments SET status = 'expired',
                   failure_reason = 'The payment page expired before it was paid.'
             WHERE id = p.id;
            v_outcome := 'expired';
        ELSE
            v_outcome := 'ignored';
        END IF;
    ELSIF v_status NOT IN ('PAID', 'SETTLED') THEN
        v_outcome := 'ignored';
    ELSIF p.status NOT IN ('pending', 'expired') THEN
        v_outcome := 'duplicate';
    ELSE
        v_paid := round(COALESCE((p_invoice ->> 'paid_amount')::numeric,
                                 (p_invoice ->> 'amount')::numeric) * 100);
        IF v_paid IS DISTINCT FROM p.amount
           OR upper(COALESCE(p_invoice ->> 'currency', 'PHP')) <> 'PHP' THEN
            UPDATE public.billing_payments SET status = 'review', paid_at = now(),
                   failure_reason = 'Paid amount doesn''t match. Check it in the console.'
             WHERE id = p.id;
            v_outcome := 'review';
        ELSE
            PERFORM pg_advisory_xact_lock(hashtext('billing:' || p.manager_id::text));
            v_sub := public.billing_subscription_json(p.manager_id);
            UPDATE public.billing_payments
               SET status = 'paid', paid_at = COALESCE((p_invoice ->> 'paid_at')::timestamptz, now()),
                   payment_method = p_invoice ->> 'payment_method',
                   payment_channel = p_invoice ->> 'payment_channel', failure_reason = NULL
             WHERE id = p.id;
            IF p.kind = 'plan' THEN
                v_months := CASE p.cycle WHEN 'monthly' THEN 1 WHEN 'annual' THEN 12 END;
                INSERT INTO public.billing_subscriptions AS s
                    (manager_id, plan_version_id, cycle, addons, status,
                     current_period_start, current_period_end, cancel_at_period_end, updated_at)
                VALUES (p.manager_id, p.plan_version_id, p.cycle, p.addons, 'active', now(),
                        CASE WHEN v_months IS NULL THEN NULL
                             ELSE now() + make_interval(months => v_months) END,
                        false, now())
                ON CONFLICT (manager_id) DO UPDATE SET
                    plan_version_id = EXCLUDED.plan_version_id, cycle = EXCLUDED.cycle,
                    addons = EXCLUDED.addons, status = 'active',
                    current_period_start = EXCLUDED.current_period_start,
                    current_period_end = EXCLUDED.current_period_end,
                    cancel_at_period_end = false, updated_at = now();
                DELETE FROM public.billing_active_selection WHERE manager_id = p.manager_id;
                UPDATE public.billing_payments SET applied_at = now() WHERE id = p.id;
                v_outcome := 'applied';
            ELSIF public.billing_sub_version(v_sub) = p.plan_version_id
                  AND v_sub ->> 'cycle' = p.cycle
                  AND v_sub ->> 'status' IN ('active', 'trialing') THEN
                UPDATE public.billing_subscriptions SET addons = p.addons, updated_at = now()
                 WHERE manager_id = p.manager_id;
                UPDATE public.billing_payments SET applied_at = now() WHERE id = p.id;
                v_outcome := 'applied';
            ELSE
                -- The plan changed while this was being paid: paid, kept for review.
                UPDATE public.billing_payments SET status = 'review',
                       failure_reason = 'The plan changed before these add-ons were paid. Check it in the console.'
                 WHERE id = p.id;
                v_outcome := 'review';
            END IF;
        END IF;
    END IF;
    UPDATE public.billing_events SET outcome = v_outcome WHERE event_key = v_key;
    RETURN v_outcome;
END;
$$;

-- --------------------------------------------------------------------------
-- 7. What the manager does without paying, and what they read.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_require_owner()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.household_managers hm
         WHERE hm.user_id = auth.uid() AND hm.role = 'primary_manager') THEN
        RAISE EXCEPTION 'Only a household''s primary manager manages its plan.';
    END IF;
    RETURN auth.uid();
END;
$$;

-- The signed-in manager's plan, usage, payments and what stays active.
CREATE OR REPLACE FUNCTION public.my_billing()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_sub JSONB := public.billing_subscription_json(v_uid);
BEGIN
    RETURN jsonb_build_object(
        'subscription', v_sub,
        'plan', public.billing_version_json(public.billing_sub_version(v_sub)),
        'limits', public.billing_limits(v_sub),
        'usage', public.billing_usage(v_uid),
        'selection', (SELECT jsonb_build_object('households', to_jsonb(s.households),
                                                'kasambahay', to_jsonb(s.kasambahay))
                        FROM public.billing_active_selection s WHERE s.manager_id = v_uid),
        'payments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', bp.id, 'kind', bp.kind, 'reference', COALESCE(bp.xendit_invoice_id, ''),
                'planId', pv.plan_id, 'cycle', bp.cycle, 'amount', bp.amount,
                'method', bp.payment_channel, 'status', bp.status, 'at', bp.created_at,
                'paidAt', bp.paid_at, 'failureReason', bp.failure_reason,
                'invoiceUrl', CASE WHEN bp.status = 'pending' AND bp.expires_at > now()
                                   THEN bp.invoice_url END)
                ORDER BY bp.created_at DESC)
              FROM (SELECT * FROM public.billing_payments
                     WHERE manager_id = v_uid ORDER BY created_at DESC LIMIT 50) bp
              JOIN public.billing_plan_versions pv ON pv.id = bp.plan_version_id), '[]'::jsonb),
        'catalog', public.billing_catalog());
END;
$$;

-- Moving to Free: no payment, takes effect now, the over-limit picker
-- decides what stays active.
CREATE OR REPLACE FUNCTION public.billing_change_to_free()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_free UUID := public.billing_current_version('free');
BEGIN
    IF v_free IS NULL THEN
        RAISE EXCEPTION 'That plan isn''t offered.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    IF public.billing_subscription_json(v_uid) ->> 'planId' = 'free' THEN
        RAISE EXCEPTION 'That''s the plan you already have.';
    END IF;
    INSERT INTO public.billing_subscriptions AS s
        (manager_id, plan_version_id, cycle, addons, status, current_period_start,
         current_period_end, cancel_at_period_end, updated_at)
    VALUES (v_uid, v_free, 'monthly', '[]'::jsonb, 'active', now(), NULL, false, now())
    ON CONFLICT (manager_id) DO UPDATE SET
        plan_version_id = v_free, cycle = 'monthly', addons = '[]'::jsonb, status = 'active',
        current_period_start = now(), current_period_end = NULL, cancel_at_period_end = false,
        updated_at = now();
    DELETE FROM public.billing_active_selection WHERE manager_id = v_uid;
    RETURN public.billing_subscription_json(v_uid);
END;
$$;

-- Fewer add-ons: nothing to pay, nothing refunded. Refuses one that adds.
CREATE OR REPLACE FUNCTION public.billing_remove_addons(p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_lines JSONB := public.billing_clean_addons(p_addons);
    v_sub JSONB;
    v_version UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    v_sub := public.billing_subscription_json(v_uid);
    v_version := public.billing_sub_version(v_sub);
    IF v_lines = v_sub -> 'addons' THEN
        RAISE EXCEPTION 'Nothing changed.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_lines) n
         WHERE (n ->> 'quantity')::int > COALESCE((
            SELECT (o ->> 'quantity')::int FROM jsonb_array_elements(v_sub -> 'addons') o
             WHERE o ->> 'addonId' = n ->> 'addonId'), 0)) THEN
        RAISE EXCEPTION 'That adds add-ons: pay for them first.';
    END IF;
    PERFORM public.billing_price(v_version, v_sub ->> 'cycle', v_lines);
    UPDATE public.billing_subscriptions SET addons = v_lines, updated_at = now()
     WHERE manager_id = v_uid;
    RETURN public.billing_subscription_json(v_uid);
END;
$$;

-- What stays active when over the limits: only the manager's own households
-- and the kasambahay in them, each once, at least one household, no more of
-- each than the plan allows.
CREATE OR REPLACE FUNCTION public.billing_save_selection(p_households UUID[], p_kasambahay UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_limits JSONB := public.billing_limits(public.billing_subscription_json(v_uid));
    v_households UUID[] := COALESCE(p_households, '{}');
    v_kasambahay UUID[] := COALESCE(p_kasambahay, '{}');
BEGIN
    IF cardinality(v_households) <> (SELECT count(DISTINCT x) FROM unnest(v_households) x)
       OR cardinality(v_kasambahay) <> (SELECT count(DISTINCT x) FROM unnest(v_kasambahay) x) THEN
        RAISE EXCEPTION 'Something is picked twice.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_households) x
                WHERE x NOT IN (SELECT public.billing_owned_households(v_uid)))
       OR EXISTS (SELECT 1 FROM unnest(v_kasambahay) x
                   WHERE x NOT IN (SELECT hp.id FROM public.helper_profiles hp
                                    WHERE hp.household_id IN
                                          (SELECT public.billing_owned_households(v_uid)))) THEN
        RAISE EXCEPTION 'Something picked isn''t there any more. Pick again.';
    END IF;
    IF cardinality(v_households) = 0 THEN
        RAISE EXCEPTION 'Keep at least one household active.';
    END IF;
    IF v_limits -> 'households' <> 'null'::jsonb
       AND cardinality(v_households) > (v_limits ->> 'households')::int THEN
        RAISE EXCEPTION 'Pick up to % households.', v_limits ->> 'households';
    END IF;
    IF v_limits -> 'kasambahay' <> 'null'::jsonb
       AND cardinality(v_kasambahay) > (v_limits ->> 'kasambahay')::int THEN
        RAISE EXCEPTION 'Pick up to % kasambahay.', v_limits ->> 'kasambahay';
    END IF;
    INSERT INTO public.billing_active_selection (manager_id, households, kasambahay, updated_at)
    VALUES (v_uid, v_households, v_kasambahay, now())
    ON CONFLICT (manager_id) DO UPDATE SET households = EXCLUDED.households,
        kasambahay = EXCLUDED.kasambahay, updated_at = now();
END;
$$;

-- --------------------------------------------------------------------------
-- 8. Enforcement.
-- --------------------------------------------------------------------------

-- Raises unless the owner's plan has room for one more of a limit. Takes the
-- owner's lock first, so the count and the insert that follows can't race.
CREATE OR REPLACE FUNCTION public.billing_assert_room(p_owner UUID, p_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB;
    v_limit JSONB;
    v_used INT;
    v_name TEXT;
    v_label TEXT := CASE p_key WHEN 'households' THEN 'households'
                               WHEN 'kasambahay' THEN 'kasambahay' ELSE 'co-managers' END;
BEGIN
    IF p_owner IS NULL THEN
        RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || p_owner::text));
    v_sub := public.billing_subscription_json(p_owner);
    IF v_sub ->> 'status' = 'restricted' THEN
        RAISE EXCEPTION 'The plan''s payment is overdue, so nothing new can be added until it''s paid.'
            USING ERRCODE = 'P0001';
    END IF;
    v_limit := public.billing_limits(v_sub) -> p_key;
    IF v_limit IS NULL OR v_limit = 'null'::jsonb THEN
        RETURN;
    END IF;
    v_used := (public.billing_usage(p_owner) ->> p_key)::int;
    IF v_used + 1 > (v_limit #>> '{}')::int THEN
        SELECT pv.name INTO v_name FROM public.billing_plan_versions pv
         WHERE pv.id = public.billing_sub_version(v_sub);
        RAISE EXCEPTION 'The % plan allows % %, and % are in use.',
            COALESCE(v_name, 'current'), v_limit #>> '{}', v_label, v_used
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_assert_feature(p_household UUID, p_key TEXT, p_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_household IS NOT NULL AND NOT public.billing_household_has(p_household, p_key) THEN
        RAISE EXCEPTION '% isn''t on this household''s plan.', p_name USING ERRCODE = 'P0001';
    END IF;
END;
$$;

-- A new household as its primary manager; a co-manager or remote admin added
-- or made one.
CREATE OR REPLACE FUNCTION public.billing_guard_managers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.role = OLD.role THEN
        RETURN NEW;
    END IF;
    IF NEW.role = 'primary_manager' THEN
        PERFORM public.billing_assert_room(NEW.user_id, 'households');
    ELSE
        IF NEW.role = 'remote_admin' THEN
            PERFORM public.billing_assert_feature(NEW.household_id, 'remote_admin', 'Remote admin');
        END IF;
        -- A co-manager made a remote admin (or back) already has a place.
        IF TG_OP = 'INSERT' OR OLD.role = 'primary_manager' THEN
            -- Claiming an invite (claim_manager_invite adds the member, then
            -- closes the invite): the open invite already holds the place.
            IF NOT EXISTS (SELECT 1 FROM public.manager_invites mi
                            WHERE mi.household_id = NEW.household_id AND mi.role = NEW.role
                              AND mi.claimed_at IS NULL AND mi.revoked_at IS NULL
                              AND mi.expires_at > now()) THEN
                PERFORM public.billing_assert_room(
                    public.billing_household_owner(NEW.household_id), 'co_managers');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_managers ON public.household_managers;
CREATE TRIGGER billing_guard_managers BEFORE INSERT OR UPDATE OF role ON public.household_managers
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_managers();

CREATE OR REPLACE FUNCTION public.billing_guard_manager_invites()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.role = 'remote_admin' THEN
        PERFORM public.billing_assert_feature(NEW.household_id, 'remote_admin', 'Remote admin');
    END IF;
    PERFORM public.billing_assert_room(public.billing_household_owner(NEW.household_id), 'co_managers');
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_manager_invites ON public.manager_invites;
CREATE TRIGGER billing_guard_manager_invites BEFORE INSERT ON public.manager_invites
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_manager_invites();

-- A new kasambahay (an invite takes a place), or one taken back on. A
-- person already working another of the owner's households counts once.
CREATE OR REPLACE FUNCTION public.billing_guard_helpers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF NEW.status = 'INACTIVE' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'INACTIVE'
       AND NEW.household_id = OLD.household_id THEN
        RETURN NEW;
    END IF;
    v_owner := public.billing_household_owner(NEW.household_id);
    IF NEW.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.helper_profiles hp
         WHERE hp.user_id = NEW.user_id AND hp.id <> NEW.id AND hp.status <> 'INACTIVE'
           AND hp.household_id IN (SELECT public.billing_owned_households(v_owner))) THEN
        RETURN NEW;
    END IF;
    PERFORM public.billing_assert_room(v_owner, 'kasambahay');
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_helpers ON public.helper_profiles;
CREATE TRIGGER billing_guard_helpers BEFORE INSERT OR UPDATE OF status, household_id
    ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.billing_guard_helpers();

-- Pantry and groceries: nothing new without a plan that has Pantry. Reads,
-- edits and deletes of what's there keep working.
CREATE OR REPLACE FUNCTION public.billing_guard_pantry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.billing_assert_feature(NEW.household_id, 'pantry', 'Pantry and groceries');
    RETURN NEW;
END;
$$;
DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['pantry_items', 'grocery_items', 'grocery_runs'] LOOP
        IF to_regclass('public.' || v_table) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS billing_guard_pantry ON public.%I', v_table);
            EXECUTE format('CREATE TRIGGER billing_guard_pantry BEFORE INSERT ON public.%I
                            FOR EACH ROW EXECUTE FUNCTION public.billing_guard_pantry()', v_table);
        END IF;
    END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 9. Grants.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    -- Internal or server key only.
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_current_version(text)',
        'public.billing_version_json(uuid)',
        'public.billing_subscription_json(uuid)',
        'public.billing_sub_version(jsonb)',
        'public.billing_limits(jsonb)',
        'public.billing_owned_households(uuid)',
        'public.billing_usage(uuid)',
        'public.billing_household_owner(uuid)',
        'public.billing_household_has(uuid, text)',
        'public.billing_clean_addons(jsonb)',
        'public.billing_price(uuid, text, jsonb)',
        'public.billing_create_payment(uuid, text, text, text, jsonb)',
        'public.billing_attach_invoice(uuid, text, text, timestamptz)',
        'public.billing_fail_payment(uuid, text)',
        'public.billing_apply_invoice(jsonb)',
        'public.billing_require_owner()',
        'public.billing_assert_room(uuid, text)',
        'public.billing_assert_feature(uuid, text, text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY[
        'public.my_billing()',
        'public.my_household_plan()',
        'public.billing_change_to_free()',
        'public.billing_remove_addons(jsonb)',
        'public.billing_save_selection(uuid[], uuid[])'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
END;
$$;
-- The billing Edge Functions call these with the server key.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.billing_create_payment(uuid, text, text, text, jsonb),
            public.billing_attach_invoice(uuid, text, text, timestamptz),
            public.billing_fail_payment(uuid, text),
            public.billing_apply_invoice(jsonb) TO service_role;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_catalog() TO anon, authenticated;
