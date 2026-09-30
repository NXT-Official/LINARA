-- Session E item E3a of PAYMENTS_REMEDIATION.md: the validation and cancel
-- path C39 left open on rest-off requests.
--
-- Run AFTER add-rest-off-requests.sql. Idempotent and safe to re-run: it only
-- replaces functions and adds one index.
--
-- Three residual limitations from KNOWN_GAPS.md C39, in the order they bite:
--
--   1. `rest_date` was never validated against the household's today, so a
--      helper could request a day off that has already happened. C38 gave us
--      household_today() precisely so a civil date can be compared on the
--      server's frame rather than a device's -- this uses it.
--   2. Nothing checked a requested window against an existing one. The only
--      guard was `rest_off_one_approved_per_window`, a unique index on
--      (helper, date, start, end) for approved rows -- which stops an EXACT
--      duplicate and nothing else. 08:00-12:00 and 09:00-13:00 on the same day
--      sailed through, double-debiting the balance for hours that overlap.
--   3. The `cancelled` status existed in the CHECK constraint and nothing ever
--      set it. A helper who mistyped a date had to ask a manager to decline
--      her, which reads as a refusal in the history rather than a correction.
--
-- NOT enforced here, deliberately: whether the window lies inside the helper's
-- shift. C39 lists it, but the rule is not obvious and inventing one would be
-- worse than leaving it open. A live-in asking for a whole day, or for hours
-- that straddle her shift boundary, is a perfectly ordinary request; blocking
-- it would be this app telling a household how to arrange its own time. Left
-- to the manager's approval, which is a human reading a request.

-- No new index: `idx_rest_off_requests_helper (helper_id, rest_date DESC)` from
-- add-rest-off-requests.sql already serves the overlap lookups below. A second
-- index on the same leading columns would be dead weight on every write.

