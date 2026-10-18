-- Support chat: a household's managers talk to Linara's platform admins
-- (sell-Linara plan, Task 6, 2026-10-19).
--
-- support_threads is one conversation per subject; support_messages are its
-- lines. Both are readable by the household's managers and by platform admins
-- and by nobody else. Nothing is written through the tables: there is no
-- INSERT/UPDATE/DELETE policy and the grants are SELECT only. The four RPCs
-- below are the only way in, and they keep the unread counters and
-- last_message_at in step (no triggers).
--
-- "Managers" means rows in household_managers (any of the three roles), not
-- my_household_ids(): that one also reaches a shared helper's households, and
-- a helper must never read the household's line to Linara.
--
-- The admin inbox (/admin/support) shows each thread's household name, so a
-- platform admin also gets a read-only SELECT policy on public.households
-- (the existing households_isolation policy only shows a manager their own).
--
-- Errors: RAISE EXCEPTION 'CODE:detail' with NOT_FOUND or NOT_ADMIN.
--
-- Apply by hand in the SQL editor. AFTER add-household-managers.sql and
-- add-platform-admins.sql (uses household_managers and is_platform_admin()).
-- Safe to run twice. Tested in PGlite: supabase/tests/support-chat.test.mjs.

CREATE TABLE IF NOT EXISTS public.support_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    opened_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 120),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    household_unread INT NOT NULL DEFAULT 0,
    platform_admin_unread INT NOT NULL DEFAULT 0
);
-- A deleted manager's threads, and the admins' replies in them, stay: the
-- opener goes NULL. Repeated here for a database with the earlier NOT NULL /
-- ON DELETE CASCADE version of the column.
ALTER TABLE public.support_threads ALTER COLUMN opened_by DROP NOT NULL;
ALTER TABLE public.support_threads DROP CONSTRAINT IF EXISTS support_threads_opened_by_fkey;
ALTER TABLE public.support_threads ADD CONSTRAINT support_threads_opened_by_fkey
    FOREIGN KEY (opened_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS support_threads_by_household ON public.support_threads (household_id);
CREATE INDEX IF NOT EXISTS support_threads_by_opened_by ON public.support_threads (opened_by);
CREATE INDEX IF NOT EXISTS support_threads_by_status ON public.support_threads (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL,
    from_platform_admin BOOLEAN NOT NULL DEFAULT false,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_by_thread ON public.support_messages (thread_id, created_at);

-- Households the caller manages. SECURITY DEFINER so policies can use it
-- without going through household_managers' own policy.
CREATE OR REPLACE FUNCTION public.support_manager_household_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.household_managers WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.support_manager_household_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_manager_household_ids() TO authenticated;

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_threads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.support_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_threads TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;

DROP POLICY IF EXISTS support_threads_read ON public.support_threads;
CREATE POLICY support_threads_read ON public.support_threads
    FOR SELECT TO authenticated
    USING (
        public.is_platform_admin()
        OR household_id IN (SELECT public.support_manager_household_ids())
    );

DROP POLICY IF EXISTS support_messages_read ON public.support_messages;
CREATE POLICY support_messages_read ON public.support_messages
    FOR SELECT TO authenticated
    USING (
        public.is_platform_admin()
        OR thread_id IN (
            SELECT t.id FROM public.support_threads t
             WHERE t.household_id IN (SELECT public.support_manager_household_ids())
        )
    );

-- --------------------------------------------------------------------------
-- RPCs: the only writers.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_support_thread(
    p_household_id UUID, p_subject TEXT, p_body TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_thread UUID;
BEGIN
    IF v_uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.household_managers
         WHERE household_id = p_household_id AND user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND:household';
    END IF;

    INSERT INTO public.support_threads (household_id, opened_by, subject, platform_admin_unread)
    VALUES (p_household_id, v_uid, p_subject, 1)
    RETURNING id INTO v_thread;

    INSERT INTO public.support_messages (thread_id, author_id, from_platform_admin, body)
    VALUES (v_thread, v_uid, false, p_body);

    RETURN v_thread;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_support_message(p_thread_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_admin BOOLEAN := public.is_platform_admin();
    v_household UUID;
    v_message UUID;
BEGIN
    SELECT household_id INTO v_household FROM public.support_threads WHERE id = p_thread_id;
    IF v_uid IS NULL OR v_household IS NULL OR NOT (
        v_admin OR EXISTS (
            SELECT 1 FROM public.household_managers
             WHERE household_id = v_household AND user_id = v_uid
        )
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND:thread';
    END IF;

    INSERT INTO public.support_messages (thread_id, author_id, from_platform_admin, body)
    VALUES (p_thread_id, v_uid, v_admin, p_body)
    RETURNING id INTO v_message;

    IF v_admin THEN
        UPDATE public.support_threads
           SET last_message_at = now(), household_unread = household_unread + 1
         WHERE id = p_thread_id;
    ELSE
        UPDATE public.support_threads
           SET last_message_at = now(), platform_admin_unread = platform_admin_unread + 1,
               status = 'open'
         WHERE id = p_thread_id;
    END IF;

    RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_support_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_admin BOOLEAN := public.is_platform_admin();
    v_household UUID;
BEGIN
    SELECT household_id INTO v_household FROM public.support_threads WHERE id = p_thread_id;
    IF v_uid IS NULL OR v_household IS NULL OR NOT (
        v_admin OR EXISTS (
            SELECT 1 FROM public.household_managers
             WHERE household_id = v_household AND user_id = v_uid
        )
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND:thread';
    END IF;

    IF v_admin THEN
        UPDATE public.support_threads SET platform_admin_unread = 0 WHERE id = p_thread_id;
    ELSE
        UPDATE public.support_threads SET household_unread = 0 WHERE id = p_thread_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_support_thread_status(p_thread_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN:support';
    END IF;
    IF p_status NOT IN ('open', 'closed') THEN
        RAISE EXCEPTION 'NOT_FOUND:status';
    END IF;
    UPDATE public.support_threads SET status = p_status WHERE id = p_thread_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND:thread';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.open_support_thread(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_support_message(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_support_thread_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_support_thread_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_support_thread(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_support_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_support_thread_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_support_thread_status(UUID, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- A platform admin reads household names for the support inbox. Added beside
-- households_isolation, which is left as it is (policies combine with OR).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS households_platform_admin_read ON public.households;
CREATE POLICY households_platform_admin_read ON public.households
    FOR SELECT TO authenticated
    USING (public.is_platform_admin());

-- --------------------------------------------------------------------------
-- Realtime: the chat listens to both tables. PGlite has no publication.
-- --------------------------------------------------------------------------
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'support_threads'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads, public.support_messages;
    END IF;
END $$;
