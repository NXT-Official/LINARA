-- Session E item E2 of PAYMENTS_REMEDIATION.md: make the rest-vs-premium
-- resolution a PER-WORKER, PERSISTED property instead of ephemeral client
-- state.
--
-- Idempotent and safe to re-run, same house style as every other file here.
-- Run it in the Supabase SQL editor; nothing applies it automatically.
--
-- REVISED 2026-08-17, the same day it was first applied. The original version
-- derived 'premium_pay' from employment = 'live-out'; that mapping is gone (see
-- the SHAPE note below). This file now creates the corrected expression
-- directly, so a FRESH database needs only this file.
--
-- On a database that already ran the ORIGINAL version -- which is the case for
-- the live Supabase project -- re-running this file will NOT fix it, because
-- ADD COLUMN IF NOT EXISTS is a no-op once the column exists. Run
-- `fix-resolution-default-to-rest.sql` for that; it detects the old expression
-- and swaps it. Running the fixer on a fresh database is harmless (it detects
-- the new expression and does nothing).
--
-- WHY -------------------------------------------------------------------
-- home-management-concept.md: "keep the resolution type flexible per worker:
-- a live-out day helper leans back toward an hourly/OT model, while a live-in
-- accrues rest owed."
--
-- What the code actually did (KNOWN_GAPS.md C39's closing note): the default
-- was `useState<LedgerResolution>("rest")` in use-ledger.ts -- ephemeral
-- client state, household-wide, reset on every reload, and not keyed to a
-- helper at all. In a household with two helpers (the sandbox has exactly
-- that) one shared toggle decided how BOTH of their off-shift work was
-- classified, and whatever it happened to be set to at the moment of a
-- completion is what got written. That is the MULTI_HELPER_HANDLING.md failure
-- mode, applied to a field nobody was watching.
--
-- SHAPE -----------------------------------------------------------------
-- Deliberately NOT a seeded snapshot column. `default_resolution` is NULLABLE
-- and NULL means "nobody has chosen for this helper":
--
--   * NULL              -> rest_owed, the conservative default
--   * 'rest_owed'       -> explicit manager choice
--   * 'premium_pay'     -> explicit manager choice
--
-- A seeded column would have frozen whatever was true at migration time and
-- required the seeding to be repeated for every new helper by yet another
-- trigger. A live derivation costs nothing and cannot drift.
--
-- WHY NOT DERIVED FROM `employment`: the first version of this file mapped
-- 'live-out' -> 'premium_pay', following home-management-concept.md's "a
-- live-out day helper leans back toward an hourly/OT model". That sentence
-- predates the decision that rest-day premium is NOT paid in cash (C39), which
-- makes both tags behave identically today -- so the mapping bought nothing
-- now and created an ambiguity later, because there is no per-entry settlement
-- marker to say which premium-tagged minutes were already taken as time off.
-- Removed in fix-resolution-default-to-rest.sql, which has the full argument.
-- "Flexible per worker" is unchanged: a manager still sets it per helper, it is
-- simply never implied.
--
-- `effective_resolution` is a STORED generated column so that BOTH apps and
-- the trigger below read one answer instead of three implementations of the
-- COALESCE -- the same "one definition, read everywhere" reasoning as
-- rest_owed_balance_minutes (C39) and household_cutoff (C38).
--
-- NOTE ON SCOPE: this changes how an entry is CLASSIFIED, not what it is
-- worth. After-hours work is time, not money (C39). `premium_pay` entries
-- still accrue as redeemable rest minutes via rest_owed_balance_minutes'
-- COUNT_PREMIUM_AS_REST behaviour, and no peso path exists or is added here.
-- The tag is what a future cash policy would key off; today it is a label that
-- travels with the right worker instead of with whatever a shared toggle said.

-- --------------------------------------------------------------------------
-- 1. The per-helper column, plus the derived effective value.
-- --------------------------------------------------------------------------
ALTER TABLE public.helper_profiles
  ADD COLUMN IF NOT EXISTS default_resolution TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'helper_profiles_default_resolution_check'
    ) THEN
        ALTER TABLE public.helper_profiles
          ADD CONSTRAINT helper_profiles_default_resolution_check
          CHECK (default_resolution IN ('rest_owed', 'premium_pay'));
    END IF;
