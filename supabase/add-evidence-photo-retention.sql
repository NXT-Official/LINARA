-- Closes KNOWN_GAPS.md O28: task and receipt photos are no longer kept forever.
--
-- Retention, decided 2026-10-03 (not yet approved by the client; see O28's
-- closure entry before changing it):
--   <household>/tickets/...   30 days  (photo of finished work)
--   <household>/receipts/...  60 days  (palengke receipts)
-- Everything else in household-evidence is left alone -- notably payout QR
-- codes (payout/<user id>/..., add-direct-gcash-pay.sql), which are deleted
-- when replaced.
--
-- What the photos showed that matters is already in rows that stay: what was
-- bought and what it cost (grocery_items), the task, who did it and when, and
-- its comments. Only the picture goes. A manager who wants one longer saves it
-- from the web (the Save link on the photo).
--
-- How it runs. Supabase refuses DELETE on storage.objects from SQL (the row
-- would go and the file would stay), so files are removed through the Storage
-- API by the purge-expired-evidence Edge Function, which pg_cron calls
-- nightly. That function first calls release_expired_evidence() below, which
-- picks the files by their own upload time and clears every row pointing at
-- them, then removes the files. If removing fails, the files are still there
-- and the next night picks them again; clearing the rows twice is a no-op.
-- Because it goes by file age, not by row, a file no row points to (a photo
-- uploaded but never saved to its task) goes too, and so does the
-- "<name>.thumb.jpg" thumbnail next to each photo.
--
-- Apply by hand in the SQL editor, after add-grocery-receipts.sql. Safe to
-- run twice. Then do the steps under "@schedule" at the bottom.
-- Tested in PGlite: supabase/tests/evidence-retention.test.mjs.

-- The storage path inside household-evidence that a stored photo reference
-- points at. tickets.photo_evidence_url holds the signed URL the phone got at
-- upload (KNOWN_GAPS.md C16); grocery_receipts holds a bare path. Our paths
-- are uuids, digits and dots, so the URL's percent-encoding never applies.
CREATE OR REPLACE FUNCTION public.household_evidence_path(p_ref TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_ref IS NULL THEN NULL
        WHEN p_ref LIKE '%/storage/v1/object/sign/household-evidence/%'
            THEN substring(p_ref FROM '/storage/v1/object/sign/household-evidence/([^?]+)')
        WHEN p_ref LIKE 'http%' THEN NULL
        ELSE p_ref
    END
$$;

-- Picks up to p_limit expired files, clears the rows that point at them, and
-- returns their paths for the caller to remove from storage.
CREATE OR REPLACE FUNCTION public.release_expired_evidence(
    p_task_days INTEGER DEFAULT 30,
    p_receipt_days INTEGER DEFAULT 60,
    p_limit INTEGER DEFAULT 1000
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_paths TEXT[];
BEGIN
    SELECT COALESCE(array_agg(name), '{}')
    INTO v_paths
    FROM (
        SELECT o.name
        FROM storage.objects o
        WHERE o.bucket_id = 'household-evidence'
          AND (
              (split_part(o.name, '/', 2) = 'tickets'
                  AND o.created_at < now() - make_interval(days => p_task_days))
              OR (split_part(o.name, '/', 2) = 'receipts'
                  AND o.created_at < now() - make_interval(days => p_receipt_days))
          )
        ORDER BY o.created_at
        LIMIT p_limit
    ) expired;

    IF cardinality(v_paths) = 0 THEN
        RETURN v_paths;
    END IF;

    -- A palengke run's photo is its receipt (receipts/...), so it is kept the
    -- receipts' 60 days, not 30.
    UPDATE public.tickets
    SET photo_evidence_url = NULL
    WHERE photo_evidence_url IS NOT NULL
      AND public.household_evidence_path(photo_evidence_url) = ANY (v_paths);

    -- A receipt row is only its photo; the costs are on grocery_items.
    DELETE FROM public.grocery_receipts
    WHERE storage_path = ANY (v_paths);

    RETURN v_paths;
END;
$$;

-- Only the Edge Function (service role) calls this.
REVOKE ALL ON FUNCTION public.release_expired_evidence(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_expired_evidence(INTEGER, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_evidence(INTEGER, INTEGER, INTEGER) TO service_role;

-- @schedule (supabase/tests stop reading here: PGlite has no pg_cron/pg_net/vault)
--
-- Before running this part, once:
--   1. Pick a long random value (e.g. `openssl rand -hex 32`) and give it to
--      the function:
--        npx supabase secrets set EVIDENCE_PURGE_SECRET=<value> --project-ref tueckhlrrupmnzhblewy
--   2. Deploy it (supabase/DEPLOYMENTS.md; config.toml has verify_jwt = false):
--        npx supabase functions deploy purge-expired-evidence --project-ref tueckhlrrupmnzhblewy
--   3. Put the same value, and the project URL, in Vault for the job below
--      (never in this file):
--        SELECT vault.create_secret('https://tueckhlrrupmnzhblewy.supabase.co', 'project_url');
--        SELECT vault.create_secret('<value>', 'evidence_purge_secret');
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 18:30 UTC is 02:30 in Manila.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-expired-evidence';
SELECT cron.schedule(
    'purge-expired-evidence',
    '30 18 * * *',
    $job$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/purge-expired-evidence',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-purge-secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'evidence_purge_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    )
    $job$
);

-- Check it's there, that it ran, and what the function said:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'purge-expired-evidence';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'purge-expired-evidence')
--    ORDER BY start_time DESC LIMIT 5;
--   SELECT status_code, content, created FROM net._http_response ORDER BY created DESC LIMIT 5;
