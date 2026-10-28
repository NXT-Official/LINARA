-- Plan changes go up, never down, while a paid period runs (follows
-- add-billing-idempotency.sql). Decided 2026-10-28.
--
-- WHILE A PAID PERIOD RUNS (active, renewal date in the future)
--   * Higher plan, same cycle: an upgrade. Pays the price gap for the time
--     that's left, and the renewal date stays:
--         amount = ceil((new price - current price) x time left / period length)
--     Prices are the plan with its add-ons, each cycle.
--   * Monthly to yearly, same or higher plan: an upgrade. Pays the yearly
--     price less what's unused of the current period, and the year starts
--     when it's paid:
--         amount = yearly price - floor(current price x time left / period length)
--   * Anything lower (a cheaper plan, yearly to monthly, Free): refused. The
--     manager cancels (billing_cancel_plan), keeps the plan to its renewal
--     date, is on Free after it, and can buy any plan from there.
--   * Same plan and cycle: refused; add-ons change through Add-ons.
--   * Never less than billing_min_charge(), Xendit's smallest card payment.
--   A plan is higher when its monthly price is (yearly price / 12 for a
--   yearly-only plan), so new or repriced plans rank themselves.
--
-- WHEN NO PAID PERIOD RUNS (Free, trial, past due, restricted): any plan at
-- its full price, the period starting when it's paid, as before.
--
-- CANCELLING
--   billing_cancel_plan sets the plan to end on its renewal date (nothing
--   changes until then); billing_resume_plan undoes it before that date. An
--   upgrade clears it: paying for more means staying. Moving to Free now
--   (billing_change_to_free) is refused while a paid period runs; past due or
--   restricted it still works, so nobody is held to a payment they don't want
--   to make.
--
-- APPLYING
--   A prorated payment remembers the renewal date it was priced against. If
--   the subscription's period isn't that one by the time it's paid (renewed,
--   ended, changed in the console), the payment is kept for review instead
--   of applied to a period it wasn't priced for.
--
-- Proration is a pricing rule: marketing may change it. The formulas live in
-- billing_quote below.
--
-- Apply by hand in the Supabase SQL editor, after add-billing-idempotency.sql.
-- Safe to run twice. Tested in PGlite: supabase/tests/billing-plan-changes.test.mjs.

-- The renewal date a prorated payment was priced against, and whether paying
-- it keeps that date (same-cycle upgrade) or starts a new period.
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS priced_against TIMESTAMPTZ;
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS keeps_period BOOLEAN NOT NULL DEFAULT false;

-- The smallest amount charged, in centavos: Xendit's card minimum (PHP 20).
CREATE OR REPLACE FUNCTION public.billing_min_charge()
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$ SELECT 2000::bigint $$;

