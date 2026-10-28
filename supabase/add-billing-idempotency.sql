-- One open payment per manager, and no paying twice (follows add-billing.sql).
--
-- Found in manual QA on dev, 2026-10-28: every "Pay on Xendit" click opened
-- a new Xendit page, and the older ones stayed payable for 24 hours. Paying
-- two of them charged the manager twice and restarted the renewal period.
--
-- NOW
--   * A purchase key (what's bought: kind, plan version, cycle, add-ons,
--     amount). Paying again for the same purchase returns the page that's
--     already open instead of making another.
--   * At most one open (pending) payment per manager, held by a unique index.
--     Starting a different purchase asks billing-checkout to close the open
--     page in Xendit first (billing_cancel_payment once Xendit confirms); if
--     Xendit says it was paid meanwhile, nothing new is opened.
--   * A page paid after it was replaced, or an expired page paid after a
--     newer payment went through, is recorded as paid and kept for review
--     (a refund in Xendit), never applied a second time.
--   * Clearer limit messages: "allows 1 household", "doesn't include
--     co-managers".
--
-- Apply by hand in the Supabase SQL editor, after add-billing.sql. Safe to run
-- twice. Tested in PGlite: supabase/tests/billing.test.mjs.

ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS purchase_key TEXT;

-- 'cancelled': replaced by a newer payment before it was paid.
ALTER TABLE public.billing_payments DROP CONSTRAINT IF EXISTS billing_payments_status_check;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'review', 'cancelled'));

-- Before the index: of any open payments a manager already has, the newest
-- stays open and the rest are marked replaced (if one is paid anyway, it goes
-- to review below).
UPDATE public.billing_payments bp
   SET status = 'cancelled', failure_reason = 'Replaced by a newer payment.'
 WHERE bp.status = 'pending'
   AND EXISTS (SELECT 1 FROM public.billing_payments n
                WHERE n.manager_id = bp.manager_id AND n.status = 'pending'
                  AND (n.created_at, n.id) > (bp.created_at, bp.id));
CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_one_open
    ON public.billing_payments (manager_id) WHERE status = 'pending';

