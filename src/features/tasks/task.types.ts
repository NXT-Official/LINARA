import type { Station } from "@/features/people/people.types";
import type { Weekday } from "@/lib/time";

/** "cancelled" (add-cancelled-tasks.sql): kept for the record, off the board and every to-do count. */
export type Status = "todo" | "in_progress" | "done" | "blocked" | "cancelled";
export type Recurrence = "none" | "daily" | Weekday[];

export type Task = {
  id: string;
  title: string;
  note?: string;
  time: string;
  scheduledStart?: string; // ISO, tickets.scheduled_start -- the real instant behind `time`
  /** null = Unassigned (supabase/add-unassigned-tasks.sql): on the managers' board only. */
  helperId: string | null;
  station: Station;
  status: Status;
  photo?: string;
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
};

// A recurring template that spawns a Task on matching weekdays.
export type Routine = {
  id: string;
  title: string;
  helperId: string;
  station: Station;
  time: string;
  note?: string;
  recurrence: Exclude<Recurrence, "none">;
};