-- How high a plan version ranks: its monthly price, or a twelfth of its yearly one.
CREATE OR REPLACE FUNCTION public.billing_plan_rank(p_version UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(pv.price_monthly::numeric, pv.price_annual / 12.0,
                    pv.price_one_time::numeric, 0)
      FROM public.billing_plan_versions pv WHERE pv.id = p_version
$$;

-- "Nov 28, 2026", in Manila time.
CREATE OR REPLACE FUNCTION public.billing_date_text(p_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT to_char(p_at AT TIME ZONE 'Asia/Manila', 'FMMon FMDD, YYYY')
$$;

-- The subscription json, now with the period's start (the web app prorates
-- an upgrade's price with it). Otherwise as in add-billing.sql.
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

-- Whether a paid period is running: active (not a trial), with a renewal
-- date still ahead.
CREATE OR REPLACE FUNCTION public.billing_period_running(p_sub JSONB)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT p_sub ->> 'status' = 'active' AND p_sub ->> 'periodEnd' IS NOT NULL
       AND (p_sub ->> 'periodEnd')::timestamptz > now()
$$;

-- What moving to a plan costs now, or why it can't be done. Returns
-- {version, cycle, addons, amount, pricedAgainst, keepsPeriod}: pricedAgainst
-- is the renewal date a prorated price was worked out from (null when it's
-- the full price).
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
           AND v_sub ->> 'status' NOT IN ('past_due', 'restricted') THEN
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
        -- A higher plan that costs no more than the plan and add-ons now:
        -- the add-ons it doesn't need come off first (free, takes effect now).
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

-- Starts a payment, or returns the one already open (as in
-- add-billing-idempotency.sql). Plans are now priced by billing_quote.
CREATE OR REPLACE FUNCTION public.billing_create_payment(
    p_manager UUID, p_kind TEXT, p_plan_id TEXT, p_cycle TEXT, p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB;
    v_lines JSONB := public.billing_clean_addons(p_addons);
    v_quote JSONB;
    v_version UUID;
    v_cycle TEXT;
    v_amount BIGINT;
    v_priced TIMESTAMPTZ;
    v_keeps BOOLEAN := false;
    v_key TEXT;
    v_open public.billing_payments%ROWTYPE;
    v_row public.billing_payments%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.household_managers hm
                    WHERE hm.user_id = p_manager AND hm.role = 'primary_manager') THEN
        RAISE EXCEPTION 'Only a household''s primary manager pays for its plan.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || p_manager::text));
    v_sub := public.billing_subscription_json(p_manager);

    IF p_kind = 'plan' THEN
        v_quote := public.billing_quote(p_manager, p_plan_id, p_cycle, v_lines);
        v_version := (v_quote ->> 'version')::uuid;
        v_cycle := v_quote ->> 'cycle';
        v_amount := (v_quote ->> 'amount')::bigint;
        v_priced := (v_quote ->> 'pricedAgainst')::timestamptz;
        v_keeps := (v_quote ->> 'keepsPeriod')::boolean;
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
    -- A prorated price moves every second, so its purchase is keyed by the
    -- period it was priced against instead: asking again returns the same page.
    v_key := public.billing_purchase_key(p_kind, v_version, v_cycle, v_lines,
        CASE WHEN v_priced IS NULL THEN v_amount ELSE extract(epoch FROM v_priced)::bigint END);

    -- Tidy what can't be paid any more: a page past its expiry, and a payment
    -- whose page never got made (billing-checkout stopped half way).
    UPDATE public.billing_payments
       SET status = 'expired', failure_reason = 'The payment page expired before it was paid.'
     WHERE manager_id = p_manager AND status = 'pending' AND expires_at <= now();
    UPDATE public.billing_payments
       SET status = 'failed', failure_reason = 'The payment page was never opened.'
     WHERE manager_id = p_manager AND status = 'pending' AND xendit_invoice_id IS NULL
       AND created_at < now() - public.billing_opening_grace();

    SELECT * INTO v_open FROM public.billing_payments
     WHERE manager_id = p_manager AND status = 'pending';
    IF v_open.id IS NOT NULL THEN
        IF v_open.xendit_invoice_id IS NULL THEN
            RAISE EXCEPTION 'A payment page is already being opened. Try again in a moment.';
        END IF;
        IF v_open.purchase_key = v_key THEN
            RETURN jsonb_build_object('id', v_open.id, 'amount', v_open.amount, 'kind', v_open.kind,
                                      'reuse', true, 'invoiceUrl', v_open.invoice_url);
        END IF;
        RETURN jsonb_build_object('supersede', jsonb_build_object(
            'id', v_open.id, 'invoiceId', v_open.xendit_invoice_id));
    END IF;

    INSERT INTO public.billing_payments
        (manager_id, kind, plan_version_id, cycle, addons, amount, purchase_key,
         priced_against, keeps_period)
    VALUES (p_manager, p_kind, v_version, v_cycle, v_lines, v_amount, v_key, v_priced, v_keeps)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('id', v_row.id, 'amount', v_row.amount, 'kind', v_row.kind,
        'description', (SELECT pv.name FROM public.billing_plan_versions pv WHERE pv.id = v_version)
            || CASE WHEN p_kind = 'addons' THEN ' add-ons' ELSE
               CASE v_cycle WHEN 'annual' THEN ', yearly' WHEN 'monthly' THEN ', monthly' ELSE '' END END
            || CASE WHEN v_keeps THEN ' (upgrade, rest of this period)' ELSE '' END);
END;
$$;

-- Applies a Xendit invoice, as read back from Xendit by the webhook. As in
-- add-billing-idempotency.sql (a replaced page is kept for review), and a
-- prorated upgrade is applied only to the period it was priced against:
-- keeping the renewal date for a same-cycle one, a new year (the core) for
-- monthly to yearly.
CREATE OR REPLACE FUNCTION public.billing_apply_invoice(p_invoice JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id TEXT := p_invoice ->> 'id';
    v_status TEXT := upper(COALESCE(p_invoice ->> 'status', ''));
    v_key TEXT;
    v_paid BIGINT;
    p public.billing_payments%ROWTYPE;
    s public.billing_subscriptions%ROWTYPE;
BEGIN
    IF v_id IS NULL OR v_status NOT IN ('PAID', 'SETTLED') THEN
        RETURN public.billing_apply_invoice_core(p_invoice);
    END IF;
    SELECT * INTO p FROM public.billing_payments WHERE xendit_invoice_id = v_id FOR UPDATE;
    IF p.id IS NULL THEN
        RETURN public.billing_apply_invoice_core(p_invoice);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || p.manager_id::text));
    v_key := 'invoice:' || v_id || ':PAID';
    IF p.status = 'cancelled'
       OR (p.status = 'expired' AND EXISTS (
            SELECT 1 FROM public.billing_payments n
             WHERE n.manager_id = p.manager_id AND n.id <> p.id AND n.status = 'paid'
               AND n.created_at > p.created_at)) THEN
        BEGIN
            INSERT INTO public.billing_events (event_key, payload, outcome)
            VALUES (v_key, p_invoice, 'review');
        EXCEPTION WHEN unique_violation THEN
            RETURN 'duplicate';
        END;
        UPDATE public.billing_payments
           SET status = 'review', paid_at = COALESCE((p_invoice ->> 'paid_at')::timestamptz, now()),
               payment_method = p_invoice ->> 'payment_method',
               payment_channel = p_invoice ->> 'payment_channel',
               failure_reason = 'Paid after a newer payment replaced it. Refund it in Xendit.'
         WHERE id = p.id;
        RETURN 'review';
    END IF;

    IF p.kind = 'plan' AND p.priced_against IS NOT NULL AND p.status IN ('pending', 'expired') THEN
        SELECT * INTO s FROM public.billing_subscriptions WHERE manager_id = p.manager_id FOR UPDATE;
        IF s.manager_id IS NULL OR s.current_period_end IS DISTINCT FROM p.priced_against
           OR NOT public.billing_period_running(public.billing_subscription_json(p.manager_id)) THEN
            BEGIN
                INSERT INTO public.billing_events (event_key, payload, outcome)
                VALUES (v_key, p_invoice, 'review');
            EXCEPTION WHEN unique_violation THEN
                RETURN 'duplicate';
            END;
            UPDATE public.billing_payments
               SET status = 'review', paid_at = COALESCE((p_invoice ->> 'paid_at')::timestamptz, now()),
                   payment_method = p_invoice ->> 'payment_method',
                   payment_channel = p_invoice ->> 'payment_channel',
                   failure_reason = 'The plan''s period changed before this upgrade was paid. Check it in the console.'
             WHERE id = p.id;
            RETURN 'review';
        END IF;
        IF p.keeps_period THEN
            BEGIN
                INSERT INTO public.billing_events (event_key, payload, outcome)
                VALUES (v_key, p_invoice, 'received');
            EXCEPTION WHEN unique_violation THEN
                RETURN 'duplicate';
            END;
            v_paid := round(COALESCE((p_invoice ->> 'paid_amount')::numeric,
                                     (p_invoice ->> 'amount')::numeric) * 100);
            IF v_paid IS DISTINCT FROM p.amount
               OR upper(COALESCE(p_invoice ->> 'currency', 'PHP')) <> 'PHP' THEN
                UPDATE public.billing_payments SET status = 'review', paid_at = now(),
                       failure_reason = 'Paid amount doesn''t match. Check it in the console.'
                 WHERE id = p.id;
                UPDATE public.billing_events SET outcome = 'review' WHERE event_key = v_key;
                RETURN 'review';
            END IF;
            UPDATE public.billing_payments
               SET status = 'paid', paid_at = COALESCE((p_invoice ->> 'paid_at')::timestamptz, now()),
                   payment_method = p_invoice ->> 'payment_method',
                   payment_channel = p_invoice ->> 'payment_channel', failure_reason = NULL,
                   applied_at = now()
             WHERE id = p.id;
            UPDATE public.billing_subscriptions
               SET plan_version_id = p.plan_version_id, addons = p.addons, status = 'active',
                   cancel_at_period_end = false, updated_at = now()
             WHERE manager_id = p.manager_id;
            DELETE FROM public.billing_active_selection WHERE manager_id = p.manager_id;
            UPDATE public.billing_events SET outcome = 'applied' WHERE event_key = v_key;
            RETURN 'applied';
        END IF;
    END IF;
    RETURN public.billing_apply_invoice_core(p_invoice);
END;
$$;

-- Moving to Free now: only when no paid period runs (trial, past due,
-- restricted). Otherwise as in add-billing.sql.
CREATE OR REPLACE FUNCTION public.billing_change_to_free()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_free UUID := public.billing_current_version('free');
    v_sub JSONB;
BEGIN
    IF v_free IS NULL THEN
        RAISE EXCEPTION 'That plan isn''t offered.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    v_sub := public.billing_subscription_json(v_uid);
    IF v_sub ->> 'planId' = 'free' THEN
        RAISE EXCEPTION 'That''s the plan you already have.';
    END IF;
    IF public.billing_period_running(v_sub) THEN
        RAISE EXCEPTION 'To move to Free, cancel your plan. You keep it until %, then you''re on Free.',
            public.billing_date_text((v_sub ->> 'periodEnd')::timestamptz);
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

-- The manager cancels: the plan ends on its renewal date, nothing changes before.
CREATE OR REPLACE FUNCTION public.billing_cancel_plan()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_sub JSONB;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    v_sub := public.billing_subscription_json(v_uid);
    IF NOT public.billing_period_running(v_sub) THEN
        RAISE EXCEPTION 'There''s no paid plan running to cancel.';
    END IF;
    IF (v_sub ->> 'cancelAtPeriodEnd')::boolean THEN
        RAISE EXCEPTION 'Your plan already ends on %.',
            public.billing_date_text((v_sub ->> 'periodEnd')::timestamptz);
    END IF;
    UPDATE public.billing_subscriptions SET cancel_at_period_end = true, updated_at = now()
     WHERE manager_id = v_uid;
    RETURN public.billing_subscription_json(v_uid);
END;
$$;

-- The manager keeps the plan after all, before its renewal date.
CREATE OR REPLACE FUNCTION public.billing_resume_plan()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := public.billing_require_owner();
    v_sub JSONB;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
    v_sub := public.billing_subscription_json(v_uid);
    IF NOT public.billing_period_running(v_sub) OR NOT (v_sub ->> 'cancelAtPeriodEnd')::boolean THEN
        RAISE EXCEPTION 'Your plan isn''t set to end.';
    END IF;
    UPDATE public.billing_subscriptions SET cancel_at_period_end = false, updated_at = now()
     WHERE manager_id = v_uid;
    RETURN public.billing_subscription_json(v_uid);
END;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_min_charge()',
        'public.billing_plan_rank(uuid)',
        'public.billing_period_running(jsonb)',
        'public.billing_quote(uuid, text, text, jsonb)',
        'public.billing_create_payment(uuid, text, text, text, jsonb)',
        'public.billing_apply_invoice(jsonb)',
        'public.billing_subscription_json(uuid)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY[
        'public.billing_change_to_free()',
        'public.billing_cancel_plan()',
        'public.billing_resume_plan()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.billing_create_payment(uuid, text, text, text, jsonb),
            public.billing_apply_invoice(jsonb) TO service_role;
    END IF;
END;
$$;
