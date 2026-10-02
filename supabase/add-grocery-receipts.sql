-- Receipts for the palengke list (client feedback, 2026-10-02: "Receipt
-- attachment is not working"). Apply by hand in the Supabase SQL editor,
-- after fix-helper-write-access.sql (for is_household_manager). Idempotent
-- and safe to re-run. Tested in PGlite: supabase/tests/grocery-receipts.test.mjs.
--
-- Until now a receipt could only be attached by COMPLETING a task whose title
-- said "palengke" or "marketing run" (LINARA_MOBILE's ReceiptCaptureCard, the
-- photo going to tickets.photo_evidence_url). With no such task open, her
-- app had no receipt button at all, and the web's "No receipt yet" only ever
-- displayed that task's photo. A receipt covers a shopping trip, not a task,
-- so it gets its own row: anyone in the household can add one after buying,
-- task or no task.
--
-- The photo itself is in the household-evidence bucket under
-- "<household_id>/receipts/...", which that bucket's policy already isolates
-- (LINARA_MOBILE/supabase/storage-policies.sql). The phone shrinks it to
-- 1200px wide at 80% JPEG first, roughly 150 to 300 KB a receipt.

CREATE TABLE IF NOT EXISTS public.grocery_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    -- "<household_id>/receipts/<file>.jpg" in household-evidence.
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    -- The palengke run it came with, if there was one.
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT grocery_receipts_path_in_household
        CHECK (split_part(storage_path, '/', 1) = household_id::text)
);

CREATE INDEX IF NOT EXISTS grocery_receipts_household_recent
    ON public.grocery_receipts (household_id, created_at DESC);

ALTER TABLE public.grocery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grocery_receipts_read ON public.grocery_receipts;
CREATE POLICY grocery_receipts_read ON public.grocery_receipts
    FOR SELECT USING (household_id = public.current_household_id());

-- Anyone in the household adds their own.
DROP POLICY IF EXISTS grocery_receipts_insert ON public.grocery_receipts;
CREATE POLICY grocery_receipts_insert ON public.grocery_receipts
    FOR INSERT WITH CHECK (
        household_id = public.current_household_id()
        AND uploaded_by = auth.uid()
    );

-- Whoever added it, or a manager, can take it back. Nobody edits one.
DROP POLICY IF EXISTS grocery_receipts_delete ON public.grocery_receipts;
CREATE POLICY grocery_receipts_delete ON public.grocery_receipts
    FOR DELETE USING (
        household_id = public.current_household_id()
        AND (uploaded_by = auth.uid() OR public.is_household_manager())
    );

-- Supabase grants every table to the API roles by default; take back the
-- ones nobody needs, so an edit is refused rather than silently matching
-- no policy.
REVOKE ALL ON public.grocery_receipts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.grocery_receipts TO authenticated;
