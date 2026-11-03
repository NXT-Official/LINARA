-- A history of every subscription change, for the console's Revenue screen
-- (LINARA_ADMIN D49). Follows add-billing.sql. Subscriptions only hold their
-- current state, so MRR movements (new, expansion, contraction) and
-- conversion are counted from this log, from the day it's applied; earlier
-- history isn't rebuilt.
--
-- MRR is a subscription's price a month in centavos: a yearly price (with its
-- add-ons) over 12, rounded; Free and one-time count 0. A subscription counts
-- 0 once nothing is running on it: a cancelled one past its renewal date, or
-- one more than the 7-day grace past it (restricted). So buying again after
-- that is "new", not a change of plan.
--
-- Written by a trigger on billing_subscriptions, whoever changes it (a paid
-- invoice, the manager, the console). RLS on with no policies and no grants:
-- only the server key and SECURITY DEFINER functions read it.
--
-- Apply by hand in the Supabase SQL editor, after add-billing.sql (and the
-- idempotency and plan-changes files). Safe to run twice. Tested in PGlite:
-- supabase/tests/billing-history.test.mjs.

CREATE TABLE IF NOT EXISTS public.billing_subscription_events (
    id BIGSERIAL PRIMARY KEY,
    manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- started, plan_changed (plan, cycle or add-ons), renewed (a new period on
    -- the same plan), cancel_set, cancel_undone.
    kind TEXT NOT NULL
        CHECK (kind IN ('started', 'plan_changed', 'renewed', 'cancel_set', 'cancel_undone')),
    from_version UUID,
    to_version UUID NOT NULL,
    from_cycle TEXT,
    to_cycle TEXT NOT NULL,
    mrr_before BIGINT NOT NULL CHECK (mrr_before >= 0),
    mrr_after BIGINT NOT NULL CHECK (mrr_after >= 0),
    -- The renewal date before and after: a renewal whose old date had passed
    -- is a past-due payment recovered.
    from_period_end TIMESTAMPTZ,
    to_period_end TIMESTAMPTZ
);
ALTER TABLE public.billing_subscription_events ADD COLUMN IF NOT EXISTS from_period_end TIMESTAMPTZ;
ALTER TABLE public.billing_subscription_events ADD COLUMN IF NOT EXISTS to_period_end TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS billing_subscription_events_at
    ON public.billing_subscription_events (at);
CREATE INDEX IF NOT EXISTS billing_subscription_events_manager
    ON public.billing_subscription_events (manager_id, at);
ALTER TABLE public.billing_subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_subscription_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.billing_subscription_events_id_seq FROM PUBLIC, anon, authenticated;

-- A version, cycle and add-ons' price a month, in centavos; 0 for Free and one-time.
CREATE OR REPLACE FUNCTION public.billing_mrr(p_version UUID, p_cycle TEXT, p_addons JSONB)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_cycle NOT IN ('monthly', 'annual') THEN
        RETURN 0;
    END IF;
    RETURN round(public.billing_price(p_version, p_cycle, COALESCE(p_addons, '[]'::jsonb))
                 / CASE p_cycle WHEN 'annual' THEN 12.0 ELSE 1 END);
EXCEPTION WHEN OTHERS THEN
    -- A version or add-on that can't be priced any more counts nothing.
    RETURN 0;
END;
$$;

-- What a subscription row brings in a month right now: 0 once nothing runs on it.
CREATE OR REPLACE FUNCTION public.billing_row_mrr(
    p_version UUID, p_cycle TEXT, p_addons JSONB, p_cancel BOOLEAN, p_end TIMESTAMPTZ)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
        WHEN p_end IS NULL THEN 0
        WHEN p_cancel AND p_end <= now() THEN 0
        WHEN p_end + interval '7 days' <= now() THEN 0
        ELSE public.billing_mrr(p_version, p_cycle, p_addons) END
$$;

CREATE OR REPLACE FUNCTION public.billing_log_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_before BIGINT := 0;
    v_after BIGINT := public.billing_row_mrr(NEW.plan_version_id, NEW.cycle, NEW.addons,
                                             NEW.cancel_at_period_end, NEW.current_period_end);
    v_kind TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_kind := 'started';
    ELSE
        v_before := public.billing_row_mrr(OLD.plan_version_id, OLD.cycle, OLD.addons,
                                           OLD.cancel_at_period_end, OLD.current_period_end);
        IF NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
           OR NEW.cycle IS DISTINCT FROM OLD.cycle
           OR NEW.addons IS DISTINCT FROM OLD.addons THEN
            v_kind := CASE WHEN v_before = 0 AND v_after > 0 THEN 'started' ELSE 'plan_changed' END;
        ELSIF NEW.current_period_end > OLD.current_period_end
              AND NEW.current_period_start IS DISTINCT FROM OLD.current_period_start THEN
            -- A new period, later than the last (moving dates back is the test tools).
            v_kind := CASE WHEN v_before = 0 AND v_after > 0 THEN 'started' ELSE 'renewed' END;
        ELSIF NEW.cancel_at_period_end AND NOT OLD.cancel_at_period_end THEN
            v_kind := 'cancel_set';
        ELSIF OLD.cancel_at_period_end AND NOT NEW.cancel_at_period_end THEN
            v_kind := 'cancel_undone';
        ELSE
            -- Only the dates moved (the console's test tools) or nothing that counts.
            RETURN NEW;
        END IF;
    END IF;
    INSERT INTO public.billing_subscription_events
        (manager_id, kind, from_version, to_version, from_cycle, to_cycle, mrr_before, mrr_after,
         from_period_end, to_period_end)
    VALUES (NEW.manager_id, v_kind,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_version_id END, NEW.plan_version_id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.cycle END, NEW.cycle, v_before, v_after,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.current_period_end END, NEW.current_period_end);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_log_subscription ON public.billing_subscriptions;
CREATE TRIGGER billing_log_subscription AFTER INSERT OR UPDATE ON public.billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.billing_log_subscription();

REVOKE ALL ON FUNCTION public.billing_mrr(uuid, text, jsonb),
    public.billing_row_mrr(uuid, text, jsonb, boolean, timestamptz),
    public.billing_log_subscription()
  FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.billing_mrr(uuid, text, jsonb),
            public.billing_row_mrr(uuid, text, jsonb, boolean, timestamptz) TO service_role;
        GRANT SELECT ON public.billing_subscription_events TO service_role;
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- AI calls a day, for the Revenue screen's AI cost (D49). ai_calls keeps only
-- 48 hours (add-ai-call-limits.sql), so each call also adds one to its day
-- and function here, which is never purged. Counts start when this is applied.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_call_days (
    day DATE NOT NULL,
    fn TEXT NOT NULL,
    calls INT NOT NULL DEFAULT 0 CHECK (calls >= 0),
    PRIMARY KEY (day, fn)
);
ALTER TABLE public.ai_call_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_call_days FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_call_days_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.ai_call_days (day, fn, calls)
    VALUES ((NEW.at AT TIME ZONE 'Asia/Manila')::date, NEW.fn, 1)
    ON CONFLICT (day, fn) DO UPDATE SET calls = public.ai_call_days.calls + 1;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_call_days_count() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF to_regclass('public.ai_calls') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS ai_call_days_count ON public.ai_calls;
        CREATE TRIGGER ai_call_days_count AFTER INSERT ON public.ai_calls
            FOR EACH ROW EXECUTE FUNCTION public.ai_call_days_count();
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT ON public.ai_call_days TO service_role;
    END IF;
END;
$$;
