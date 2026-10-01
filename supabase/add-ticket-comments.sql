-- Updates on a task, from either side (client feedback, 2026-10-01: "comment
-- on existing tasks (optional updates) for everyone, staff and manager, to
-- see"). "Naubos na ang sabon, bumili ako" from her; "Use the blue one" from
-- the manager.
--
-- Who sees a task's thread: the household's managers, and the helper the task
-- is assigned to -- not the other helpers, who don't see the task either.
-- She keeps reading the threads of her own tasks after she leaves (her
-- record), like tickets_own_read. Each author can edit or delete their own.
--
-- Apply by hand in the SQL editor, after add-employment-end.sql. Safe to run twice.

CREATE TABLE IF NOT EXISTS public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    -- A snapshot, so the thread still reads right after someone leaves or
    -- deletes their account. Set by the trigger below, never by the client.
    author_name TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx
    ON public.ticket_comments (ticket_id, created_at);

CREATE OR REPLACE FUNCTION public.can_see_ticket_thread(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tickets t
        LEFT JOIN public.user_profiles up ON up.id = auth.uid()
        LEFT JOIN public.helper_profiles hp ON hp.id = t.helper_id
        WHERE t.id = p_ticket_id
          AND (
              (up.user_type IN ('primary_manager', 'co_manager', 'remote_admin')
               AND up.household_id = t.household_id)
              OR hp.user_id = auth.uid()
          )
    );
$$;
REVOKE ALL ON FUNCTION public.can_see_ticket_thread(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_ticket_thread(UUID) TO authenticated;

-- The author is whoever is signed in, named from their profile.
CREATE OR REPLACE FUNCTION public.ticket_comments_stamp_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.author_id := auth.uid();
        NEW.author_name := COALESCE(
            (SELECT full_name FROM public.user_profiles WHERE id = auth.uid()), '');
        NEW.created_at := now();
        NEW.edited_at := NULL;
    ELSE
        NEW.author_id := OLD.author_id;
        NEW.author_name := OLD.author_name;
        NEW.ticket_id := OLD.ticket_id;
        NEW.created_at := OLD.created_at;
        NEW.edited_at := now();
    END IF;
    NEW.body := btrim(NEW.body);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ticket_comments_stamp_author ON public.ticket_comments;
CREATE TRIGGER ticket_comments_stamp_author
    BEFORE INSERT OR UPDATE ON public.ticket_comments
    FOR EACH ROW EXECUTE FUNCTION public.ticket_comments_stamp_author();

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_comments_read ON public.ticket_comments;
CREATE POLICY ticket_comments_read ON public.ticket_comments
    FOR SELECT USING (public.can_see_ticket_thread(ticket_id));

DROP POLICY IF EXISTS ticket_comments_write ON public.ticket_comments;
CREATE POLICY ticket_comments_write ON public.ticket_comments
    FOR INSERT WITH CHECK (public.can_see_ticket_thread(ticket_id));

DROP POLICY IF EXISTS ticket_comments_own_edit ON public.ticket_comments;
CREATE POLICY ticket_comments_own_edit ON public.ticket_comments
    FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS ticket_comments_own_delete ON public.ticket_comments;
CREATE POLICY ticket_comments_own_delete ON public.ticket_comments
    FOR DELETE USING (author_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
