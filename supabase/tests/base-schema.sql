-- A minimal copy of the live schema: only what the migrations under test
-- touch, for exercising them in PGlite.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'My Household',
    timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id UUID NOT NULL,
    full_name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('primary_manager', 'co_manager', 'remote_admin', 'helper')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.helper_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    station TEXT NOT NULL,
    monthly_rate NUMERIC(10,2) NOT NULL,
    payday_interval TEXT NOT NULL CHECK (payday_interval IN ('semi_monthly', 'monthly')),
    shift_start TIME NOT NULL DEFAULT '07:00',
    shift_end TIME NOT NULL DEFAULT '19:00',
    weekly_rest_day INTEGER NOT NULL DEFAULT 0,
    invite_code VARCHAR(12) UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PENDING_CLAIM', 'ACTIVE', 'INACTIVE')) DEFAULT 'PENDING_CLAIM',
    manual_status TEXT,
    manual_available_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    block_reason TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    actual_start TIMESTAMPTZ,
    created_by UUID REFERENCES public.user_profiles(id)
);
CREATE TABLE public.quick_utos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.helper_profiles(id) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL
);
CREATE TABLE public.helper_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    adjust_minutes INTEGER NOT NULL DEFAULT 0,
    resolution_type TEXT
);
CREATE TABLE public.payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    cutoff_start DATE NOT NULL,
    cutoff_end DATE NOT NULL,
    base_pay NUMERIC(10,2) NOT NULL,
    statutory_employee_share NUMERIC(10,2) NOT NULL,
    vale_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(10,2) NOT NULL,
    payout_provider TEXT NOT NULL DEFAULT 'xendit',
    payout_channel_code TEXT NOT NULL CHECK (payout_channel_code IN ('PH_GCASH', 'PH_PAYMAYA')),
    payout_reference_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    payout_external_id TEXT,
    payout_status TEXT NOT NULL DEFAULT 'pending_send',
    failure_reason TEXT,
    requested_by UUID REFERENCES public.user_profiles(id),
    requested_at TIMESTAMPTZ DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX payslips_one_per_cutoff ON public.payslips (helper_id, cutoff_start, cutoff_end);
CREATE TABLE public.payout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payslip_id UUID NOT NULL REFERENCES public.payslips(id),
    attempt_number INT NOT NULL,
    reference_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    amount_sent NUMERIC NOT NULL,
    channel_code TEXT NOT NULL,
    requested_by UUID REFERENCES public.user_profiles(id)
);
CREATE TABLE public.vales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    settled_in_payslip_id UUID REFERENCES public.payslips(id)
);
CREATE TABLE public.rest_off_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    rest_date DATE NOT NULL,
    minutes INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by UUID REFERENCES public.user_profiles(id),
    decided_at TIMESTAMPTZ,
    decline_reason TEXT
);

CREATE FUNCTION public.current_household_id() RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT household_id FROM public.user_profiles WHERE id = auth.uid(); $$;
CREATE FUNCTION public.household_timezone(p_household_id UUID) RETURNS TEXT LANGUAGE sql STABLE AS
$$ SELECT 'Asia/Manila'::text $$;
CREATE FUNCTION public.cutoff_bounds_for(p_day DATE, p_payday_interval TEXT)
RETURNS TABLE (cutoff_start DATE, cutoff_end DATE) LANGUAGE sql IMMUTABLE AS $$
    SELECT
        CASE WHEN p_payday_interval = 'monthly' THEN date_trunc('month', p_day)::date
             WHEN EXTRACT(DAY FROM p_day) <= 15 THEN date_trunc('month', p_day)::date
             ELSE (date_trunc('month', p_day) + INTERVAL '15 days')::date END,
        CASE WHEN p_payday_interval = 'monthly' THEN (date_trunc('month', p_day) + INTERVAL '1 month - 1 day')::date
             WHEN EXTRACT(DAY FROM p_day) <= 15 THEN (date_trunc('month', p_day) + INTERVAL '14 days')::date
             ELSE (date_trunc('month', p_day) + INTERVAL '1 month - 1 day')::date END;
$$;
CREATE FUNCTION public.rest_owed_balance_minutes(p_helper_id UUID) RETURNS INT LANGUAGE sql STABLE AS
$$ SELECT 0 $$;

-- The live household-scoped policies these migrations sit beside.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rest_off_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_isolation ON public.user_profiles FOR ALL USING (household_id = public.current_household_id());
CREATE POLICY helper_profiles_isolation ON public.helper_profiles FOR ALL USING (household_id = public.current_household_id());
CREATE POLICY tickets_isolation ON public.tickets FOR ALL USING (household_id = public.current_household_id());
CREATE POLICY households_isolation ON public.households FOR SELECT USING (id = public.current_household_id());
CREATE POLICY payslips_isolation ON public.payslips FOR ALL USING (
    EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = payslips.helper_id AND hp.household_id = public.current_household_id()));
CREATE POLICY rest_off_requests_isolation ON public.rest_off_requests FOR ALL USING (
    EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = rest_off_requests.helper_id AND hp.household_id = public.current_household_id()));
CREATE POLICY helper_notes_privacy ON public.helper_notes FOR ALL USING (
    helper_id = (SELECT id FROM public.helper_profiles WHERE user_id = auth.uid()));
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
