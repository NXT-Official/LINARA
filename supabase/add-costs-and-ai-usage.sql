-- Costs, AI usage and platform analytics (sell-Linara plan, Task 5, 2026-10-19).
--
-- public.cost_entries is the admin's monthly ledger of what running Linara
-- costs (hosting, AI bills, payment fees, support). public.model_prices holds
-- the per-model AI price list the admin keeps current. public.ai_usage is one
-- row per priced AI call, written only by the AI edge functions (service_role)
-- through record_ai_usage. platform_analytics adds paid invoices, cost entries
-- and AI spend into revenue, cost of goods and profit per user for a date range.
-- Money is integer centavos (PHP, tax-inclusive). Only platform admins can read
-- or write any of it; the AI functions write through the service role.
--
-- Apply by hand in the SQL editor. AFTER add-platform-admins.sql and
-- add-subscriptions.sql (needs is_platform_admin(), platform_invoices,
-- subscriptions, subscription_homes, household_managers). Safe to run twice.
-- Tested in PGlite: supabase/tests/costs-and-ai-usage.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cost_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
    category TEXT NOT NULL CHECK (category IN ('infra', 'ai', 'payments', 'support', 'other')),
    label TEXT NOT NULL,
    amount_centavos BIGINT NOT NULL CHECK (amount_centavos >= 0),
    note TEXT NULL,
    created_by UUID NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_entries_month_idx ON public.cost_entries (month);

