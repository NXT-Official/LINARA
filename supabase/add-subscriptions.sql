-- Subscriptions, platform invoices and entitlements: what a household has
-- bought from Linara, what each period was billed, and the seats that buys
-- (sell-Linara plan, Task 3, 2026-10-19).
--
-- public.subscriptions is one purchase of a plan by its owner (the primary
-- manager who pays), covering the households in public.subscription_homes.
-- public.platform_invoices is each bill for it, numbered LIN-<year>-000001 per
-- Manila calendar year from public.platform_invoice_counters, and sent to
-- Xendit with external_id 'sub_<subscription id>_<n>' (n counts that
-- subscription's invoices). Money is integer centavos (PHP, tax-inclusive; no
-- VAT: the seller is a non-VAT BMBE).
--
-- A subscription's owner, the managers of any household it covers and platform
-- admins can read it, its homes and its invoices; nobody writes them directly.
-- Every write goes through a SECURITY DEFINER function below that checks its
-- caller first:
--   quote_subscription, start_subscription,
--   attach_xendit_invoice, renew_subscription,
--   cancel_subscription ...................... the buyer (primary manager)
--   record_platform_invoice_result ........... the Xendit webhook (service_role
--                                              only: nobody else can execute it)
--   mark_platform_invoice_paid_manually,
--   grant_subscription,
--   platform_households_overview ............. platform admins
--   household_entitlements ................... the household's managers and
--                                              platform admins
-- Errors are 'CODE:detail' with NOT_ADMIN, NOT_PRIMARY, PLAN_NOT_ACTIVE,
-- SEATS_OVER_PLAN, ONE_TIME_PLAN or NOT_FOUND; the web matches the prefix.
--
-- Seats: NULL means unlimited, on a plan (included_*) and on a subscription
-- (helper_seats, manager_seats). A quote never gives fewer seats than the plan
-- includes.
--
-- Entitlement: a subscription covers its homes once it has started (paid,
-- comped or trialing, so current_period_start is set; a pending or underpaid
-- one that never started covers nothing) and until 7 days after its period
-- ends, those 7 days being past_due; a canceled one until its period ends. A
-- NULL period end (a one-time plan, an open-ended comp) never ends. Otherwise
-- the household is on the free tier (platform_settings), or has no seats when
-- the free tier is off. add-seat-limits.sql enforces the seats.
--
-- Apply by hand in the SQL editor. AFTER add-household-managers.sql,
-- add-platform-admins.sql and add-plans.sql (needs household_managers,
-- is_platform_admin(), plans and platform_settings). Safe to run twice.
-- Tested in PGlite: supabase/tests/subscriptions.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Tables.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'expired', 'canceled')),
    helper_seats INT NULL CHECK (helper_seats >= 0),
    manager_seats INT NULL CHECK (manager_seats >= 0),
    home_seats INT NOT NULL DEFAULT 1 CHECK (home_seats >= 1),
    amount_centavos BIGINT NOT NULL CHECK (amount_centavos >= 0),
    current_period_start TIMESTAMPTZ NULL,
    current_period_end TIMESTAMPTZ NULL,
    canceled_at TIMESTAMPTZ NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx ON public.subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON public.subscriptions (owner_user_id);

CREATE TABLE IF NOT EXISTS public.subscription_homes (
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    PRIMARY KEY (subscription_id, household_id)
);
CREATE INDEX IF NOT EXISTS subscription_homes_household_idx
    ON public.subscription_homes (household_id);

