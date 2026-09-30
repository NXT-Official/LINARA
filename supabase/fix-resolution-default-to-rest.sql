-- FOLLOW-UP to add-helper-default-resolution.sql (Session E / E2), same day.
-- Run this AFTER that file. Idempotent and safe to re-run; a no-op on a
-- database that already has the corrected expression.
--
-- WHAT CHANGES ------------------------------------------------------------
-- `helper_profiles.effective_resolution` no longer derives 'premium_pay' from
-- employment. The unset default for EVERY helper is now 'rest_owed':
--
--   before:  COALESCE(default_resolution,
--                     CASE WHEN employment = 'live-out' THEN 'premium_pay'
--                          ELSE 'rest_owed' END)
--   after:   COALESCE(default_resolution, 'rest_owed')
--
-- WHY ---------------------------------------------------------------------
-- The original derivation came from home-management-concept.md's "a live-out
-- day helper leans back toward an hourly/OT model". That sentence was written
-- when `premium_pay` meant a cash top-up. It does not: the 2026-08-17 decision
-- (KNOWN_GAPS.md C39) is that after-hours work is TIME, and rest-day premium is
-- explicitly not paid in cash either. Both tags therefore accrue into the same
-- redeemable rest balance and are taken as days off.
--
-- So auto-tagging a whole class of workers 'premium_pay' bought nothing today
-- and cost something tomorrow. `rest_owed_balance_minutes` is pool arithmetic --
-- SUM(all entries) - SUM(approved rest_off_requests.minutes) -- with NO
-- per-entry settlement marker. Once a helper redeems minutes as time off, the
-- individual entries still look untouched and still carry their tag. C39
-- anticipates a future cash policy converting "only the unsettled premium_pay
-- ones", but *unsettled* is not answerable per entry. Deriving the tag from
-- employment silently grew that ambiguous population from roughly nothing to
-- every live-out helper's entire history -- minutes a later cash policy could
-- pay for a second time, after they had already been taken as days off.
--
-- "Flexible per worker" is unaffected and still real: a manager sets a helper's
-- default explicitly via set_helper_default_resolution(), which is unchanged.
-- What goes away is the *implicit* mapping. Nobody is tagged premium unless a
-- human decided it, which is the honest position while the cash policy is
-- deferred. See KNOWN_GAPS.md C42 and its open sub-item on settlement.
--
-- Existing EXPLICIT choices are preserved -- this only touches the derivation
-- used when default_resolution IS NULL. Existing ledger_entries are untouched:
-- resolution_type was stamped at insert time and stays whatever it was.

DO $$
DECLARE
    v_expression TEXT;
BEGIN
    SELECT pg_get_expr(d.adbin, d.adrelid)
      INTO v_expression
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.helper_profiles'::regclass
      AND a.attname = 'effective_resolution'
      AND a.attgenerated = 's';

    -- Absent: add-helper-default-resolution.sql hasn't been run. Say so rather
    -- than half-applying -- the column has to exist before it can be corrected.
    IF v_expression IS NULL THEN
        RAISE EXCEPTION
            'helper_profiles.effective_resolution does not exist -- run add-helper-default-resolution.sql first';
    END IF;

    -- Already corrected (or a fresh install that got the new expression
    -- directly). Nothing to do.
    IF v_expression NOT LIKE '%live-out%' THEN
        RAISE NOTICE 'effective_resolution already derives rest_owed only -- no change';
        RETURN;
    END IF;

    -- Postgres 15 cannot ALTER a generated column's expression (that arrives in
    -- 17 as ALTER COLUMN ... SET EXPRESSION), so drop and re-add. Safe: the
    -- column is derived, holds no independent state, and nothing indexes or
    -- views it. default_resolution -- the real state -- is not touched.
    ALTER TABLE public.helper_profiles DROP COLUMN effective_resolution;

    ALTER TABLE public.helper_profiles
      ADD COLUMN effective_resolution TEXT
      GENERATED ALWAYS AS (COALESCE(default_resolution, 'rest_owed')) STORED;

    RAISE NOTICE 'effective_resolution now derives rest_owed unless explicitly set';
END $$;

COMMENT ON COLUMN public.helper_profiles.effective_resolution IS
  'The resolution new ledger_entries get for this helper: the manager''s '
  'explicit default_resolution if set, otherwise rest_owed. NOT derived from '
  'employment -- see fix-resolution-default-to-rest.sql for why that mapping '
  'was removed while cash treatment of rest-day premium is deferred.';
