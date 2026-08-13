-- Closes KNOWN_GAPS.md gap #4 (Pass board / `tickets` never written to).
--
-- The client `Task` type (src/features/tasks/task.types.ts) carries several
-- fields `tickets` had no column for. Per the C10 precedent (ledger_entries
-- gaining title/kind/adjust_minutes), these are denormalized directly onto
-- the row rather than deferred to a future join, since they are real product
-- state the board UI depends on today, not derivable from anything else:
--
--   block_reason       -- NeedsYou / BlockReasonModal's reason text
--   emergency          -- After-Hours Ledger / gating flag, parallel to is_after_hours
--   suggested          -- Remote-admin picks pending an on-site manager's approval
--   queued             -- held off today's board until the manager reopens it
--   queued_for_shift   -- why it's queued: waiting for the helper's next shift
--   recurrence         -- ['daily'] sentinel, or the actual weekday codes, or NULL
--   routine_id         -- which local Routine template spawned this instance
--                         (TEXT, not a FK -- routines have no table of their own
--                         yet; this is provenance only, see KNOWN_GAPS.md's
--                         "Routines scope" decision on gap #4's closure)
--   appointment_id     -- which local Appointment this prep task belongs to
--                         (TEXT, not a FK -- `appointments` itself still isn't
--                         written to; this partially resolves gap #7's
--                         prep-task half only, per that gap's writeup)
--   appointment_title  -- snapshot, same "don't drift on an edit" reasoning as
--                         ledger_entries.title
--   lead_minutes        -- the prep task's offset before the appointment, needed
--                         to recompute scheduled_start server-side when the
--                         appointment itself is rescheduled
--   reschedule_notice   -- {oldTime, oldDate, appointmentTitle} banner shown
--                         once on a prep task after its appointment moves
--
-- `station` is deliberately NOT added -- it was already always derived from
-- the assigned helper's current station at read time (see KNOWN_GAPS.md), so
-- a column would only reintroduce the staleness bug that behavior already had.
-- `scheduled_date` is deliberately NOT added -- it's just the date component
-- of `scheduled_start`, extracted client-side for appointment-linked tickets.

ALTER TABLE public.tickets
    ADD COLUMN block_reason TEXT,
    ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN queued BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN queued_for_shift BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN recurrence TEXT[],
    ADD COLUMN routine_id TEXT,
    ADD COLUMN appointment_id TEXT,
    ADD COLUMN appointment_title TEXT,
    ADD COLUMN lead_minutes INTEGER,
    ADD COLUMN reschedule_notice JSONB;

-- Speeds up useAppointments' "all prep tickets for this appointment" reschedule
-- and remove queries (see task.actions.ts's rescheduleAppointmentTicketsFn /
-- deleteTicketsByAppointmentFn).
CREATE INDEX idx_tickets_appointment_id ON public.tickets(appointment_id)
    WHERE appointment_id IS NOT NULL;
