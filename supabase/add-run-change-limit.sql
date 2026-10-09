-- A run's change can't be more than the cash given (KNOWN_GAPS.md O51).
--
-- The helper app pre-filled the "Sukli na ibinalik" field once and kept what
-- was there when more was typed, so ₱500,420 was saved as the change from
-- ₱500 cash. Both apps now refuse it; this keeps any other write from
-- recording more change than cash, whoever sends it (a manager fixing a
-- closed run's figures included).
--
-- Apply by hand in the Supabase SQL editor, AFTER add-grocery-runs.sql. Safe
-- to run twice. If it fails because a run already breaks the rule, find it
-- with
--   SELECT id, title, cash_given, change_returned FROM public.grocery_runs
--   WHERE change_returned > cash_given;
-- and fix its figures first. Tested in supabase/tests/grocery-runs.test.mjs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'grocery_runs_change_within_cash'
          AND conrelid = 'public.grocery_runs'::regclass
    ) THEN
        ALTER TABLE public.grocery_runs ADD CONSTRAINT grocery_runs_change_within_cash
            CHECK (change_returned IS NULL OR cash_given IS NULL OR change_returned <= cash_given);
    END IF;
END;
$$;