CREATE TABLE IF NOT EXISTS public.model_prices (
    model TEXT PRIMARY KEY,
    input_centavos_per_1m BIGINT NOT NULL DEFAULT 0,
    output_centavos_per_1m BIGINT NOT NULL DEFAULT 0,
    audio_centavos_per_minute BIGINT NOT NULL DEFAULT 0,
    note TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.model_prices
    (model, input_centavos_per_1m, output_centavos_per_1m, audio_centavos_per_minute, note)
VALUES
    ('gpt-4o', 14000, 56000, 0, 'USD list ×56 ₱/$ — set yours'),
    ('gpt-4o-mini', 840, 3360, 0, 'USD list ×56 ₱/$ — set yours'),
    ('whisper-1', 0, 0, 34, 'USD list ×56 ₱/$ — set yours')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.model_prices_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS model_prices_touch ON public.model_prices;
CREATE TRIGGER model_prices_touch
    BEFORE UPDATE ON public.model_prices
    FOR EACH ROW EXECUTE FUNCTION public.model_prices_touch();

CREATE TABLE IF NOT EXISTS public.ai_usage (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID NULL,
    household_id UUID NULL,
    fn TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    audio_seconds NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost_centavos BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON public.ai_usage (at);
CREATE INDEX IF NOT EXISTS ai_usage_household_idx ON public.ai_usage (household_id);

-- --------------------------------------------------------------------------
-- 2. Who can read and write
-- --------------------------------------------------------------------------

ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cost_entries, public.model_prices, public.ai_usage
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.ai_usage_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_entries, public.model_prices TO authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;

-- Supabase's service_role has these already (and bypasses RLS); granted here
-- too so a database without Supabase's defaults (the PGlite tests) matches.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.model_prices TO service_role;
GRANT SELECT, INSERT ON public.ai_usage TO service_role;
GRANT USAGE ON SEQUENCE public.ai_usage_id_seq TO service_role;

DROP POLICY IF EXISTS cost_entries_platform_admin_all ON public.cost_entries;
CREATE POLICY cost_entries_platform_admin_all ON public.cost_entries
    FOR ALL TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS model_prices_platform_admin_all ON public.model_prices;
CREATE POLICY model_prices_platform_admin_all ON public.model_prices
    FOR ALL TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS ai_usage_platform_admin_read ON public.ai_usage;
CREATE POLICY ai_usage_platform_admin_read ON public.ai_usage
    FOR SELECT TO authenticated
    USING (public.is_platform_admin());

-- --------------------------------------------------------------------------
-- 3. Pricing and recording an AI call
-- --------------------------------------------------------------------------

-- The cost in centavos of one call at the price list; an unknown model is free.
CREATE OR REPLACE FUNCTION public.price_ai_call(
    p_model TEXT,
    p_input INT,
    p_output INT,
    p_audio_seconds NUMERIC
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT round(
                    COALESCE(p_input, 0)::numeric * mp.input_centavos_per_1m / 1000000
                  + COALESCE(p_output, 0)::numeric * mp.output_centavos_per_1m / 1000000
                  + COALESCE(p_audio_seconds, 0) / 60 * mp.audio_centavos_per_minute
                )::bigint
           FROM public.model_prices mp
          WHERE mp.model = p_model),
        0);
$$;

-- Called by the AI edge functions with the service role after each model call.
-- Returns the cost it stored. A NULL household is taken from the user's profile.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
    p_user_id UUID,
    p_household_id UUID,
    p_fn TEXT,
    p_model TEXT,
    p_input_tokens INT,
    p_output_tokens INT,
    p_audio_seconds NUMERIC
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := p_household_id;
    v_cost BIGINT;
BEGIN
    IF v_household IS NULL AND p_user_id IS NOT NULL THEN
        SELECT up.household_id INTO v_household
          FROM public.user_profiles up
         WHERE up.id = p_user_id;
    END IF;

    v_cost := public.price_ai_call(
        p_model, COALESCE(p_input_tokens, 0), COALESCE(p_output_tokens, 0),
        COALESCE(p_audio_seconds, 0));

    INSERT INTO public.ai_usage
        (user_id, household_id, fn, model, input_tokens, output_tokens, audio_seconds, cost_centavos)
    VALUES
        (p_user_id, v_household, p_fn, p_model, COALESCE(p_input_tokens, 0),
         COALESCE(p_output_tokens, 0), COALESCE(p_audio_seconds, 0), v_cost);

    RETURN v_cost;
END;
$$;

-- --------------------------------------------------------------------------
-- 4. Analytics
-- --------------------------------------------------------------------------

-- Revenue, cost of goods and profit for p_from..p_to inclusive (Manila days).
-- Revenue is paid invoices by paid_at; cost entries count when their month's
-- first day is in range; AI spend is by call time. Paying households are those
-- covered by a paid plan at any point in the range (a ₱0 comp is not paying);
-- users are the distinct managers of those households.
CREATE OR REPLACE FUNCTION public.platform_analytics(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ := (p_from::timestamp AT TIME ZONE 'Asia/Manila');
    v_end TIMESTAMPTZ := ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila');
    v_revenue BIGINT;
    v_costs BIGINT;
    v_ai_cost BIGINT;
    v_ai_calls BIGINT;
    v_cogs BIGINT;
    v_profit BIGINT;
    v_homes BIGINT;
    v_users BIGINT;
    v_series JSONB;
    v_by_fn JSONB;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN:platform admins only';
    END IF;

    SELECT COALESCE(sum(pi.paid_centavos), 0) INTO v_revenue
      FROM public.platform_invoices pi
     WHERE pi.status = 'paid' AND pi.paid_at >= v_start AND pi.paid_at < v_end;

    SELECT COALESCE(sum(ce.amount_centavos), 0) INTO v_costs
      FROM public.cost_entries ce
     WHERE ce.month >= p_from AND ce.month <= p_to;

    SELECT COALESCE(sum(au.cost_centavos), 0), count(*) INTO v_ai_cost, v_ai_calls
      FROM public.ai_usage au
     WHERE au.at >= v_start AND au.at < v_end;

    v_cogs := v_costs + v_ai_cost;
    v_profit := v_revenue - v_cogs;

    WITH homes AS (
        SELECT DISTINCT sh.household_id
          FROM public.subscription_homes sh
          JOIN public.subscriptions s ON s.id = sh.subscription_id
         WHERE s.status IN ('active', 'past_due', 'canceled')
           AND s.amount_centavos > 0
           AND s.current_period_start <= v_end
           AND COALESCE(s.current_period_end, 'infinity'::timestamptz) >= v_start
    )
    SELECT (SELECT count(*) FROM homes),
           (SELECT count(DISTINCT hm.user_id)
              FROM public.household_managers hm
              JOIN homes h ON h.household_id = hm.household_id)
      INTO v_homes, v_users;

    WITH rev AS (
        SELECT date_trunc('month', pi.paid_at AT TIME ZONE 'Asia/Manila')::date AS m,
               sum(pi.paid_centavos) AS revenue
          FROM public.platform_invoices pi
         WHERE pi.status = 'paid' AND pi.paid_at >= v_start AND pi.paid_at < v_end
         GROUP BY 1
    ), cst AS (
        SELECT ce.month AS m, sum(ce.amount_centavos) AS cost
          FROM public.cost_entries ce
         WHERE ce.month >= p_from AND ce.month <= p_to
         GROUP BY 1
    ), ai AS (
        SELECT date_trunc('month', au.at AT TIME ZONE 'Asia/Manila')::date AS m,
               sum(au.cost_centavos) AS cost, count(*) AS calls
          FROM public.ai_usage au
         WHERE au.at >= v_start AND au.at < v_end
         GROUP BY 1
    ), months AS (
        SELECT m FROM rev UNION SELECT m FROM cst UNION SELECT m FROM ai
    ), rows AS (
        SELECT mo.m,
               COALESCE(rev.revenue, 0) AS revenue,
               COALESCE(cst.cost, 0) + COALESCE(ai.cost, 0) AS cogs,
               COALESCE(ai.calls, 0) AS calls
          FROM months mo
          LEFT JOIN rev ON rev.m = mo.m
          LEFT JOIN cst ON cst.m = mo.m
          LEFT JOIN ai ON ai.m = mo.m
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'month', to_char(r.m, 'YYYY-MM'),
               'revenue_centavos', r.revenue,
               'cogs_centavos', r.cogs,
               'profit_centavos', r.revenue - r.cogs,
               'ai_calls', r.calls) ORDER BY r.m), '[]'::jsonb)
      INTO v_series
      FROM rows r;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'fn', t.fn,
               'calls', t.calls,
               'cost_centavos', t.cost,
               'input_tokens', t.input_tokens,
               'output_tokens', t.output_tokens) ORDER BY t.cost DESC, t.fn), '[]'::jsonb)
      INTO v_by_fn
      FROM (
          SELECT au.fn, count(*) AS calls, sum(au.cost_centavos) AS cost,
                 sum(au.input_tokens) AS input_tokens, sum(au.output_tokens) AS output_tokens
            FROM public.ai_usage au
           WHERE au.at >= v_start AND au.at < v_end
           GROUP BY au.fn
      ) t;

    RETURN jsonb_build_object(
        'revenue_centavos', v_revenue,
        'cogs_centavos', v_cogs,
        'cost_entries_centavos', v_costs,
        'ai_cost_centavos', v_ai_cost,
        'ai_calls', v_ai_calls,
        'cost_per_call_centavos',
            CASE WHEN v_ai_calls = 0 THEN NULL ELSE round(v_ai_cost::numeric / v_ai_calls) END,
        'profit_centavos', v_profit,
        'paying_households', v_homes,
        'users', v_users,
        'profit_per_user_centavos',
            CASE WHEN v_users = 0 THEN NULL ELSE round(v_profit::numeric / v_users) END,
        'series', v_series,
        'ai_by_fn', v_by_fn);
END;
$$;

REVOKE ALL ON FUNCTION public.price_ai_call(TEXT, INT, INT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_ai_call(TEXT, INT, INT, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION
    public.record_ai_usage(UUID, UUID, TEXT, TEXT, INT, INT, NUMERIC)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.record_ai_usage(UUID, UUID, TEXT, TEXT, INT, INT, NUMERIC)
    TO service_role;
REVOKE ALL ON FUNCTION public.platform_analytics(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_analytics(DATE, DATE) TO authenticated;
