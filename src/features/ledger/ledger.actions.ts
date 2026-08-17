import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { LedgerReason, LedgerResolution } from "./ledger.types";
import { RESOLUTION_TO_RESOLUTION_TYPE, RESOLUTION_TYPE_TO_RESOLUTION } from "./ledger.utils";

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

// Re-exported so existing importers keep working. They must NOT be DEFINED in
// this file: it imports createAuthedClient, so anything reaching for a mapping
// would pull a Supabase client into its import graph -- which is exactly what
// broke when people.utils.ts started needing them (Session E / E2).
export { RESOLUTION_TO_RESOLUTION_TYPE, RESOLUTION_TYPE_TO_RESOLUTION };

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
 *
 * `resolution` is OPTIONAL and normally omitted (Session E / E2). Left out,
 * Postgres fills `resolution_type` from THIS HELPER's own default -- the
 * ledger_entries_default_resolution trigger reading
 * helper_profiles.effective_resolution. Previously this was always supplied by
 * the caller from a single `useState` in use-ledger.ts: household-wide,
 * ephemeral, reset on reload, and not keyed to a helper at all, so in a
 * two-helper household one shared toggle classified both workers' off-shift
 * work (MULTI_HELPER_HANDLING.md's failure mode, and the last gap against
 * home-management-concept.md's "flexible per worker").
 *
 * Pass it only to override a SINGLE entry against that default.
 */
export const insertLedgerEntryFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      helperId: string;
      title: string;
      kind: "task" | "utos";
      reason: LedgerReason;
      /** Omit to use the helper's own default; set only to override this entry. */
      resolution?: LedgerResolution;
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
        // undefined -> column omitted -> the trigger fills it per helper. Do
        // not "helpfully" default this to 'rest_owed' here; that would put the
        // rule back in the client, one app of two.
        resolution_type: resolution ? RESOLUTION_TO_RESOLUTION_TYPE[resolution] : undefined,
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

/**
 * Sets (or clears) a helper's own rest-vs-premium default -- Session E / E2,
 * closing home-management-concept.md's "keep the resolution type flexible per
 * worker", which until now was a household-wide `useState` that reset on
 * reload.
 *
 * `resolution: null` clears the explicit choice and returns the helper to
 * following their `employment` type ('live-out' -> premium, otherwise rest).
 * That is a real state, not a missing value, which is why the column is
 * nullable rather than seeded: a seeded snapshot would leave a helper switched
 * from live-in to live-out sitting on the old answer forever.
 *
 * Manager-gated inside `set_helper_default_resolution` itself, not here --
 * `helper_profiles_isolation` is FOR ALL across the household, so without the
 * RPC a HELPER could rewrite her own terms by writing the table directly. Same
 * posture as initiate_payslip and decide_rest_off_request.
 */
export const setHelperDefaultResolutionFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; helperId: string; resolution: LedgerResolution | null }) => data,
  )
  .handler(async ({ data }) => {
    const { token, helperId, resolution } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient.rpc("set_helper_default_resolution", {
      p_helper_id: helperId,
      p_resolution: resolution ? RESOLUTION_TO_RESOLUTION_TYPE[resolution] : null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = rows?.[0];
    return {
      defaultResolution:
        RESOLUTION_TYPE_TO_RESOLUTION[(row?.default_resolution as string) ?? ""] ?? null,
      effectiveResolution:
        RESOLUTION_TYPE_TO_RESOLUTION[(row?.effective_resolution as string) ?? ""] ?? "rest",
    };
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
