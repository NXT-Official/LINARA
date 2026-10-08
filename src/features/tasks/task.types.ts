import type { Station } from "@/features/people/people.types";
import type { PlaceRef } from "@/features/sharing/sharing.types";
import type { Weekday } from "@/lib/time";

/** "cancelled" (add-cancelled-tasks.sql): kept for the record, off the board and every to-do count. */
export type Status = "todo" | "in_progress" | "done" | "blocked" | "cancelled";
export type Recurrence = "none" | "daily" | Weekday[];

export type Task = {
  id: string;
  title: string;
  note?: string;
  time: string;
  /** How long it takes, if set (tickets.duration_minutes). */
  durationMinutes?: number;
  scheduledStart?: string; // ISO, tickets.scheduled_start -- the real instant behind `time`
  /** null = Unassigned (supabase/add-unassigned-tasks.sql): on the managers' board only. */
  helperId: string | null;
  station: Station;
  status: Status;
  photo?: string;
  /** The 480px copy of `photo` for cards; absent for photos from before thumbnails. */
  photoThumb?: string;
  blockReason?: string;
  queued?: boolean;
  recurrence?: Recurrence;
  routineId?: string;
  appointmentId?: string;
  appointmentTitle?: string;
  /** YYYY-MM-DD. Read back only for appointment prep tasks; on a new task, the
   * day it is planned for (addTask falls back to the board's day). */
  scheduledDate?: string;
  leadMinutes?: number; // lead offset before the appointment, in minutes
  /**
   * Set when this task's time changed: with appointmentTitle when its
   * appointment moved, with movedBy when a manager moved it by hand (O20).
   * movedFrom is "6:00 PM" / "Thu 6:00 PM".
   */
  rescheduleNotice?: { movedFrom?: string; appointmentTitle?: string; movedBy?: string };
  afterHours?: boolean;
  emergency?: boolean;
  queuedForShift?: boolean; // waiting for Rosa's next working period
  startedAt?: number;
  /** When it was finished (tickets.actual_end), for a done task. */
  finishedAt?: number;
  createdBy?: string; // display name of admin who created it
  suggested?: boolean; // pending approval by an on-site admin (used for Remote-admin picks)
  pendingSync?: boolean; // offline pending status
  /** For a cancelled task: when (ISO) and by whom (name), from the trigger's stamp. */
  cancelledAt?: string;
  cancelledBy?: string;
  /** A trip's ends (add-shared-staff-and-places.sql): a house of the family or a saved place. */
  from?: PlaceRef;
  to?: PlaceRef;
};

/**
 * A repeating task, as a series of tickets (KNOWN_GAPS.md O43,
 * supabase/add-repeating-tasks.sql): `id` is the series' routine_id, the id of
 * its first task. The rest is read off its newest task, the pattern for the
 * next day's.
 */
export type Routine = {
  id: string;
  title: string;
  /** Who it goes to: the newest task's helper that had one. null = Unassigned. */
  helperId: string | null;
  station: Station;
  time: string;
  note?: string;
  recurrence: Exclude<Recurrence, "none">;
  durationMinutes?: number;
  from?: PlaceRef;
  to?: PlaceRef;
  /** YYYY-MM-DD its newest task is for. The next one is due after it. */
  lastDay?: string;
};