CREATE TABLE IF NOT EXISTS public.platform_invoice_counters (
    year INT PRIMARY KEY,
    last INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.platform_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
    external_id TEXT NOT NULL UNIQUE,
    xendit_session_id TEXT NULL,
    payment_url TEXT NULL,
    expires_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
    amount_centavos BIGINT NOT NULL CHECK (amount_centavos >= 0),
    currency TEXT NOT NULL DEFAULT 'PHP',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,
    paid_centavos BIGINT NULL,
    paid_channel TEXT NULL,
    payer_email TEXT NULL,
    raw_callback JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_invoices_subscription_idx
    ON public.platform_invoices (subscription_id);
CREATE INDEX IF NOT EXISTS platform_invoices_status_idx ON public.platform_invoices (status);

CREATE OR REPLACE FUNCTION public.subscriptions_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_touch ON public.subscriptions;
CREATE TRIGGER subscriptions_touch
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.subscriptions_touch();

-- --------------------------------------------------------------------------
-- 2. Who can read. No INSERT/UPDATE/DELETE policy and no write grant: writes
--    go through the functions below. The counter is read by no one.
-- --------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscriptions, public.subscription_homes, public.platform_invoices,
              public.platform_invoice_counters
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions, public.subscription_homes, public.platform_invoices
    TO authenticated;
-- Supabase's service_role has these already (and bypasses RLS); granted here
-- too so a database without Supabase's defaults (the PGlite tests) matches.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.subscriptions, public.subscription_homes, public.platform_invoices,
       public.platform_invoice_counters
    TO service_role;

-- Whether the caller manages the household, in any manager role. Not
-- my_household_ids(): that also spans households a helper is shared into.
CREATE OR REPLACE FUNCTION public.billing_manages_household(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.household_managers hm
                    WHERE hm.household_id = p_household_id AND hm.user_id = auth.uid());
$$;

-- Whether the caller may read a subscription, its homes and its invoices.
-- SECURITY DEFINER so the three policies don't recurse through each other.
CREATE OR REPLACE FUNCTION public.billing_can_read_subscription(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.subscriptions s
                    WHERE s.id = p_subscription_id AND s.owner_user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.subscription_homes sh
                     JOIN public.household_managers hm ON hm.household_id = sh.household_id
                    WHERE sh.subscription_id = p_subscription_id AND hm.user_id = auth.uid())
        OR public.is_platform_admin();
$$;

DROP POLICY IF EXISTS subscriptions_read ON public.subscriptions;
CREATE POLICY subscriptions_read ON public.subscriptions
    FOR SELECT TO authenticated
    USING (public.billing_can_read_subscription(id));

DROP POLICY IF EXISTS subscription_homes_read ON public.subscription_homes;
CREATE POLICY subscription_homes_read ON public.subscription_homes
    FOR SELECT TO authenticated
    USING (public.billing_can_read_subscription(subscription_id));

DROP POLICY IF EXISTS platform_invoices_read ON public.platform_invoices;
CREATE POLICY platform_invoices_read ON public.platform_invoices
    FOR SELECT TO authenticated
    USING (public.billing_can_read_subscription(subscription_id));

-- --------------------------------------------------------------------------
-- 3. Internal helpers (no caller check; nobody can execute them through the
--    API, only the functions in section 4).
-- --------------------------------------------------------------------------

-- The end of a period starting at p_start: a month or a year on, or none for a
-- one-time plan.
CREATE OR REPLACE FUNCTION public.billing_period_end(p_start TIMESTAMPTZ, p_interval TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE p_interval
               WHEN 'monthly' THEN p_start + INTERVAL '1 month'
               WHEN 'yearly' THEN p_start + INTERVAL '1 year'
           END;
$$;

-- ₱1,234.50 for 123450 centavos, for notes an admin reads.
CREATE OR REPLACE FUNCTION public.billing_peso(p_centavos BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT '₱' || to_char(p_centavos / 100.0, 'FM999,999,999,990.00');
$$;

-- LIN-2026-000001: the next number of the current Manila year. The upsert
-- locks that year's counter row, so concurrent callers queue and never share a
-- number. Past 999999 the number just grows a digit.
CREATE OR REPLACE FUNCTION public.next_platform_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Manila')::INT;
    v_last INT;
BEGIN
    INSERT INTO public.platform_invoice_counters AS c (year, last)
    VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last = c.last + 1
    RETURNING c.last INTO v_last;
    RETURN 'LIN-' || v_year || '-' || lpad(v_last::TEXT, GREATEST(6, length(v_last::TEXT)), '0');
END;
$$;

-- A pending invoice for the subscription's amount, for the period starting at
-- p_period_start. Counts the subscription's invoices for external_id's n under
-- a lock on the subscription, so two callers can't both take the same n.
CREATE OR REPLACE FUNCTION public.billing_new_invoice(p_subscription_id UUID, p_period_start TIMESTAMPTZ)
RETURNS public.platform_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub public.subscriptions%ROWTYPE;
    v_interval TEXT;
    v_n INT;
    v_invoice public.platform_invoices%ROWTYPE;
BEGIN
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
    SELECT p.interval INTO v_interval FROM public.plans p WHERE p.id = v_sub.plan_id;
    SELECT count(*) + 1 INTO v_n FROM public.platform_invoices WHERE subscription_id = v_sub.id;
    INSERT INTO public.platform_invoices
        (invoice_number, subscription_id, external_id, amount_centavos, period_start, period_end)
    VALUES (public.next_platform_invoice_number(), v_sub.id, 'sub_' || v_sub.id || '_' || v_n,
            v_sub.amount_centavos, p_period_start,
            public.billing_period_end(p_period_start, v_interval))
    RETURNING * INTO v_invoice;
    RETURN v_invoice;
END;
$$;

-- The one transition from a payment result, for the webhook and for an admin
-- marking an invoice paid by hand. Only a pending invoice changes; once it is
-- paid, expired or failed, the same result again is reported as not applied.
--   PAID, as invoiced (p_paid_centavos NULL or equal): the invoice is paid and
--     the subscription active for the next period, from the current period's
--     end if that's still ahead, else from now.
--   PAID, another amount: the payment is recorded and the subscription marked
--     past_due with a note for the admin; its period doesn't move.
--   EXPIRED: the invoice expires; the subscription stays as it was.
--   Anything else: the invoice fails.
CREATE OR REPLACE FUNCTION public.billing_settle_invoice(
    p_invoice_id UUID,
    p_status TEXT,
    p_paid_centavos BIGINT,
    p_paid_at TIMESTAMPTZ,
    p_channel TEXT,
    p_raw JSONB,
    p_xendit_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice public.platform_invoices%ROWTYPE;
    v_sub public.subscriptions%ROWTYPE;
    v_interval TEXT;
    v_paid BIGINT;
    v_start TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_invoice FROM public.platform_invoices WHERE id = p_invoice_id FOR UPDATE;
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_invoice.subscription_id FOR UPDATE;
    IF v_invoice.status <> 'pending' THEN
        RETURN jsonb_build_object('applied', false, 'invoice_status', v_invoice.status,
                                  'subscription_status', v_sub.status);
    END IF;

    IF p_status = 'PAID' THEN
        v_paid := COALESCE(p_paid_centavos, v_invoice.amount_centavos);
        UPDATE public.platform_invoices
           SET status = 'paid',
               paid_at = COALESCE(p_paid_at, now()),
               paid_centavos = v_paid,
               paid_channel = p_channel,
               raw_callback = p_raw,
               xendit_session_id = COALESCE(NULLIF(p_xendit_id, ''), xendit_session_id)
         WHERE id = v_invoice.id
        RETURNING * INTO v_invoice;

        IF v_paid = v_invoice.amount_centavos THEN
            SELECT p.interval INTO v_interval FROM public.plans p WHERE p.id = v_sub.plan_id;
            v_start := CASE WHEN v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now()
                            THEN v_sub.current_period_end
                            ELSE now() END;
            UPDATE public.subscriptions
               SET status = 'active',
                   current_period_start = v_start,
                   current_period_end = public.billing_period_end(v_start, v_interval),
                   amount_centavos = v_invoice.amount_centavos,
                   canceled_at = NULL
             WHERE id = v_sub.id
            RETURNING * INTO v_sub;
        ELSE
            UPDATE public.subscriptions
               SET status = 'past_due',
                   note = format('Paid %s for an invoice of %s; check in Xendit',
                                 public.billing_peso(v_paid),
                                 public.billing_peso(v_invoice.amount_centavos))
             WHERE id = v_sub.id
            RETURNING * INTO v_sub;
        END IF;
    ELSE
        UPDATE public.platform_invoices
           SET status = CASE WHEN p_status = 'EXPIRED' THEN 'expired' ELSE 'failed' END,
               raw_callback = p_raw
         WHERE id = v_invoice.id
        RETURNING * INTO v_invoice;
    END IF;

    RETURN jsonb_build_object('applied', true, 'invoice_status', v_invoice.status,
                              'subscription_status', v_sub.status);
END;
$$;

-- What a household is entitled to, with no caller check: household_entitlements
-- (below) checks the caller, add-seat-limits.sql's trigger needs it for any
-- insert. Prefers a covering subscription that isn't expired, the one with the
-- latest period end (NULL, no end, first); with none, the free tier, still
-- naming the latest expired subscription so the page can offer to renew it.
CREATE OR REPLACE FUNCTION public.billing_entitlements(p_household_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pick RECORD;
    v_days INT;
    v_free BOOLEAN;
    v_free_helpers INT;
    v_free_managers INT;
BEGIN
    SELECT c.id, c.status, c.effective_status, c.helper_seats, c.manager_seats,
           c.current_period_end, p.name AS plan_name
      INTO v_pick
      FROM (
          SELECT s.id, s.plan_id, s.status, s.helper_seats, s.manager_seats,
                 s.current_period_end, s.created_at,
                 CASE
                     WHEN s.current_period_end IS NULL THEN s.status
                     WHEN s.status = 'canceled' AND s.current_period_end < now() THEN 'expired'
                     WHEN s.current_period_end < now() - INTERVAL '7 days' THEN 'expired'
                     WHEN s.current_period_end < now() THEN 'past_due'
                     ELSE s.status
                 END AS effective_status
            FROM public.subscriptions s
            JOIN public.subscription_homes sh ON sh.subscription_id = s.id
           WHERE sh.household_id = p_household_id
             AND s.status IN ('trialing', 'active', 'past_due', 'canceled')
             AND s.current_period_start IS NOT NULL
      ) c
      JOIN public.plans p ON p.id = c.plan_id
     ORDER BY c.effective_status = 'expired', c.current_period_end DESC NULLS FIRST, c.created_at DESC
     LIMIT 1;

    v_days := CASE WHEN v_pick.current_period_end IS NOT NULL THEN
                  GREATEST(0, ceil(EXTRACT(EPOCH FROM (v_pick.current_period_end - now())) / 86400))::INT
              END;

    IF v_pick.id IS NOT NULL AND v_pick.effective_status <> 'expired' THEN
        RETURN jsonb_build_object(
            'source', 'subscription',
            'subscription_id', v_pick.id,
            'plan_name', v_pick.plan_name,
            'status', v_pick.status,
            'effective_status', v_pick.effective_status,
            'helper_seats', v_pick.helper_seats,
            'manager_seats', v_pick.manager_seats,
            'period_end', v_pick.current_period_end,
            'days_left', v_days);
    END IF;

    SELECT ps.free_tier_enabled, ps.free_helper_seats, ps.free_manager_seats
      INTO v_free, v_free_helpers, v_free_managers
      FROM public.platform_settings ps
     WHERE ps.id = 1;
    -- The row can't be deleted through the API; without it, the column default.
    v_free := COALESCE(v_free, true);

    RETURN jsonb_build_object(
        'source', CASE WHEN v_free THEN 'free' ELSE 'none' END,
        'subscription_id', v_pick.id,
        'plan_name', v_pick.plan_name,
        'status', v_pick.status,
        'effective_status', v_pick.effective_status,
        'helper_seats', CASE WHEN v_free THEN v_free_helpers ELSE 0 END,
        'manager_seats', CASE WHEN v_free THEN v_free_managers ELSE 0 END,
        'period_end', v_pick.current_period_end,
        'days_left', v_days);
END;
$$;

-- --------------------------------------------------------------------------
-- 4. The API.
-- --------------------------------------------------------------------------

-- The price of a plan for these seats and homes, broken down. Read-only.
CREATE OR REPLACE FUNCTION public.quote_subscription(
    p_plan_id UUID,
    p_helper_seats INT,
    p_manager_seats INT,
    p_home_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.plans%ROWTYPE;
    v_homes INT;
    v_helpers INT;
    v_managers INT;
    v_helper_extra BIGINT := 0;
    v_manager_extra BIGINT := 0;
    v_home_extra BIGINT := 0;
BEGIN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
    IF v_plan.id IS NULL OR v_plan.status <> 'active' THEN
        RAISE EXCEPTION 'PLAN_NOT_ACTIVE:plan';
    END IF;

    SELECT count(DISTINCT h) INTO v_homes FROM unnest(p_home_ids) AS h WHERE h IS NOT NULL;
    IF v_homes = 0 THEN
        RAISE EXCEPTION 'NOT_FOUND:home';
    END IF;

    IF v_plan.included_helpers IS NOT NULL THEN
        v_helpers := GREATEST(COALESCE(p_helper_seats, v_plan.included_helpers), v_plan.included_helpers);
        IF v_helpers > v_plan.included_helpers AND v_plan.extra_helper_centavos IS NULL THEN
            RAISE EXCEPTION 'SEATS_OVER_PLAN:helper';
        END IF;
        v_helper_extra := (v_helpers - v_plan.included_helpers) * COALESCE(v_plan.extra_helper_centavos, 0);
    END IF;

    IF v_plan.included_managers IS NOT NULL THEN
        v_managers := GREATEST(COALESCE(p_manager_seats, v_plan.included_managers), v_plan.included_managers);
        IF v_managers > v_plan.included_managers AND v_plan.extra_manager_centavos IS NULL THEN
            RAISE EXCEPTION 'SEATS_OVER_PLAN:manager';
        END IF;
        v_manager_extra := (v_managers - v_plan.included_managers) * COALESCE(v_plan.extra_manager_centavos, 0);
    END IF;

    IF v_plan.included_homes IS NOT NULL AND v_homes > v_plan.included_homes THEN
        IF v_plan.extra_home_centavos IS NULL THEN
            RAISE EXCEPTION 'SEATS_OVER_PLAN:home';
        END IF;
        v_home_extra := (v_homes - v_plan.included_homes) * v_plan.extra_home_centavos;
    END IF;

    RETURN jsonb_build_object(
        'amount_centavos', v_plan.base_centavos + v_helper_extra + v_manager_extra + v_home_extra,
        'base_centavos', v_plan.base_centavos,
        'helper_extra_centavos', v_helper_extra,
        'manager_extra_centavos', v_manager_extra,
        'home_extra_centavos', v_home_extra,
        'helper_seats', v_helpers,
        'manager_seats', v_managers,
        'home_seats', v_homes,
        'interval', v_plan.interval);
END;
$$;

-- Buys a plan for homes the caller is primary manager of: a pending
-- subscription and its first pending invoice, or a trial (no invoice) when the
-- plan has one and none of these homes ever had a subscription.
CREATE OR REPLACE FUNCTION public.start_subscription(
    p_plan_id UUID,
    p_helper_seats INT,
    p_manager_seats INT,
    p_home_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_homes UUID[];
    v_quote JSONB;
    v_trial_days INT;
    v_trial BOOLEAN;
    v_sub public.subscriptions%ROWTYPE;
    v_invoice public.platform_invoices%ROWTYPE;
BEGIN
    v_homes := ARRAY(SELECT DISTINCT h FROM unnest(p_home_ids) AS h WHERE h IS NOT NULL ORDER BY h);
    IF cardinality(v_homes) = 0 THEN
        RAISE EXCEPTION 'NOT_FOUND:home';
    END IF;
    IF v_uid IS NULL OR EXISTS (
        SELECT 1 FROM unnest(v_homes) AS h
         WHERE NOT EXISTS (SELECT 1 FROM public.household_managers hm
                            WHERE hm.household_id = h AND hm.user_id = v_uid
                              AND hm.role = 'primary_manager')) THEN
        RAISE EXCEPTION 'NOT_PRIMARY:home';
    END IF;

    v_quote := public.quote_subscription(p_plan_id, p_helper_seats, p_manager_seats, v_homes);

    -- One start at a time per home, so two at once can't both take the trial.
    PERFORM 1 FROM public.households WHERE id = ANY (v_homes) ORDER BY id FOR NO KEY UPDATE;
    SELECT p.trial_days INTO v_trial_days FROM public.plans p WHERE p.id = p_plan_id;
    v_trial := v_trial_days > 0 AND NOT EXISTS (
        SELECT 1 FROM public.subscription_homes sh WHERE sh.household_id = ANY (v_homes));

    INSERT INTO public.subscriptions
        (plan_id, owner_user_id, status, helper_seats, manager_seats, home_seats, amount_centavos,
         current_period_start, current_period_end)
    VALUES (p_plan_id, v_uid,
            CASE WHEN v_trial THEN 'trialing' ELSE 'pending' END,
            (v_quote ->> 'helper_seats')::INT,
            (v_quote ->> 'manager_seats')::INT,
            (v_quote ->> 'home_seats')::INT,
            (v_quote ->> 'amount_centavos')::BIGINT,
            CASE WHEN v_trial THEN now() END,
            CASE WHEN v_trial THEN now() + make_interval(days => v_trial_days) END)
    RETURNING * INTO v_sub;

    INSERT INTO public.subscription_homes (subscription_id, household_id)
    SELECT v_sub.id, h FROM unnest(v_homes) AS h;

    IF NOT v_trial THEN
        SELECT * INTO v_invoice FROM public.billing_new_invoice(v_sub.id, now());
    END IF;

    RETURN jsonb_build_object(
        'subscription_id', v_sub.id,
        'invoice_id', v_invoice.id,
        'external_id', v_invoice.external_id,
        'invoice_number', v_invoice.invoice_number,
        'amount_centavos', v_sub.amount_centavos,
        'status', v_sub.status);
END;
$$;

-- Stores the Xendit Payment Session made for a pending invoice.
CREATE OR REPLACE FUNCTION public.attach_xendit_invoice(
    p_invoice_id UUID,
    p_xendit_id TEXT,
    p_url TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.platform_invoices i
       SET xendit_session_id = p_xendit_id,
           payment_url = p_url,
           expires_at = p_expires_at
      FROM public.subscriptions s
     WHERE i.id = p_invoice_id
       AND i.status = 'pending'
       AND s.id = i.subscription_id
       AND s.owner_user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND:invoice';
    END IF;
END;
$$;

-- The Xendit webhook's result for the invoice it was sent as p_external_id.
-- Idempotent: see billing_settle_invoice. An unknown external_id is reported,
-- not raised, so the webhook can answer 200 to a callback that isn't ours.
CREATE OR REPLACE FUNCTION public.record_platform_invoice_result(
    p_external_id TEXT,
    p_xendit_id TEXT,
    p_status TEXT,
    p_paid_centavos BIGINT,
    p_paid_at TIMESTAMPTZ,
    p_channel TEXT,
    p_raw JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id UUID;
BEGIN
    SELECT id INTO v_invoice_id FROM public.platform_invoices WHERE external_id = p_external_id;
    IF v_invoice_id IS NULL THEN
        RETURN jsonb_build_object('applied', false, 'invoice_status', NULL, 'subscription_status', NULL);
    END IF;
    RETURN public.billing_settle_invoice(v_invoice_id, upper(btrim(p_status)), p_paid_centavos,
                                         p_paid_at, p_channel, p_raw, p_xendit_id);
END;
$$;

-- An invoice for the next period, or the pending one if there is one already
-- (reused). The next period starts when the current one ends, or now if it
-- has ended.
CREATE OR REPLACE FUNCTION public.renew_subscription(p_subscription_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub public.subscriptions%ROWTYPE;
    v_interval TEXT;
    v_invoice public.platform_invoices%ROWTYPE;
    v_reused BOOLEAN := true;
BEGIN
    SELECT * INTO v_sub FROM public.subscriptions
     WHERE id = p_subscription_id AND owner_user_id = auth.uid()
     FOR UPDATE;
    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND:subscription';
    END IF;
    SELECT p.interval INTO v_interval FROM public.plans p WHERE p.id = v_sub.plan_id;
    IF v_interval = 'one_time' THEN
        RAISE EXCEPTION 'ONE_TIME_PLAN:subscription';
    END IF;

    SELECT * INTO v_invoice FROM public.platform_invoices
     WHERE subscription_id = v_sub.id AND status = 'pending'
     ORDER BY created_at DESC, invoice_number DESC
     LIMIT 1;
    IF v_invoice.id IS NULL THEN
        v_reused := false;
        SELECT * INTO v_invoice
          FROM public.billing_new_invoice(v_sub.id, GREATEST(now(), COALESCE(v_sub.current_period_end, now())));
    END IF;

    RETURN jsonb_build_object(
        'subscription_id', v_sub.id,
        'invoice_id', v_invoice.id,
        'external_id', v_invoice.external_id,
        'invoice_number', v_invoice.invoice_number,
        'amount_centavos', v_invoice.amount_centavos,
        'status', v_sub.status,
        'reused', v_reused);
END;
$$;

-- Stops a subscription; its homes stay entitled until the period ends.
CREATE OR REPLACE FUNCTION public.cancel_subscription(p_subscription_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.subscriptions
       SET status = 'canceled',
           canceled_at = COALESCE(canceled_at, now())
     WHERE id = p_subscription_id AND owner_user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND:subscription';
    END IF;
END;
$$;

-- A payment that came outside Xendit (a bank transfer, GCash to the owner):
-- the same transition as a PAID callback for the invoiced amount.
CREATE OR REPLACE FUNCTION public.mark_platform_invoice_paid_manually(
    p_invoice_id UUID,
    p_channel TEXT,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount BIGINT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN:billing';
    END IF;
    SELECT amount_centavos INTO v_amount FROM public.platform_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND:invoice';
    END IF;
    RETURN public.billing_settle_invoice(
        p_invoice_id, 'PAID', v_amount, now(),
        'manual:' || COALESCE(NULLIF(btrim(p_channel), ''), 'other'),
        jsonb_build_object('manual', true, 'note', p_note, 'by', auth.uid()),
        NULL);
END;
$$;

-- A comp: an active subscription for one household, owned by its primary
-- manager, for nothing, until p_period_end (NULL: no end). The paid invoice of
-- 0 keeps revenue honest while the entitlement is real.
CREATE OR REPLACE FUNCTION public.grant_subscription(
    p_household_id UUID,
    p_plan_id UUID,
    p_helper_seats INT,
    p_manager_seats INT,
    p_period_end TIMESTAMPTZ,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID;
    v_sub public.subscriptions%ROWTYPE;
    v_invoice public.platform_invoices%ROWTYPE;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN:billing';
    END IF;
    SELECT hm.user_id INTO v_owner FROM public.household_managers hm
     WHERE hm.household_id = p_household_id AND hm.role = 'primary_manager';
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND:household';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
        RAISE EXCEPTION 'NOT_FOUND:plan';
    END IF;

    INSERT INTO public.subscriptions
        (plan_id, owner_user_id, status, helper_seats, manager_seats, home_seats, amount_centavos,
         current_period_start, current_period_end, note)
    VALUES (p_plan_id, v_owner, 'active', p_helper_seats, p_manager_seats, 1, 0,
            now(), p_period_end, p_note)
    RETURNING * INTO v_sub;

    INSERT INTO public.subscription_homes (subscription_id, household_id)
    VALUES (v_sub.id, p_household_id);

    INSERT INTO public.platform_invoices
        (invoice_number, subscription_id, external_id, status, amount_centavos, period_start,
         period_end, paid_at, paid_centavos, paid_channel, raw_callback)
    VALUES (public.next_platform_invoice_number(), v_sub.id, 'sub_' || v_sub.id || '_1', 'paid', 0,
            now(), p_period_end, now(), 0, 'comp',
            jsonb_build_object('comp', true, 'note', p_note, 'by', auth.uid()))
    RETURNING * INTO v_invoice;

    RETURN jsonb_build_object('subscription_id', v_sub.id, 'invoice_id', v_invoice.id);
END;
$$;

-- What a household is entitled to (see the header), for its managers and
-- platform admins.
CREATE OR REPLACE FUNCTION public.household_entitlements(p_household_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.billing_manages_household(p_household_id) OR public.is_platform_admin()) THEN
        RAISE EXCEPTION 'NOT_FOUND:household';
    END IF;
    RETURN public.billing_entitlements(p_household_id);
END;
$$;

-- Every household for the "Linara admin" area: managers, helpers that aren't
-- INACTIVE, entitlements and the latest pending invoice, ordered by name.
CREATE OR REPLACE FUNCTION public.platform_households_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN:billing';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'household_id', h.id,
                   'name', h.name,
                   'created_at', h.created_at,
                   'managers', (SELECT count(*) FROM public.household_managers hm
                                 WHERE hm.household_id = h.id),
                   'helpers', (SELECT count(*) FROM public.helper_profiles hp
                                WHERE hp.household_id = h.id AND hp.status <> 'INACTIVE'),
                   'entitlements', public.billing_entitlements(h.id),
                   'pending_invoice', (
                       SELECT jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number,
                                                 'amount_centavos', i.amount_centavos,
                                                 'created_at', i.created_at)
                         FROM public.platform_invoices i
                         JOIN public.subscription_homes sh ON sh.subscription_id = i.subscription_id
                        WHERE sh.household_id = h.id AND i.status = 'pending'
                        ORDER BY i.created_at DESC, i.invoice_number DESC
                        LIMIT 1))
                   ORDER BY lower(h.name), h.id)
          FROM public.households h), '[]'::JSONB);
END;
$$;

-- --------------------------------------------------------------------------
-- 5. Who can execute what.
-- --------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
    public.subscriptions_touch(),
    public.billing_period_end(TIMESTAMPTZ, TEXT),
    public.billing_peso(BIGINT),
    public.next_platform_invoice_number(),
    public.billing_new_invoice(UUID, TIMESTAMPTZ),
    public.billing_settle_invoice(UUID, TEXT, BIGINT, TIMESTAMPTZ, TEXT, JSONB, TEXT),
    public.billing_entitlements(UUID)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.record_platform_invoice_result(TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.record_platform_invoice_result(TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, JSONB)
    TO service_role;

REVOKE ALL ON FUNCTION
    public.billing_manages_household(UUID),
    public.billing_can_read_subscription(UUID),
    public.quote_subscription(UUID, INT, INT, UUID[]),
    public.start_subscription(UUID, INT, INT, UUID[]),
    public.attach_xendit_invoice(UUID, TEXT, TEXT, TIMESTAMPTZ),
    public.renew_subscription(UUID),
    public.cancel_subscription(UUID),
    public.mark_platform_invoice_paid_manually(UUID, TEXT, TEXT),
    public.grant_subscription(UUID, UUID, INT, INT, TIMESTAMPTZ, TEXT),
    public.household_entitlements(UUID),
    public.platform_households_overview()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
    public.billing_manages_household(UUID),
    public.billing_can_read_subscription(UUID),
    public.quote_subscription(UUID, INT, INT, UUID[]),
    public.start_subscription(UUID, INT, INT, UUID[]),
    public.attach_xendit_invoice(UUID, TEXT, TEXT, TIMESTAMPTZ),
    public.renew_subscription(UUID),
    public.cancel_subscription(UUID),
    public.mark_platform_invoice_paid_manually(UUID, TEXT, TEXT),
    public.grant_subscription(UUID, UUID, INT, INT, TIMESTAMPTZ, TEXT),
    public.household_entitlements(UUID),
    public.platform_households_overview()
    TO authenticated;
