-- More than one manager per household, and more than one household per
-- manager (KNOWN_GAPS.md O2). Apply by hand in the Supabase SQL editor, AFTER
-- add-account-deletion.sql, fix-helper-write-access.sql and
-- add-ticket-ledger.sql. Idempotent and safe to re-run. Tested in PGlite:
-- supabase/tests/household-managers.test.mjs.
--
-- The model:
--   * household_managers: one row per manager per household, with that
--     household's role (primary_manager, co_manager, remote_admin). Exactly
--     one primary per household.
--   * user_profiles.household_id / user_type stay what they always were: the
--     household this account is in right now, and its role there. Every
--     policy (current_household_id()) and every function that reads them
--     keeps working unchanged. switch_household() moves an account between
--     its memberships; it's one active household per account, so the switch
--     follows to its other devices (the web reloads when it notices).
--   * manager_invites: a code the primary manager makes for a co-manager or
--     remote admin, claimed by a new or existing manager account. Helper
--     accounts can't claim one: a helper stays a helper (separate logins).
--   * Writes to the two new tables go through the functions below only.
--
-- And the permission table in plan.md 1.2, in the database (not just the
-- app's server code), for what wasn't enforced there yet:
--   * Managing managers: primary only (the functions here).
--   * A remote admin can't write appointments, invite flags or payout
--     attempts, can't change or delete tasks or Quick Utos, and adds a task
--     only as a suggestion, or live and urgent while the helper is on shift
--     (never overriding her off-hours); a Quick Utos only urgent, while she's
--     on shift. These are RESTRICTIVE policies: they only narrow what the
--     existing policies allow, so a helper's and an on-site manager's access
--     is unchanged.
--   * A remote admin may approve vales and set the grocery budget (plan.md:
--     usually the funding source), and nothing else on the household row.
--   * Pay, leave, rest off, appointments-with-preps and employment already
--     go through SECURITY DEFINER functions that admit only primary and
--     co-managers; unchanged.
--   * Payout attempts: the policy let anyone in the household write one,
--     a helper's session included. Only the pay functions and the Xendit
--     webhook write them (both bypass RLS); direct writes are now managers'.

-- --------------------------------------------------------------------------
-- 0. Who's asking.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT user_type FROM public.user_profiles WHERE id = auth.uid();
$$;

-- Any of the three manager roles (is_household_manager() is primary + co).
CREATE OR REPLACE FUNCTION public.is_household_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(public.current_user_type() IN ('primary_manager', 'co_manager', 'remote_admin'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_remote_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(public.current_user_type() = 'remote_admin', FALSE);
$$;

-- On her shift right now, by the rest-owed trigger's own rule
-- (add-ticket-ledger.sql): not quiet hours, rest day, break or time off. A
-- wrapper because that function isn't granted to app users.
CREATE OR REPLACE FUNCTION public.helper_on_shift_now(p_helper_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.helper_profiles WHERE id = p_helper_id AND status = 'ACTIVE')
       AND public.ticket_ledger_source(p_helper_id, now(), FALSE, FALSE) IS NULL;
$$;

REVOKE ALL ON FUNCTION public.current_user_type() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_household_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_remote_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.helper_on_shift_now(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_type() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_remote_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_on_shift_now(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 1. Memberships.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_managers (
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('primary_manager', 'co_manager', 'remote_admin')),
    added_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (household_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS household_managers_one_primary
    ON public.household_managers (household_id) WHERE role = 'primary_manager';
CREATE INDEX IF NOT EXISTS household_managers_by_user ON public.household_managers (user_id);

ALTER TABLE public.household_managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_managers_read ON public.household_managers;
CREATE POLICY household_managers_read ON public.household_managers
    FOR SELECT USING (household_id = public.current_household_id() OR user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.household_managers FROM anon, authenticated;
GRANT SELECT ON public.household_managers TO authenticated;

-- Everyone who manages a household today. One primary each (the bootstrap
-- was the only way in); a second would be skipped rather than fail the run.
INSERT INTO public.household_managers (household_id, user_id, role, added_at)
SELECT household_id, id, user_type, created_at
  FROM public.user_profiles
 WHERE household_id IS NOT NULL
   AND user_type IN ('primary_manager', 'co_manager', 'remote_admin')
ON CONFLICT DO NOTHING;

-- A co-manager's name stays readable in a household while they're switched
-- into another one ("created by", the roster): the policy before this only
-- showed profiles whose *current* household is yours.
DROP POLICY IF EXISTS user_profiles_household_managers_read ON public.user_profiles;
CREATE POLICY user_profiles_household_managers_read ON public.user_profiles
    FOR SELECT USING (
        id IN (SELECT hm.user_id FROM public.household_managers hm
                WHERE hm.household_id = public.current_household_id())
    );

-- Puts an account in one of its households, with that household's role.
-- NULL: the most recently joined one it still has, else none (then the web
-- asks it to set one up or join one). Internal: not granted to app users.
CREATE OR REPLACE FUNCTION public.manager_set_active(p_user_id UUID, p_household_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := p_household_id;
    v_role TEXT;
BEGIN
    IF v_household IS NULL THEN
        SELECT household_id INTO v_household FROM public.household_managers
         WHERE user_id = p_user_id ORDER BY added_at DESC LIMIT 1;
    END IF;
    IF v_household IS NULL THEN
        UPDATE public.user_profiles SET household_id = NULL
         WHERE id = p_user_id AND user_type <> 'helper';
        RETURN NULL;
    END IF;
    SELECT role INTO v_role FROM public.household_managers
     WHERE user_id = p_user_id AND household_id = v_household;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'You don''t manage that household';
    END IF;
    UPDATE public.user_profiles SET household_id = v_household, user_type = v_role
     WHERE id = p_user_id AND user_type <> 'helper';
    RETURN v_household;
END;
$$;
REVOKE ALL ON FUNCTION public.manager_set_active(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- A role change reaches user_profiles.user_type only for whoever is in that
-- household right now; the others pick it up when they switch in.
CREATE OR REPLACE FUNCTION public.manager_sync_role(p_user_id UUID, p_household_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.user_profiles up SET user_type = hm.role
      FROM public.household_managers hm
     WHERE up.id = p_user_id AND up.household_id = p_household_id
       AND hm.user_id = p_user_id AND hm.household_id = p_household_id;
$$;
REVOKE ALL ON FUNCTION public.manager_sync_role(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. Your households, switching, and starting another.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_households()
RETURNS TABLE (household_id UUID, name TEXT, role TEXT, is_current BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hm.household_id, h.name, hm.role, hm.household_id = up.household_id
      FROM public.household_managers hm
      JOIN public.households h ON h.id = hm.household_id
      JOIN public.user_profiles up ON up.id = hm.user_id
     WHERE hm.user_id = auth.uid()
     ORDER BY lower(h.name), hm.added_at;
$$;

CREATE OR REPLACE FUNCTION public.switch_household(p_household_id UUID)
RETURNS TABLE (household_id UUID, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_household_id IS NULL THEN
        RAISE EXCEPTION 'Pick a household';
    END IF;
    PERFORM public.manager_set_active(auth.uid(), p_household_id);
    RETURN QUERY SELECT up.household_id, up.user_type FROM public.user_profiles up WHERE up.id = auth.uid();
END;
$$;

-- Same signature as add-manager-bootstrap.sql's, so both apps' sign-up keeps
-- calling it. New here: the membership row, and an existing manager account
-- with no household (it left or was removed from its last one) gets a new
-- one instead of its old profile back.
CREATE OR REPLACE FUNCTION public.bootstrap_manager_household(
    p_full_name TEXT,
    p_household_name TEXT DEFAULT NULL
)
RETURNS TABLE (user_id UUID, household_id UUID, full_name TEXT, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_existing public.user_profiles%ROWTYPE;
    v_household_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Idempotent: a refresh mid-flow, or confirm-email-then-log-in calling
    -- this again, returns the profile that's already there.
    SELECT * INTO v_existing FROM public.user_profiles WHERE id = v_uid;
    IF v_existing.id IS NOT NULL AND (v_existing.household_id IS NOT NULL OR v_existing.user_type = 'helper') THEN
        RETURN QUERY SELECT v_existing.id, v_existing.household_id, v_existing.full_name, v_existing.user_type;
        RETURN;
    END IF;

    INSERT INTO public.households (name)
    VALUES (COALESCE(NULLIF(btrim(p_household_name), ''), 'My Household'))
    RETURNING id INTO v_household_id;

    IF v_existing.id IS NULL THEN
        INSERT INTO public.user_profiles (id, household_id, full_name, user_type)
        VALUES (v_uid, v_household_id, COALESCE(NULLIF(btrim(p_full_name), ''), 'Manager'), 'primary_manager');
    END IF;
    INSERT INTO public.household_managers (household_id, user_id, role, added_by)
    VALUES (v_household_id, v_uid, 'primary_manager', v_uid);
    PERFORM public.manager_set_active(v_uid, v_household_id);

    RETURN QUERY SELECT up.id, up.household_id, up.full_name, up.user_type
                   FROM public.user_profiles up WHERE up.id = v_uid;
END;
$$;

-- A manager who already has a household starts another (a parents' house,
-- a second home), becomes its primary manager, and is switched into it.
CREATE OR REPLACE FUNCTION public.create_household(p_name TEXT)
RETURNS TABLE (household_id UUID, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_type TEXT;
    v_household_id UUID;
BEGIN
    SELECT up.user_type INTO v_type FROM public.user_profiles up WHERE up.id = v_uid;
    IF v_type IS NULL THEN
        RAISE EXCEPTION 'Set up your account first';
    END IF;
    IF v_type = 'helper' THEN
        RAISE EXCEPTION 'A helper account can''t manage a household. Use a separate manager account.';
    END IF;
    IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Give the household a name';
    END IF;

    INSERT INTO public.households (name) VALUES (btrim(p_name)) RETURNING id INTO v_household_id;
    INSERT INTO public.household_managers (household_id, user_id, role, added_by)
    VALUES (v_household_id, v_uid, 'primary_manager', v_uid);
    PERFORM public.manager_set_active(v_uid, v_household_id);
    RETURN QUERY SELECT up.household_id, up.user_type FROM public.user_profiles up WHERE up.id = v_uid;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Who manages this household.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_manager_roster()
RETURNS TABLE (user_id UUID, full_name TEXT, role TEXT, added_at TIMESTAMPTZ, is_you BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hm.user_id, up.full_name, hm.role, hm.added_at, hm.user_id = auth.uid()
      FROM public.household_managers hm
      JOIN public.user_profiles up ON up.id = hm.user_id
     WHERE hm.household_id = public.current_household_id()
       AND public.is_household_admin()
     ORDER BY CASE hm.role WHEN 'primary_manager' THEN 0 WHEN 'co_manager' THEN 1 ELSE 2 END,
              hm.added_at;
$$;

-- Raises unless the caller is the primary manager of the household they're
-- in; returns that household.
CREATE OR REPLACE FUNCTION public.require_primary_manager()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.current_household_id();
BEGIN
    IF v_household IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.household_managers
         WHERE household_id = v_household AND user_id = auth.uid() AND role = 'primary_manager') THEN
        RAISE EXCEPTION 'Only the primary manager can do that';
    END IF;
    RETURN v_household;
END;
$$;
REVOKE ALL ON FUNCTION public.require_primary_manager() FROM PUBLIC, anon, authenticated;

-- Change a manager's role. Making someone else primary hands it over: they
-- become primary and you become a co-manager, in one step.
CREATE OR REPLACE FUNCTION public.set_manager_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.require_primary_manager();
    v_uid UUID := auth.uid();
BEGIN
    IF p_role NOT IN ('primary_manager', 'co_manager', 'remote_admin') THEN
        RAISE EXCEPTION 'Unknown role %', p_role;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.household_managers
                    WHERE household_id = v_household AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'They don''t manage this household';
    END IF;
    IF p_user_id = v_uid THEN
        RAISE EXCEPTION 'To stop being primary, make someone else primary';
    END IF;

    IF p_role = 'primary_manager' THEN
        UPDATE public.household_managers SET role = 'co_manager'
         WHERE household_id = v_household AND user_id = v_uid;
    END IF;
    UPDATE public.household_managers SET role = p_role
     WHERE household_id = v_household AND user_id = p_user_id;

    PERFORM public.manager_sync_role(v_uid, v_household);
    PERFORM public.manager_sync_role(p_user_id, v_household);
END;
$$;

-- Take someone off this household. Their account stays; if they were in this
-- household, they're moved to another of theirs.
CREATE OR REPLACE FUNCTION public.remove_manager(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.require_primary_manager();
BEGIN
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You can''t remove yourself. Make someone else primary, then leave.';
    END IF;
    DELETE FROM public.household_managers WHERE household_id = v_household AND user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'They don''t manage this household';
    END IF;
    IF (SELECT household_id FROM public.user_profiles WHERE id = p_user_id) = v_household THEN
        PERFORM public.manager_set_active(p_user_id, NULL);
    END IF;
END;
$$;

-- Leave the household you're in. The primary manager hands over first, so a
-- household never loses its last one this way.
CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS TABLE (household_id UUID, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_household UUID := public.current_household_id();
    v_role TEXT;
BEGIN
    SELECT hm.role INTO v_role FROM public.household_managers hm
     WHERE hm.household_id = v_household AND hm.user_id = v_uid;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'You don''t manage this household';
    END IF;
    IF v_role = 'primary_manager' THEN
        RAISE EXCEPTION 'Make someone else primary before you leave';
    END IF;
    DELETE FROM public.household_managers hm WHERE hm.household_id = v_household AND hm.user_id = v_uid;
    PERFORM public.manager_set_active(v_uid, NULL);
    RETURN QUERY SELECT up.household_id, up.user_type FROM public.user_profiles up WHERE up.id = v_uid;
END;
$$;

-- --------------------------------------------------------------------------
-- 4. Inviting a manager.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manager_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('co_manager', 'remote_admin')),
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
    claimed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
ALTER TABLE public.manager_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_invites_primary_read ON public.manager_invites;
CREATE POLICY manager_invites_primary_read ON public.manager_invites
    FOR SELECT USING (
        household_id = public.current_household_id()
        AND public.current_user_type() = 'primary_manager'
    );
REVOKE INSERT, UPDATE, DELETE ON public.manager_invites FROM anon, authenticated;
GRANT SELECT ON public.manager_invites TO authenticated;

-- Eight characters with no 0/O or 1/I to misread, from a random UUID's bytes.
CREATE OR REPLACE FUNCTION public.new_manager_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_bytes BYTEA := uuid_send(gen_random_uuid());
    v_code TEXT := '';
BEGIN
    FOR i IN 0..7 LOOP
        v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    END LOOP;
    RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.new_manager_invite_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_manager_invite(p_role TEXT)
RETURNS TABLE (id UUID, code TEXT, role TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.require_primary_manager();
    v_row public.manager_invites%ROWTYPE;
BEGIN
    IF p_role NOT IN ('co_manager', 'remote_admin') THEN
        RAISE EXCEPTION 'Invite a co-manager or a remote admin';
    END IF;
    LOOP
        BEGIN
            INSERT INTO public.manager_invites (household_id, code, role, created_by)
            VALUES (v_household, public.new_manager_invite_code(), p_role, auth.uid())
            RETURNING * INTO v_row;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            -- That code is taken; draw another.
        END;
    END LOOP;
    RETURN QUERY SELECT v_row.id, v_row.code, v_row.role, v_row.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_manager_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.require_primary_manager();
BEGIN
    UPDATE public.manager_invites SET revoked_at = now()
     WHERE id = p_invite_id AND household_id = v_household
       AND claimed_at IS NULL AND revoked_at IS NULL;
END;
$$;

-- What a code would join, before claiming it: shown on the join screen.
-- Nothing for a code that's used, revoked, expired or made up.
CREATE OR REPLACE FUNCTION public.lookup_manager_invite(p_code TEXT)
RETURNS TABLE (household_name TEXT, role TEXT, invited_by TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.name, mi.role, up.full_name, mi.expires_at
      FROM public.manager_invites mi
      JOIN public.households h ON h.id = mi.household_id
      LEFT JOIN public.user_profiles up ON up.id = mi.created_by
     WHERE mi.code = upper(btrim(p_code))
       AND mi.claimed_at IS NULL AND mi.revoked_at IS NULL AND mi.expires_at > now();
$$;

-- Joins the code's household with its role and switches into it. A new
-- account (no profile yet) gets one here, named p_full_name.
CREATE OR REPLACE FUNCTION public.claim_manager_invite(p_code TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS TABLE (household_id UUID, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_invite public.manager_invites%ROWTYPE;
    v_type TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_invite FROM public.manager_invites mi
     WHERE mi.code = upper(btrim(p_code))
     FOR UPDATE;
    IF v_invite.id IS NULL OR v_invite.claimed_at IS NOT NULL OR v_invite.revoked_at IS NOT NULL
       OR v_invite.expires_at <= now() THEN
        RAISE EXCEPTION 'That code isn''t valid any more. Ask for a new one.';
    END IF;

    SELECT up.user_type INTO v_type FROM public.user_profiles up WHERE up.id = v_uid;
    IF v_type = 'helper' THEN
        RAISE EXCEPTION 'A helper account can''t join as a manager. Use a separate manager account.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.household_managers hm
                WHERE hm.household_id = v_invite.household_id AND hm.user_id = v_uid) THEN
        RAISE EXCEPTION 'You already manage this household';
    END IF;

    IF v_type IS NULL THEN
        IF NULLIF(btrim(COALESCE(p_full_name, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Tell us your name';
        END IF;
        INSERT INTO public.user_profiles (id, household_id, full_name, user_type)
        VALUES (v_uid, v_invite.household_id, btrim(p_full_name), v_invite.role);
    END IF;

    INSERT INTO public.household_managers (household_id, user_id, role, added_by)
    VALUES (v_invite.household_id, v_uid, v_invite.role, v_invite.created_by);
    UPDATE public.manager_invites SET claimed_by = v_uid, claimed_at = now() WHERE id = v_invite.id;
    PERFORM public.manager_set_active(v_uid, v_invite.household_id);

    RETURN QUERY SELECT up.household_id, up.user_type FROM public.user_profiles up WHERE up.id = v_uid;
END;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.my_households()',
        'public.switch_household(uuid)',
        'public.bootstrap_manager_household(text, text)',
        'public.create_household(text)',
        'public.household_manager_roster()',
        'public.set_manager_role(uuid, text)',
        'public.remove_manager(uuid)',
        'public.leave_household()',
        'public.create_manager_invite(text)',
        'public.revoke_manager_invite(uuid)',
        'public.lookup_manager_invite(text)',
        'public.claim_manager_invite(text, text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 5. What a remote admin may write (plan.md 1.2).
-- --------------------------------------------------------------------------
-- Tasks: a suggestion for the on-site managers, or live and urgent while
-- she's on shift. Changing or removing one is an on-site manager's call.
DROP POLICY IF EXISTS tickets_remote_admin_insert ON public.tickets;
CREATE POLICY tickets_remote_admin_insert ON public.tickets AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (
        NOT public.is_remote_admin()
        OR suggested
        OR (emergency AND helper_id IS NOT NULL AND public.helper_on_shift_now(helper_id))
    );
DROP POLICY IF EXISTS tickets_remote_admin_update ON public.tickets;
CREATE POLICY tickets_remote_admin_update ON public.tickets AS RESTRICTIVE
    FOR UPDATE TO authenticated USING (NOT public.is_remote_admin());
DROP POLICY IF EXISTS tickets_remote_admin_delete ON public.tickets;
CREATE POLICY tickets_remote_admin_delete ON public.tickets AS RESTRICTIVE
    FOR DELETE TO authenticated USING (NOT public.is_remote_admin());

-- Quick Utos: only urgent, while she's on shift.
DROP POLICY IF EXISTS quick_utos_remote_admin_insert ON public.quick_utos;
CREATE POLICY quick_utos_remote_admin_insert ON public.quick_utos AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (
        NOT public.is_remote_admin()
        OR (emergency AND public.helper_on_shift_now(recipient_id))
    );
DROP POLICY IF EXISTS quick_utos_remote_admin_update ON public.quick_utos;
CREATE POLICY quick_utos_remote_admin_update ON public.quick_utos AS RESTRICTIVE
    FOR UPDATE TO authenticated USING (NOT public.is_remote_admin());
DROP POLICY IF EXISTS quick_utos_remote_admin_delete ON public.quick_utos;
CREATE POLICY quick_utos_remote_admin_delete ON public.quick_utos AS RESTRICTIVE
    FOR DELETE TO authenticated USING (NOT public.is_remote_admin());

-- Appointments and invite flags: view-only for a remote admin.
DO $$
DECLARE
    v_table TEXT;
    v_cmd TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['appointments', 'invite_flags'] LOOP
        IF to_regclass('public.' || v_table) IS NULL THEN
            CONTINUE;
        END IF;
        FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                           v_table || '_remote_admin_' || v_cmd, v_table);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s (NOT public.is_remote_admin())',
                v_table || '_remote_admin_' || v_cmd, v_table, v_cmd,
                CASE WHEN v_cmd = 'insert' THEN 'WITH CHECK' ELSE 'USING' END);
        END LOOP;
    END LOOP;
END;
$$;

-- Payout attempts: written by the pay functions and the webhook (which
-- bypass RLS); a direct write is a primary or co-manager's only.
DO $$
DECLARE
    v_cmd TEXT;
BEGIN
    IF to_regclass('public.payout_attempts') IS NULL THEN
        RETURN;
    END IF;
    FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.payout_attempts', 'payout_attempts_manager_' || v_cmd);
        EXECUTE format(
            'CREATE POLICY %I ON public.payout_attempts AS RESTRICTIVE FOR %s TO authenticated %s (public.is_household_manager())',
            'payout_attempts_manager_' || v_cmd, v_cmd,
            CASE WHEN v_cmd = 'insert' THEN 'WITH CHECK' ELSE 'USING' END);
    END LOOP;
END;
$$;

-- Vales: a remote admin approves them too. Deleting one stays on-site.
DROP POLICY IF EXISTS vales_manager_update ON public.vales;
CREATE POLICY vales_manager_update ON public.vales
    FOR UPDATE
    USING (
        public.is_household_admin()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_admin()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    );

-- The household row: a remote admin may set the grocery budget, and only that.
DROP POLICY IF EXISTS households_update_budget ON public.households;
CREATE POLICY households_update_budget ON public.households
    FOR UPDATE
    USING (id = public.current_household_id() AND public.is_household_admin())
    WITH CHECK (id = public.current_household_id() AND public.is_household_admin());

CREATE OR REPLACE FUNCTION public.households_remote_admin_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_remote_admin()
       AND (to_jsonb(NEW) - 'petty_cash_budget') IS DISTINCT FROM (to_jsonb(OLD) - 'petty_cash_budget') THEN
        RAISE EXCEPTION 'A remote admin can change the grocery budget, not the household''s other settings';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS households_remote_admin_guard ON public.households;
CREATE TRIGGER households_remote_admin_guard
    BEFORE UPDATE ON public.households
    FOR EACH ROW EXECUTE FUNCTION public.households_remote_admin_guard();

-- --------------------------------------------------------------------------
-- 6. Deleting an account (add-account-deletion.sql), for every household the
--    person manages, not just the one they were last in. A household that
--    still has another manager keeps everything, and if the person was its
--    primary, its longest-standing co-manager (else remote admin) takes over.
--    The last manager's departure clears that household as before.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_account_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.user_profiles;
    v_households UUID[];
    v_last UUID[] := ARRAY[]::UUID[];
    v_household UUID;
    v_successor UUID;
    v_deleted UUID[] := ARRAY[]::UUID[];
    v_fk RECORD;
    v_table TEXT;
    v_notes INTEGER := 0;
BEGIN
    SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;

    -- Every job she still holds has to be ended by the household first, so her
    -- final pay and record are settled (end_helper_employment).
    IF EXISTS (SELECT 1 FROM public.helper_profiles
               WHERE user_id = p_user_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Her employment is still active. Ask the household to end it (with final pay) first.';
    END IF;

    -- Every household this person manages: memberships, plus the current one
    -- in case it predates them.
    SELECT array_agg(DISTINCT h) INTO v_households FROM (
        SELECT household_id AS h FROM public.household_managers WHERE user_id = p_user_id
        UNION
        SELECT v_profile.household_id
         WHERE v_profile.household_id IS NOT NULL
           AND v_profile.user_type IN ('primary_manager', 'co_manager', 'remote_admin')
    ) s;

    FOREACH v_household IN ARRAY COALESCE(v_households, ARRAY[]::UUID[]) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.household_managers
                        WHERE household_id = v_household AND user_id <> p_user_id) THEN
            IF EXISTS (SELECT 1 FROM public.helper_profiles
                        WHERE household_id = v_household AND status = 'ACTIVE') THEN
                RAISE EXCEPTION 'A household they''re the last manager of still employs someone. End each employment (with final pay) first.';
            END IF;
            v_last := v_last || v_household;
        ELSIF EXISTS (SELECT 1 FROM public.household_managers
                       WHERE household_id = v_household AND user_id = p_user_id
                         AND role = 'primary_manager') THEN
            SELECT user_id INTO v_successor FROM public.household_managers
             WHERE household_id = v_household AND user_id <> p_user_id
             ORDER BY CASE role WHEN 'co_manager' THEN 0 ELSE 1 END, added_at
             LIMIT 1;
            DELETE FROM public.household_managers WHERE household_id = v_household AND user_id = p_user_id;
            UPDATE public.household_managers SET role = 'primary_manager'
             WHERE household_id = v_household AND user_id = v_successor;
            PERFORM public.manager_sync_role(v_successor, v_household);
        END IF;
    END LOOP;

    -- Her private notes: nobody else may ever read them, so nobody keeps them.
    DELETE FROM public.helper_notes
        WHERE helper_id IN (SELECT id FROM public.helper_profiles WHERE user_id = p_user_id);
    GET DIAGNOSTICS v_notes = ROW_COUNT;

    FOREACH v_household IN ARRAY v_last LOOP
        DELETE FROM public.quick_utos
            WHERE recipient_id IN (SELECT id FROM public.helper_profiles WHERE household_id = v_household);
        FOREACH v_table IN ARRAY ARRAY['appointments', 'pantry_items', 'grocery_items', 'house_sops'] LOOP
            IF to_regclass('public.' || v_table) IS NOT NULL THEN
                EXECUTE format('DELETE FROM public.%I WHERE household_id = $1', v_table) USING v_household;
            END IF;
        END LOOP;
        DELETE FROM public.helper_profiles
            WHERE household_id = v_household AND status = 'PENDING_CLAIM' AND user_id IS NULL;
    END LOOP;

    -- "Created by" / "approved by" columns pointing at this person: keep the
    -- row, drop the name. Found from the catalog so a column added later can't
    -- be missed (a missed one would block the delete below, not leak).
    FOR v_fk IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND array_length(c.conkey, 1) = 1
          AND c.confrelid IN ('public.user_profiles'::regclass, 'auth.users'::regclass)
          AND c.confdeltype IN ('a', 'r')
          AND NOT a.attnotnull
    LOOP
        EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', v_fk.tbl, v_fk.col, v_fk.col)
            USING p_user_id;
    END LOOP;

    -- The login itself. Cascades to user_profiles, household_managers and
    -- push_tokens; each employment's user_id goes NULL, keeping it and its
    -- pay records.
    DELETE FROM auth.users WHERE id = p_user_id;

    FOREACH v_household IN ARRAY v_last LOOP
        IF NOT EXISTS (SELECT 1 FROM public.helper_profiles WHERE household_id = v_household) THEN
            DELETE FROM public.households WHERE id = v_household;
            v_deleted := v_deleted || v_household;
        END IF;
    END LOOP;

    UPDATE public.account_deletion_requests
        SET status = 'done', processed_at = now(), note = NULL
        WHERE user_id = p_user_id AND status = 'pending';

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'user_type', v_profile.user_type,
        'private_notes_deleted', v_notes,
        'household_data_deleted', cardinality(v_last) > 0,
        'households_cleared', to_jsonb(v_last),
        'household_deleted', cardinality(v_deleted) > 0,
        'households_deleted', to_jsonb(v_deleted));
END;
$$;

REVOKE ALL ON FUNCTION public.process_account_deletion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_account_deletion(UUID) FROM anon, authenticated;
