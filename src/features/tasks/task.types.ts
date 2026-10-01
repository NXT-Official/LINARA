import type { Station } from "@/features/people/people.types";
import type { Weekday } from "@/lib/time";

export type Status = "todo" | "in_progress" | "done" | "blocked";
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
  scheduledDate?: string; // YYYY-MM-DD, for appointment prep tasks
  leadMinutes?: number; // lead offset before the appointment, in minutes
  /** Set when an appointment move shifted this task; movedFrom is "6:00 PM" / "Thu 6:00 PM". */
  rescheduleNotice?: { movedFrom?: string; appointmentTitle: string };
  afterHours?: boolean;
  emergency?: boolean;
  queuedForShift?: boolean; // waiting for Rosa's next working period
  startedAt?: number;
  createdBy?: string; // display name of admin who created it
  suggested?: boolean; // pending approval by an on-site admin (used for Remote-admin picks)
  pendingSync?: boolean; // offline pending status
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
