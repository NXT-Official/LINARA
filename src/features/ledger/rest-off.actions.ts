import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

/**
 * Rest-off requests: the helper's route to actually *redeem* accrued rest
 * owed. After-hours work is time, not money (user decision 2026-08-16 --
 * live-in kasambahay are not paid hourly overtime, so off-hours work is
 * balanced by time-off-in-lieu). The kasambahay asks for a date and a time
 * range from LINARA_MOBILE; a manager approves here; the approved minutes are
 * debited from the balance.
 *
 * All three calls go through SECURITY DEFINER RPCs
 * (supabase/add-rest-off-requests.sql) rather than plain table writes, because
 * the balance check has to happen under a lock on the helper -- two managers
 * approving different requests would otherwise both pass an unlocked check and
 * overdraw. Same discipline as initiate_payslip.
 */
export interface RestOffRequestRow {
  id: string;
  helper_id: string;
  rest_date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  decline_reason: string | null;
  decided_at: string | null;
  created_at: string;
}

/** Every rest-off request in the household. RLS scopes it via helper_profiles. */
export const listRestOffRequestsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: rows, error } = await authedClient
      .from("rest_off_requests")
      .select("*")
      .order("rest_date", { ascending: false });

    if (error) throw new Error(error.message);
    return (rows ?? []) as RestOffRequestRow[];
  });

/**
 * The helper's redeemable balance in minutes: accrued ledger minutes minus
 * already-approved rest off. Read from Postgres rather than summed here, so
 * the manager's number, the helper's number, and the number the approval guard
 * enforces are all literally the same function -- the "surfaced to both sides
 * as the same number" requirement.
 */
export const getRestOwedBalanceFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: minutes, error } = await authedClient.rpc("rest_owed_balance_minutes", {
      p_helper_id: data.helperId,
    });

    if (error) throw new Error(error.message);
    return { minutes: Number(minutes ?? 0) };
  });

/** Approve or decline. Manager-gated inside the RPC. */
export const decideRestOffRequestFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      requestId: string;
      decision: "approved" | "declined";
      declineReason?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: rows, error } = await authedClient.rpc("decide_rest_off_request", {
      p_request_id: data.requestId,
      p_decision: data.decision,
      p_decline_reason: data.declineReason ?? null,
    });

    if (error) throw new Error(error.message);

    const row = rows?.[0];
    return {
      status: (row?.resulting_status ?? data.decision) as "approved" | "declined",
      balanceAfter: Number(row?.balance_after ?? 0),
    };
  });