-- --------------------------------------------------------------------------
-- 1. request_rest_off -- same signature, three new refusals.
--
--    Kept as one function rather than a trigger: these are user-facing errors
--    with messages a kasambahay reads on her phone, and they need to say which
--    of several things went wrong. A CHECK constraint can only say "no".
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_rest_off(
    p_helper_id UUID,
    p_rest_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_note TEXT DEFAULT NULL
)
-- OUT names are deliberately NOT bare `minutes`/`status`: plpgsql resolves an
-- unqualified column reference against OUT params too, so `SUM(minutes)` below
-- would raise "column reference is ambiguous" at runtime. Same precaution as
-- initiate_payslip's resulting_status. Every query in the body also qualifies
-- its columns with a table alias.
RETURNS TABLE (request_id UUID, requested_minutes INT, balance_after_if_approved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_minutes INT;
    v_balance INT;
    v_pending INT;
    v_request_id UUID;
    v_today DATE;
    v_clash RECORD;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the HELPER, not the request rows -- the contended resource is her
    -- balance and her day, and two requests that don't exist yet cannot be
    -- locked. Without this, two concurrent calls for overlapping windows both
    -- pass the overlap check below, both insert, and both become approvable:
    -- the balance gets debited twice for hours that overlap. This is the exact
    -- mistake C39's first draft made on the approval side (it locked the
    -- request instead of the helper, so two managers approving DIFFERENT
    -- requests never contended), caught only by an overlapping-transaction
    -- test. Same lesson, applied on the request side.
    PERFORM 1
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'The end time must be after the start time';
    END IF;

    v_minutes := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::int / 60;

    IF v_minutes <= 0 THEN
        RAISE EXCEPTION 'That window is zero minutes long';
    END IF;

    -- NEW: the past is not requestable. household_today() resolves the
    -- household's civil date in its own timezone on the Postgres clock (C38),
    -- so this cannot be defeated by a device with a wrong date -- which is the
    -- entire reason that function exists. Today itself is allowed: asking at
    -- 08:00 for 14:00 the same day is an ordinary request.
    v_today := public.household_today();
    IF p_rest_date < v_today THEN
        RAISE EXCEPTION 'That date has already passed (today is %)', v_today;
    END IF;

    -- NEW: no overlapping window on the same day. Checks PENDING as well as
    -- APPROVED -- two overlapping pending requests would otherwise both be
    -- approvable, and the second approval would silently debit hours the first
    -- already took. Half-open comparison (start < other_end AND end >
    -- other_start) so 08:00-12:00 and 12:00-16:00 are adjacent, not clashing.
    SELECT r.start_time, r.end_time, r.status INTO v_clash
    FROM public.rest_off_requests r
    WHERE r.helper_id = p_helper_id
      AND r.rest_date = p_rest_date
      AND r.status IN ('pending', 'approved')
      AND p_start_time < r.end_time
      AND p_end_time > r.start_time
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'That overlaps a % request on % (%-%)',
            v_clash.status, p_rest_date,
            to_char(v_clash.start_time, 'HH24:MI'), to_char(v_clash.end_time, 'HH24:MI');
    END IF;

    v_balance := public.rest_owed_balance_minutes(p_helper_id);

    -- Pending requests are not debited yet, but a helper shouldn't be able to
    -- queue up more than they have -- otherwise the manager is handed a stack
    -- of requests that cannot all be approved, and whoever approves last gets
    -- an error they did nothing to cause.
    SELECT COALESCE(SUM(r.minutes), 0) INTO v_pending
    FROM public.rest_off_requests r
    WHERE r.helper_id = p_helper_id AND r.status = 'pending';

    IF v_minutes + v_pending > v_balance THEN
        RAISE EXCEPTION 'Not enough rest owed: % minutes available, % already requested, % more asked for',
            v_balance, v_pending, v_minutes;
    END IF;

    INSERT INTO public.rest_off_requests (
        helper_id, rest_date, start_time, end_time, minutes, note
    )
    VALUES (p_helper_id, p_rest_date, p_start_time, p_end_time, v_minutes, p_note)
    RETURNING id INTO v_request_id;

    RETURN QUERY SELECT v_request_id, v_minutes, (v_balance - v_minutes)::int;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_rest_off(UUID, DATE, TIME, TIME, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. cancel_rest_off_request -- the status that existed with nothing setting
--    it.
--
--    Who may cancel: the kasambahay who asked (a mistyped date is hers to
--    correct, and having to ask a manager to DECLINE it records a refusal
--    where there was only a typo), or a manager in her household. Only a
--    PENDING request. An approved one has already debited the balance and a
--    day off may have been arranged around it -- unwinding that is a
--    negotiation between two people, not a button, and it would need the
--    balance restored under the same lock the approval took. Deliberately out
--    of scope; a manager can decline before approving if it is still pending.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_rest_off_request(p_request_id UUID)
RETURNS TABLE (request_id UUID, resulting_status TEXT, balance_after INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_helper_id UUID;
    v_status TEXT;
    v_owner_user_id UUID;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();

    -- Lock the request itself: two taps on a slow connection must not both
    -- transition it, and the status check below has to hold until the UPDATE.
    SELECT r.helper_id, r.status, hp.user_id
      INTO v_helper_id, v_status, v_owner_user_id
    FROM public.rest_off_requests r
    JOIN public.helper_profiles hp ON hp.id = r.helper_id
    WHERE r.id = p_request_id
      AND hp.household_id = v_household_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rest-off request not found';
    END IF;

    IF v_user_type NOT IN ('primary_manager', 'co_manager')
       AND (v_owner_user_id IS NULL OR v_owner_user_id <> auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden: only the kasambahay who asked, or a manager, can cancel this';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'That request was already %', v_status;
    END IF;

    UPDATE public.rest_off_requests r
    SET status = 'cancelled',
        decided_at = timezone('utc', now())
    WHERE r.id = p_request_id;

    -- Cancelling a PENDING request cannot change the balance -- pending minutes
    -- were never debited (rest_owed_balance_minutes subtracts approved rows
    -- only). Returned anyway so the caller can refresh from one place.
    RETURN QUERY SELECT p_request_id, 'cancelled'::TEXT,
                        public.rest_owed_balance_minutes(v_helper_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_rest_off_request(UUID) TO authenticated;
