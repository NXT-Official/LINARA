-- A limit on each user's AI calls (QA LM-A6, 2026-10-07; KNOWN_GAPS.md O47).
--
-- The six OpenAI-backed edge functions (route-utos, generate-sop,
-- parse-scheduler, simplify-sop, promote-voice-task, transcribe-notes) took
-- any validly signed token, the public anon key included, and had no limit:
-- anyone could run up the OpenAI bill. Each now checks for a signed-in user
-- (supabase/functions/_shared/ai-guard.ts) and, before doing any work, takes
-- one call from that user's allowance here:
--
--   * 60 calls an hour to any one function, and
--   * 300 a day across all of them.
--
-- A household's real use is a few dozen a day; a script hits the cap in
-- minutes. The counts are per user (auth.uid()), so one manager can't use up
-- a helper's allowance.
--
-- take_ai_call() is SECURITY DEFINER and the table has no policies and no
-- grants, so a caller can only add their own calls through it, never read,
-- edit or clear the counts. Rows older than two days are deleted as calls
-- come in.
--
-- Apply by hand in the SQL editor, before deploying the edge functions that
-- call it (a function that can't find take_ai_call() lets signed-in calls
-- through rather than breaking AI for everyone). Safe to run twice. Tested
-- in PGlite: supabase/tests/ai-call-limits.test.mjs.

CREATE TABLE IF NOT EXISTS public.ai_calls (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fn TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_user_at ON public.ai_calls(user_id, at);

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_calls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.ai_calls_id_seq FROM PUBLIC, anon, authenticated;

-- True, and counted, when the caller may make one more call to `p_fn`;
-- false when they're over a limit or not signed in.
CREATE OR REPLACE FUNCTION public.take_ai_call(p_fn TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_hour INT;
    v_day INT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_fn NOT IN ('route-utos', 'generate-sop', 'parse-scheduler', 'simplify-sop',
                    'promote-voice-task', 'transcribe-notes') THEN
        RAISE EXCEPTION 'Unknown AI function %', p_fn;
    END IF;

    -- One of the caller's calls at a time, so two racing for the last slot
    -- can't both get it.
    PERFORM pg_advisory_xact_lock(hashtext('ai_calls:' || v_uid::text));

    SELECT count(*) FILTER (WHERE fn = p_fn AND at > now() - interval '1 hour'),
           count(*)
      INTO v_hour, v_day
      FROM public.ai_calls
     WHERE user_id = v_uid AND at > now() - interval '1 day';

    IF v_hour >= 60 OR v_day >= 300 THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.ai_calls (user_id, fn) VALUES (v_uid, p_fn);
    DELETE FROM public.ai_calls WHERE user_id = v_uid AND at < now() - interval '2 days';
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.take_ai_call(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_ai_call(TEXT) TO authenticated;