END $$;

COMMENT ON COLUMN public.helper_profiles.default_resolution IS
  'Explicit per-helper default for ledger_entries.resolution_type. NULL means '
  '"follow employment" -- see effective_resolution, which is what callers '
  'should read. Set via set_helper_default_resolution().';

-- STORED, not a view or a client-side COALESCE: this is the single definition
-- of "what does off-shift work default to for this worker", and it has to be
-- readable by the trigger, the manager's web app and the helper's mobile app
-- alike. ADD COLUMN IF NOT EXISTS makes the whole statement a no-op on re-run.
ALTER TABLE public.helper_profiles
  ADD COLUMN IF NOT EXISTS effective_resolution TEXT
  GENERATED ALWAYS AS (COALESCE(default_resolution, 'rest_owed')) STORED;

COMMENT ON COLUMN public.helper_profiles.effective_resolution IS
  'The resolution new ledger_entries get for this helper: the manager''s '
  'explicit default_resolution if set, otherwise rest_owed. Read this, never '
  're-derive it -- home-management-concept.md''s "flexible per worker".';

-- --------------------------------------------------------------------------
-- 2. Fill an omitted resolution_type from the helper's own default.
--
--    In Postgres rather than in the caller so that EVERY writer gets it --
--    today only LINARA's insertLedgerEntryFn writes here, but ../LINARA_MOBILE
--    already reads ledger_entries and is the obvious next writer. The C33
--    lesson is that a rule living in one app's code is a rule the other app
--    does not have.
--
--    A caller that passes resolution_type explicitly still wins: that is the
--    per-entry override the manager makes from the ledger card, and it must
--    not be second-guessed here.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_entry_default_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.resolution_type IS NULL THEN
        SELECT hp.effective_resolution
          INTO NEW.resolution_type
        FROM public.helper_profiles hp
        WHERE hp.id = NEW.helper_id;

        -- Helper row missing (shouldn't happen -- there is an FK) or somehow
        -- null: fall back to the conservative option rather than writing NULL
        -- and letting the entry accrue as nothing.
        NEW.resolution_type := COALESCE(NEW.resolution_type, 'rest_owed');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_default_resolution ON public.ledger_entries;
CREATE TRIGGER ledger_entries_default_resolution
    BEFORE INSERT ON public.ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.ledger_entry_default_resolution();

-- --------------------------------------------------------------------------
-- 3. Manager-gated setter. Same posture as decide_rest_off_request (C39) and
--    initiate_payslip (C36-C38): the permission check lives in the function,
--    not in the client that calls it.
--
--    helper_profiles_isolation is FOR ALL scoped to the household, so without
--    this a HELPER could change her own default by writing the table directly.
--    That is a terms-of-employment decision, and it belongs to the manager.
--
--    Passing NULL clears the override and returns the helper to following
--    their employment type -- that is a real state, not a missing value.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_helper_default_resolution(
    p_helper_id UUID,
    p_resolution TEXT DEFAULT NULL
)
RETURNS TABLE (default_resolution TEXT, effective_resolution TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can set a resolution default';
    END IF;

    IF p_resolution IS NOT NULL AND p_resolution NOT IN ('rest_owed', 'premium_pay') THEN
        RAISE EXCEPTION 'Unknown resolution: %', p_resolution;
    END IF;

    UPDATE public.helper_profiles hp
    SET default_resolution = p_resolution
    WHERE hp.id = p_helper_id
      AND hp.household_id = v_household_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    RETURN QUERY
    SELECT hp.default_resolution, hp.effective_resolution
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_helper_default_resolution(UUID, TEXT) TO authenticated;
