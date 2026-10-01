-- Closes KNOWN_GAPS.md O5: Quick Utos are deleted nightly by the database
-- itself, not only when a manager happens to open the web app.
--
-- plan.md §3.3 / README §3.3: "at midnight, all individual Quick Utos are
-- permanently deleted from the database". Until now the only deletion was
-- clearAllUtosForHelpersFn, run by the web app's day rollover -- which needs a
-- manager's browser to load. That path stays (it also clears the board when a
-- manager starts a new day early); this adds the guarantee underneath it.
--
-- Midnight is the HOUSEHOLD's midnight (households.timezone, C38), so the job
-- runs hourly: each household's utos from before its own civil day go within
-- the hour after its midnight, wherever it is. Utos still `waiting` for her
-- next shift go too -- the spec says all of them, and "Start new day" already
-- did the same.
--
-- Apply by hand in the SQL editor, after add-household-timezone-and-cutoffs.sql.
-- Needs pg_cron (available on every Supabase project; this enables it).

CREATE OR REPLACE FUNCTION public.purge_stale_quick_utos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH day_start AS (
        SELECT h.id AS household_id,
               date_trunc('day', now() AT TIME ZONE public.household_timezone(h.id))
                   AT TIME ZONE public.household_timezone(h.id) AS starts_at
        FROM public.households h
    )
    DELETE FROM public.quick_utos q
    USING public.helper_profiles hp, day_start d
    WHERE hp.id = q.recipient_id
      AND d.household_id = hp.household_id
      AND q.created_at < d.starts_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Only the scheduler (running as postgres) calls this.
REVOKE ALL ON FUNCTION public.purge_stale_quick_utos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_stale_quick_utos() FROM anon, authenticated;

-- @schedule (supabase/tests stop reading here: PGlite has no pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-stale-quick-utos';
SELECT cron.schedule('purge-stale-quick-utos', '5 * * * *', 'SELECT public.purge_stale_quick_utos()');

-- Check it's there, and later that it ran:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'purge-stale-quick-utos';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'purge-stale-quick-utos')
--    ORDER BY start_time DESC LIMIT 5;
