-- A task can exist before anyone is assigned to it (client feedback,
-- 2026-10-01: "add a task without a helper assigned yet and assign a helper
-- anytime"). tickets.helper_id becomes optional; NULL means Unassigned.
--
-- Who sees one: the managers. Unassigned tasks sit in their own lane on the
-- web dashboard. The helper app reads only tasks whose helper_id is hers, so
-- nothing changes there until a manager assigns one -- which is just setting
-- helper_id, and the realtime feed she already listens to delivers it.
--
-- Apply by hand in the SQL editor. Safe to run twice.

ALTER TABLE public.tickets ALTER COLUMN helper_id DROP NOT NULL;

COMMENT ON COLUMN public.tickets.helper_id IS
  'Who the task is for. NULL = Unassigned: on the managers'' board only, until one assigns it.';