-- What's being bought, as one key.
CREATE OR REPLACE FUNCTION public.billing_purchase_key(
    p_kind TEXT, p_version UUID, p_cycle TEXT, p_addons JSONB, p_amount BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT md5(concat_ws('|', p_kind, p_version::text, p_cycle, p_addons::text, p_amount::text))
$$;

-- How long a payment may sit without its Xendit page before it's given up on
-- (billing-checkout attaches the page within seconds).
CREATE OR REPLACE FUNCTION public.billing_opening_grace()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$ SELECT interval '2 minutes' $$;

-- Starts a payment, or returns the one already open. The amount comes from
-- the catalog. Returns one of:
--   {id, amount, kind, description}                 a new payment: make its page
--   {id, amount, kind, reuse: true, invoiceUrl}     the same purchase is open: go there
--   {supersede: {id, invoiceId}}                    another purchase is open: close
--                                                   it in Xendit, cancel it, ask again
-- kind 'plan': a plan, cycle and add-ons that cost something and aren't what
-- the manager has (paying what's owed on the plan they have is allowed).
-- kind 'addons': the add-ons the plan should have after; only what's added is
-- charged, for the period that's running.
CREATE OR REPLACE FUNCTION public.billing_create_payment(
    p_manager UUID, p_kind TEXT, p_plan_id TEXT, p_cycle TEXT, p_addons JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB;
    v_lines JSONB := public.billing_clean_addons(p_addons);
    v_version UUID;
    v_cycle TEXT;
    v_amount BIGINT;
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
        IF p_cycle IS NULL OR p_cycle NOT IN ('monthly', 'annual', 'one_time') THEN
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
    v_key := public.billing_purchase_key(p_kind, v_version, v_cycle, v_lines, v_amount);

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
        (manager_id, kind, plan_version_id, cycle, addons, amount, purchase_key)
    VALUES (p_manager, p_kind, v_version, v_cycle, v_lines, v_amount, v_key)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('id', v_row.id, 'amount', v_row.amount, 'kind', v_row.kind,
        'description', (SELECT pv.name FROM public.billing_plan_versions pv WHERE pv.id = v_version)
            || CASE WHEN p_kind = 'addons' THEN ' add-ons' ELSE
               CASE v_cycle WHEN 'annual' THEN ', yearly' WHEN 'monthly' THEN ', monthly' ELSE '' END END);
END;
$$;

-- An open payment replaced by a newer one, once its Xendit page is closed.
-- Returns false when it isn't open any more (paid or expired meanwhile).
CREATE OR REPLACE FUNCTION public.billing_cancel_payment(p_payment UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.billing_payments
       SET status = 'cancelled', failure_reason = 'Replaced by a newer payment.'
     WHERE id = p_payment AND status = 'pending';
    RETURN FOUND;
END;
$$;

-- The apply from add-billing.sql, kept as the core; the new
-- billing_apply_invoice below stops a second payment for the same thing first.
DO $$
BEGIN
    IF to_regprocedure('public.billing_apply_invoice_core(jsonb)') IS NULL THEN
        ALTER FUNCTION public.billing_apply_invoice(jsonb) RENAME TO billing_apply_invoice_core;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_apply_invoice_core(jsonb) FROM PUBLIC, anon, authenticated;

-- Applies a Xendit invoice, as read back from Xendit by the webhook. A page
-- paid after it was replaced, or an expired one paid after a newer payment
-- went through, is recorded as paid for review (a refund), not applied.
-- Everything else as before (billing_apply_invoice_core): logged once per
-- invoice and status, applied once.
CREATE OR REPLACE FUNCTION public.billing_apply_invoice(p_invoice JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id TEXT := p_invoice ->> 'id';
    v_status TEXT := upper(COALESCE(p_invoice ->> 'status', ''));
    v_key TEXT;
    p public.billing_payments%ROWTYPE;
BEGIN
    IF v_id IS NULL OR v_status NOT IN ('PAID', 'SETTLED') THEN
        RETURN public.billing_apply_invoice_core(p_invoice);
    END IF;
    SELECT * INTO p FROM public.billing_payments WHERE xendit_invoice_id = v_id FOR UPDATE;
    IF p.id IS NULL THEN
        RETURN public.billing_apply_invoice_core(p_invoice);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('billing:' || p.manager_id::text));
    IF p.status = 'cancelled'
       OR (p.status = 'expired' AND EXISTS (
            SELECT 1 FROM public.billing_payments n
             WHERE n.manager_id = p.manager_id AND n.id <> p.id AND n.status = 'paid'
               AND n.created_at > p.created_at)) THEN
        v_key := 'invoice:' || v_id || ':PAID';
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
    RETURN public.billing_apply_invoice_core(p_invoice);
END;
$$;

-- Clearer limit messages: "allows 1 household", "doesn't include co-managers".
CREATE OR REPLACE FUNCTION public.billing_assert_room(p_owner UUID, p_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sub JSONB;
    v_limit JSONB;
    v_max INT;
    v_used INT;
    v_name TEXT;
    v_one TEXT := CASE p_key WHEN 'households' THEN 'household'
                             WHEN 'kasambahay' THEN 'kasambahay' ELSE 'co-manager' END;
    v_many TEXT := CASE p_key WHEN 'households' THEN 'households'
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
    v_max := (v_limit #>> '{}')::int;
    v_used := (public.billing_usage(p_owner) ->> p_key)::int;
    IF v_used + 1 > v_max THEN
        SELECT pv.name INTO v_name FROM public.billing_plan_versions pv
         WHERE pv.id = public.billing_sub_version(v_sub);
        IF v_max = 0 THEN
            RAISE EXCEPTION 'The % plan doesn''t include %.', COALESCE(v_name, 'current'), v_many
                USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'The % plan allows % %, and you have %.',
            COALESCE(v_name, 'current'), v_max, CASE WHEN v_max = 1 THEN v_one ELSE v_many END, v_used
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.billing_create_payment(uuid, text, text, text, jsonb),
        public.billing_cancel_payment(uuid), public.billing_apply_invoice(jsonb),
        public.billing_assert_room(uuid, text), public.billing_purchase_key(text, uuid, text, jsonb, bigint),
        public.billing_opening_grace()
      FROM PUBLIC, anon, authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.billing_create_payment(uuid, text, text, text, jsonb),
            public.billing_cancel_payment(uuid), public.billing_apply_invoice(jsonb)
          TO service_role;
    END IF;
END;
$$;
