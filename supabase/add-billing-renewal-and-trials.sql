-- A late payment keeps the renewal date, and trials are granted (follows
-- add-billing-pause.sql). Decided 2026-10-30, from the subscription audit:
--
--   * Paying during grace (past due) or after it (restricted) started a new
--     period on the day it was paid, so the 7 days of grace were free every
--     cycle. Now the period runs from the old renewal date.
--   * Plans carried trial_days (the console sets them; 14 on Normal and
--     Premium) and the app said "Free trial until ...", but nothing ever made
--     a trial. Now a manager can start one.
--
-- RENEWAL DATE
--   A plan paid while it's past due or restricted starts at the old renewal
--   date. Unpaid for longer than a whole cycle, it moves on by whole cycles
--   from that date (the same day of the month), so the new period always
--   covers today: the cycles spent restricted were on Free
--   (add-billing-pause.sql) and aren't charged. A plan paid during a trial
--   starts when the trial ends, so no trial day is lost. Anything else (from
--   Free, after a cancelled plan ran out) starts when it's paid, as before.
--
-- TRIALS
--   billing_start_trial(plan): the plan's trial_days, at no charge, for a
--   primary manager on Free who has never had a trial and never paid.
--   Once per account (billing_trials keeps it when the subscription changes).
--   During it the household has the plan's features and limits; paying for
--   any plan keeps the trial's days. A trial that ends unpaid is Free at
--   once: there was no payment to be late on, so no grace. Moving to Free
--   ends it early (billing_change_to_free, as before).
--
-- Apply by hand in the Supabase SQL editor, after add-billing-pause.sql.
-- Safe to run twice. Tested in PGlite: supabase/tests/billing-renewal-and-trials.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Trials, once per account.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_trials (
    manager_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_version_id UUID NOT NULL REFERENCES public.billing_plan_versions(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.billing_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_trials FROM anon, authenticated;

-- The subscription json, as in add-billing-plan-changes.sql, with a trial
-- that ran out being Free (like a cancelled plan that ran out).
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
       OR ((s.cancel_at_period_end OR s.status = 'trialing')
           AND s.current_period_end IS NOT NULL AND s.current_period_end <= now()) THEN
        SELECT * INTO v FROM public.billing_plan_versions
         WHERE id = public.billing_current_version('free');
        RETURN jsonb_build_object(
            'planId', COALESCE(v.plan_id, 'free'), 'planVersion', COALESCE(v.version, 1),
            'cycle', 'monthly', 'addons', '[]'::jsonb, 'status', 'active',
            'cancelAtPeriodEnd', false, 'periodStart', NULL, 'periodEnd', NULL);
    END IF;
    v_status := CASE
        WHEN s.current_period_end IS NULL OR now() < s.current_period_end THEN s.status
        WHEN now() < s.current_period_end + interval '7 days' THEN 'past_due'
        ELSE 'restricted' END;
    RETURN jsonb_build_object(
        'planId', v.plan_id, 'planVersion', v.version, 'cycle', s.cycle, 'addons', s.addons,
        'status', v_status, 'cancelAtPeriodEnd', s.cancel_at_period_end,
        'periodStart', to_jsonb(s.current_period_start),
        'periodEnd', to_jsonb(s.current_period_end));
END;
$$;

-- Whether the manager can start a trial: never had one, never paid, and on
-- Free now (not in a trial, a paid period, or owing).
CREATE OR REPLACE FUNCTION public.billing_trial_available(p_manager UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT EXISTS (SELECT 1 FROM public.billing_trials t WHERE t.manager_id = p_manager)
       AND NOT EXISTS (SELECT 1 FROM public.billing_payments bp
                        WHERE bp.manager_id = p_manager AND bp.status IN ('paid', 'review'))
       AND public.billing_subscription_json(p_manager) ->> 'planId' = 'free'
$$;

-- Starts the plan's trial for the signed-in primary manager.
CREATE OR REPLACE FUNCTION public.billing_start_trial(p_plan_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_version UUID;
    v public.billing_plan_versions%ROWTYPE;
    v_end TIMESTAMPTZ;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    IF NOT EXISTS (SELECT 1 FROM public.billing_plans p
                    WHERE p.id = p_plan_id AND p.status = 'published') THEN
        RAISE EXCEPTION 'That plan isn''t offered.';
    END IF;
    v_version := public.billing_current_version(p_plan_id);
    SELECT * INTO v FROM public.billing_plan_versions WHERE id = v_version;
    IF v.id IS NULL OR v.trial_days = 0
       OR COALESCE(NULLIF(v.price_monthly, 0), NULLIF(v.price_annual, 0)) IS NULL THEN
        RAISE EXCEPTION 'That plan doesn''t have a free trial.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.billing_trials t WHERE t.manager_id = v_uid) THEN
        RAISE EXCEPTION 'You''ve already had a free trial.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.billing_payments bp
                WHERE bp.manager_id = v_uid AND bp.status IN ('paid', 'review')) THEN
        RAISE EXCEPTION 'Free trials are for a first plan.';
    END IF;
    IF public.billing_subscription_json(v_uid) ->> 'planId' <> 'free' THEN
        RAISE EXCEPTION 'A free trial starts from Free.';
    END IF;
    v_end := now() + make_interval(days => v.trial_days);
    INSERT INTO public.billing_subscriptions AS s
        (manager_id, plan_version_id, cycle, addons, status, current_period_start,
         current_period_end, cancel_at_period_end, updated_at)
    VALUES (v_uid, v_version, CASE WHEN COALESCE(v.price_monthly, 0) > 0 THEN 'monthly' ELSE 'annual' END,
            '[]'::jsonb, 'trialing', now(), v_end, false, now())
    ON CONFLICT (manager_id) DO UPDATE SET
        plan_version_id = EXCLUDED.plan_version_id, cycle = EXCLUDED.cycle, addons = '[]'::jsonb,
        status = 'trialing', current_period_start = now(), current_period_end = v_end,
        cancel_at_period_end = false, updated_at = now();
    INSERT INTO public.billing_trials (manager_id, plan_version_id, started_at, ends_at)
    VALUES (v_uid, v_version, now(), v_end);
    DELETE FROM public.billing_active_selection WHERE manager_id = v_uid;
    RETURN public.billing_subscription_json(v_uid);
END;
$$;

-- --------------------------------------------------------------------------
-- 2. Where a paid plan's period starts.
-- --------------------------------------------------------------------------

-- The period a plan payment pays for, as {start, end}: from the old renewal
-- date when it's late, from the trial's end during a trial, else from now.
-- p_months null (one-time): from now, no end.
CREATE OR REPLACE FUNCTION public.billing_next_period(p_manager UUID, p_months INT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB := public.billing_subscription_json(p_manager);
    v_end TIMESTAMPTZ := (v_sub ->> 'periodEnd')::timestamptz;
    v_start TIMESTAMPTZ := now();
    v_k INT := 0;
BEGIN
    IF p_months IS NULL THEN
        RETURN jsonb_build_object('start', now(), 'end', NULL);
    END IF;
    IF v_sub ->> 'status' = 'trialing' AND v_end > now() THEN
        RETURN jsonb_build_object('start', now(),
                                  'end', v_end + make_interval(months => p_months));
    END IF;
    IF v_sub ->> 'status' IN ('past_due', 'restricted') AND v_end IS NOT NULL THEN
        -- Whole cycles from the old renewal date, until the period covers today.
        WHILE v_end + make_interval(months => p_months * (v_k + 1)) <= now() LOOP
            v_k := v_k + 1;
        END LOOP;
        v_start := v_end + make_interval(months => p_months * v_k);
        RETURN jsonb_build_object('start', v_start,
            'end', v_end + make_interval(months => p_months * (v_k + 1)));
    END IF;
    RETURN jsonb_build_object('start', now(), 'end', now() + make_interval(months => p_months));
END;
$$;

-- The apply (add-billing.sql's, renamed by add-billing-idempotency.sql), with
-- a plan's period from billing_next_period. Otherwise unchanged.
CREATE OR REPLACE FUNCTION public.billing_apply_invoice_core(p_invoice JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id TEXT := p_invoice ->> 'id';
    v_status TEXT := upper(COALESCE(p_invoice ->> 'status', ''));
    v_key TEXT;
    p public.billing_payments%ROWTYPE;
    v_sub JSONB;
    v_paid BIGINT;
    v_outcome TEXT;
    v_period JSONB;
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
                v_period := public.billing_next_period(p.manager_id,
                    CASE p.cycle WHEN 'monthly' THEN 1 WHEN 'annual' THEN 12 END);
                INSERT INTO public.billing_subscriptions AS s
                    (manager_id, plan_version_id, cycle, addons, status,
                     current_period_start, current_period_end, cancel_at_period_end, updated_at)
                VALUES (p.manager_id, p.plan_version_id, p.cycle, p.addons, 'active',
                        (v_period ->> 'start')::timestamptz, (v_period ->> 'end')::timestamptz,
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

-- What moving to a plan costs, as in add-billing-plan-changes.sql, except
-- that during a trial the trial's own plan can be paid for (that's how a
-- trial is kept).
CREATE OR REPLACE FUNCTION public.billing_quote(
    p_manager UUID, p_plan_id TEXT, p_cycle TEXT, p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB := public.billing_subscription_json(p_manager);
    v_lines JSONB := public.billing_clean_addons(p_addons);
    v_version UUID;
    v_cur UUID;
    v_new BIGINT;
    v_old BIGINT;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_left NUMERIC;
    v_amount BIGINT;
    v_keeps BOOLEAN;
    v_lower TEXT;
BEGIN
    IF p_cycle IS NULL OR p_cycle NOT IN ('monthly', 'annual', 'one_time') THEN
        RAISE EXCEPTION 'Choose monthly or yearly.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.billing_plans p
                    WHERE p.id = p_plan_id AND p.status = 'published') THEN
        RAISE EXCEPTION 'That plan isn''t offered.';
    END IF;
    v_version := public.billing_current_version(p_plan_id);
    -- Paying what's owed, or more time on the plan they have, keeps its version.
    IF p_plan_id = v_sub ->> 'planId' THEN
        v_version := public.billing_sub_version(v_sub);
    END IF;

    IF NOT public.billing_period_running(v_sub) THEN
        v_new := public.billing_price(v_version, p_cycle, v_lines);
        IF v_new = 0 THEN
            RAISE EXCEPTION 'Nothing to pay on this plan.';
        END IF;
        IF p_plan_id = v_sub ->> 'planId' AND p_cycle = v_sub ->> 'cycle'
           AND v_lines = v_sub -> 'addons'
           AND v_sub ->> 'status' NOT IN ('past_due', 'restricted', 'trialing') THEN
            RAISE EXCEPTION 'That''s the plan you already have.';
        END IF;
        RETURN jsonb_build_object('version', v_version, 'cycle', p_cycle, 'addons', v_lines,
                                  'amount', v_new, 'pricedAgainst', NULL, 'keepsPeriod', false);
    END IF;

    v_cur := public.billing_sub_version(v_sub);
    v_end := (v_sub ->> 'periodEnd')::timestamptz;
    v_start := (v_sub ->> 'periodStart')::timestamptz;
    v_lower := format('To move to a lower plan, cancel this one. You keep it until %s, then choose again.',
                      public.billing_date_text(v_end));

    IF p_plan_id = v_sub ->> 'planId' AND p_cycle = v_sub ->> 'cycle' THEN
        IF v_lines = v_sub -> 'addons' THEN
            RAISE EXCEPTION 'That''s the plan you already have.';
        END IF;
        RAISE EXCEPTION 'To change add-ons, use Add-ons on Your plan.';
    END IF;

    v_new := public.billing_price(v_version, p_cycle, v_lines);
    v_old := public.billing_price(v_cur, v_sub ->> 'cycle', v_sub -> 'addons');
    v_left := CASE WHEN v_start IS NULL OR v_end <= v_start THEN 1
                   ELSE LEAST(1, GREATEST(0, extract(epoch FROM v_end - now())
                                             / extract(epoch FROM v_end - v_start))) END;

    IF p_cycle = v_sub ->> 'cycle'
       AND public.billing_plan_rank(v_version) > public.billing_plan_rank(v_cur) THEN
        IF v_new <= v_old THEN
            RAISE EXCEPTION 'That costs no more than what you pay now. Remove the add-ons you won''t need first, then upgrade.';
        END IF;
        v_amount := ceil((v_new - v_old) * v_left);
        v_keeps := true;
    ELSIF v_sub ->> 'cycle' = 'monthly' AND p_cycle = 'annual'
          AND public.billing_plan_rank(v_version) >= public.billing_plan_rank(v_cur) THEN
        v_amount := v_new - floor(v_old * v_left);
        v_keeps := false;
    ELSE
        RAISE EXCEPTION '%', v_lower;
    END IF;

    RETURN jsonb_build_object('version', v_version, 'cycle', p_cycle, 'addons', v_lines,
                              'amount', GREATEST(v_amount, public.billing_min_charge()),
                              'pricedAgainst', to_jsonb(v_end), 'keepsPeriod', v_keeps);
END;
$$;

-- --------------------------------------------------------------------------
-- 3. What the manager reads: my_billing (add-billing.sql) plus trialAvailable.
-- --------------------------------------------------------------------------
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
        'catalog', public.billing_catalog(),
        'trialAvailable', public.billing_trial_available(v_uid));
END;
$$;

-- --------------------------------------------------------------------------
-- 4. Grants.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_subscription_json(uuid)',
        'public.billing_trial_available(uuid)',
        'public.billing_next_period(uuid, integer)',
        'public.billing_apply_invoice_core(jsonb)',
        'public.billing_quote(uuid, text, text, jsonb)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_start_trial(text)',
        'public.my_billing()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
END;
$$;
