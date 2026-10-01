import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { LeaveBalance, LeaveKind, LeaveReason, LeaveRequest } from "./leave.types";

/**
 * Leave (supabase/add-leave.sql). Reads are plain selects under RLS; every
 * write is one of the SECURITY DEFINER functions, which check who's asking,
 * lock her helper_profiles row and apply the same rules (balances, overlaps,
 * dates) whichever app calls them. Their error messages are written to be
 * shown as they are.
 */

interface LeaveRow {
  id: string;
  helper_id: string;
  kind: LeaveKind;
  reason: LeaveReason;
  start_date: string;
  end_date: string;
  days: number;
  minutes: number;
  note: string | null;
  status: LeaveRequest["status"];
  decline_reason: string | null;
  helper_ack: LeaveRequest["helperAck"];
  helper_ack_note: string | null;
}

const toLeave = (r: LeaveRow): LeaveRequest => ({
  id: r.id,
  helperId: r.helper_id,
  kind: r.kind,
  reason: r.reason,
  startDate: r.start_date,
  endDate: r.end_date,
  days: r.days,
  minutes: r.minutes,
  note: r.note,
  status: r.status,
  declineReason: r.decline_reason,
  helperAck: r.helper_ack,
  helperAckNote: r.helper_ack_note,
});

/** Every leave request in the household, newest first. */
export const listLeaveFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("leave_requests")
      .select(
        "id, helper_id, kind, reason, start_date, end_date, days, minutes, note, status, decline_reason, helper_ack, helper_ack_note",
      )
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as LeaveRow[]).map(toLeave);
  });

/** SIL left and rest owed, per helper, from the functions the approval checks use. */
export const getLeaveBalancesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperIds: string[] }) => data)
  .handler(async ({ data }): Promise<LeaveBalance[]> => {
    const client = createAuthedClient(data.token);
    const { data: today, error: todayError } = await client.rpc("household_today");
    if (todayError) throw new Error(todayError.message);

    return Promise.all(
      data.helperIds.map(async (helperId) => {
        const [sil, year, rest] = await Promise.all([
          client.rpc("sil_balance_days", { p_helper_id: helperId }),
          client.rpc("sil_service_year", { p_helper_id: helperId, p_on: today }),
          client.rpc("rest_owed_balance_minutes", { p_helper_id: helperId }),
        ]);
        const err = sil.error ?? year.error ?? rest.error;
        if (err) throw new Error(err.message);
        const y = (
          year.data as { year_end: string; eligible: boolean; eligible_from: string }[] | null
        )?.[0];
        return {
          helperId,
          silDays: Number(sil.data ?? 0),
          silEligibleFrom: y?.eligible_from ?? null,
          silYearEnd: y?.eligible ? y.year_end : null,
          restOwedMinutes: Number(rest.data ?? 0),
        };
      }),
    );
  });

export const decideLeaveFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      requestId: string;
      decision: "approved" | "declined";
      declineReason?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("decide_leave_request", {
      p_request_id: data.requestId,
      p_decision: data.decision,
      p_decline_reason: data.declineReason ?? null,
    });
    if (error) throw new Error(error.message);
  });

/** A manager records leave for her (she called in sick): approved at once; she confirms it in her app. */
export const recordLeaveFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      helperId: string;
      kind: LeaveKind;
      reason: LeaveReason;
      startDate: string;
      endDate: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("record_leave", {
      p_helper_id: data.helperId,
      p_kind: data.kind,
      p_reason: data.reason,
      p_start: data.startDate,
      p_end: data.endDate,
      p_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
  });

export const cancelLeaveFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; requestId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("cancel_leave_request", { p_request_id: data.requestId });
    if (error) throw new Error(error.message);
  });

/** The unpaid-leave divisor: 365, 313 or 261 (the column's CHECK refuses anything else). */
export const setPayDaysPerYearFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; payDaysPerYear: 365 | 313 | 261 }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client
      .from("helper_profiles")
      .update({ pay_days_per_year: data.payDaysPerYear })
      .eq("id", data.helperId);
    if (error) throw new Error(error.message);
  });
