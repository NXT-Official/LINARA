import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { LedgerReason, LedgerResolution } from "./ledger.types";

// LedgerReason (5 values) -> ledger_entries.source_type (4 values, CHECK
// constraint). "available" and "override" both collapse to "overtime" --
// both mean "worked outside shift, not a rest day/break, not an emergency,"
// and overtime is the only remaining catch-all value.
const REASON_TO_SOURCE_TYPE: Record<LedgerReason, string> = {
  available: "overtime",
  override: "overtime",
  emergency: "emergency",
  rest_day: "rest_day_work",
  rest_break: "rest_break_work",
};

// Reverse mapping is lossy for "overtime" (available/override are no longer
// distinguishable once written) -- "override" is picked since both produce
// the same generic "After shift" badge in reasonLabel() (ledger.utils.ts).
// Exported so use-ledger.ts's row -> LedgerEntry mapping can reuse it.
export const SOURCE_TYPE_TO_REASON: Record<string, LedgerReason> = {
  overtime: "override",
  emergency: "emergency",
  rest_day_work: "rest_day",
  rest_break_work: "rest_break",
};

const RESOLUTION_TO_RESOLUTION_TYPE: Record<LedgerResolution, string> = {
  rest: "rest_owed",
  premium: "premium_pay",
};

export const RESOLUTION_TYPE_TO_RESOLUTION: Record<string, LedgerResolution> = {
  rest_owed: "rest",
  premium_pay: "premium",
};

export interface LedgerEntryRow {
  id: string;
  helper_id: string;
  source_type: string;
  title: string;
  kind: string;
  duration_minutes: number;
  adjust_minutes: number;
  resolution_type: string | null;
  created_at: string;
}

/**
 * Lists every ledger entry in the caller's household, scoped the same way as
 * listValesFn (a join through helper_profiles -- ledger_entries has no
 * household_id column of its own).
 */
export const listLedgerEntriesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("ledger_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as LedgerEntryRow[];
  });

/**
 * Records an after-hours completion. "resolved" has no defined product
 * meaning yet (see KNOWN_GAPS.md gap #5) -- treated as a no-op and always set
 * true, matching today's UI, which has no unresolved state at all.
 * `doneTsIso` is passed explicitly (not left to the DB's NOW() default)
 * because the app clock can run on a simulated offset (see use-sim-clock.ts)
 * that may not match the server's real wall-clock time.
 */
export const insertLedgerEntryFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      helperId: string;
      title: string;
      kind: "task" | "utos";
      reason: LedgerReason;
      resolution: LedgerResolution;
      autoMinutes: number;
      doneTsIso: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, helperId, title, kind, reason, resolution, autoMinutes, doneTsIso } = data;

    const authedClient = createAuthedClient(token);
    const { data: row, error } = await authedClient
      .from("ledger_entries")
      .insert({
        helper_id: helperId,
        source_type: REASON_TO_SOURCE_TYPE[reason],
        title,
        kind,
        duration_minutes: autoMinutes,
        resolved: true,
        resolution_type: RESOLUTION_TO_RESOLUTION_TYPE[resolution],
        resolved_at: doneTsIso,
        created_at: doneTsIso,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to record ledger entry");
    }

    return { id: row.id as string };
  });

/**
 * Adjusts an existing entry's manual minutes and/or rest/premium resolution
 * (the two fields AfterHoursLedger lets a manager edit).
 */
export const updateLedgerEntryFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      entryId: string;
      adjustMinutes?: number;
      resolution?: LedgerResolution;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, entryId, adjustMinutes, resolution } = data;

    const patch: Record<string, unknown> = {};
    if (adjustMinutes !== undefined) patch.adjust_minutes = adjustMinutes;
    if (resolution !== undefined) patch.resolution_type = RESOLUTION_TO_RESOLUTION_TYPE[resolution];

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("ledger_entries").update(patch).eq("id", entryId);

    if (error) {
      throw new Error(error.message);
    }

    return { entryId };
  });

export interface ValeRow {
  id: string;
  helper_id: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "declined";
  approved_by: string | null;
  settled_in_payslip_id: string | null;
  created_at: string;
}

/**
 * Lists every vale request in the caller's household. `vales_isolation`
 * (architecture.md Section 8) scopes this via a join through helper_profiles --
 * no household_id column on `vales` itself, and no explicit filter needed here,
 * same pattern as listHelperProfilesFn.
 */
export const listValesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("vales")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as ValeRow[];
  });

/**
 * Records a cash-advance request. `vales_isolation`'s WITH CHECK already
 * restricts helperId to a helper_profiles row in the caller's own household --
 * no manual role check needed, since either a manager or a claimed helper's own
 * token may legitimately request one.
 */
export const insertValeFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; amount: number; reason: string }) => data)
  .handler(async ({ data }) => {
    const { token, helperId, amount, reason } = data;

    const authedClient = createAuthedClient(token);
    const { data: row, error } = await authedClient
      .from("vales")
      .insert({ helper_id: helperId, amount, reason, status: "pending" })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to submit vale request");
    }

    return { id: row.id as string };
  });

/**
 * Approves or declines a pending vale request. Restricted to managers, unlike
 * insertValeFn -- deciding on someone else's request is a manager action, not
 * something RLS alone should gate.
 */
export const decideValeFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; valeId: string; decision: "approved" | "declined" }) => data)
  .handler(async ({ data }) => {
    const { token, valeId, decision } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("user_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can decide vale requests");
    }

    const { error } = await authedClient
      .from("vales")
      .update({ status: decision, approved_by: user.id })
      .eq("id", valeId);

    if (error) {
      throw new Error(error.message);
    }

    return { valeId };
  });
