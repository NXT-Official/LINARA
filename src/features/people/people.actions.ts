import { createServerFn } from "@tanstack/react-start";
import { createClient, isAuthApiError } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { supabaseClient, createAuthedClient } from "@/lib/supabase";

// The Supabase client here isn't generated against a Database type, so
// .rpc() calls resolve to `{}` instead of the function's actual return
// row. These describe the SECURITY DEFINER functions in
// supabase/fix-claim-flow-rls-gaps.sql closely enough to type their
// results.
interface ManagerBootstrapRow {
  user_id: string;
  household_id: string;
  full_name: string;
  user_type: string;
}

interface UserProfileRow {
  id: string;
  /** NULL: a manager who left (or was removed from) their last household. */
  household_id: string | null;
  full_name: string;
  user_type: "primary_manager" | "co_manager" | "remote_admin" | "helper";
}

interface HelperProfileRow {
  id: string;
  user_id: string | null;
  household_id: string;
  name: string;
  station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
  monthly_rate: number;
  payday_interval: "semi_monthly" | "monthly";
  shift_start: string;
  shift_end: string;
  daily_break_duration: number;
  weekly_rest_day: number;
  break_start: string | null;
  break_end: string | null;
  invite_code: string | null;
  status: "PENDING_CLAIM" | "ACTIVE" | "INACTIVE";
  employment: "live-in" | "live-out" | null;
  phone: string | null;
  manual_status: "available" | "off" | null;
  manual_available_until: string | null;
  /** Per-helper rest/premium default (Session E / E2). `default_resolution` is
   * the manager's explicit choice, NULL meaning "follow employment";
   * `effective_resolution` is the generated column that resolves the two and is
   * what callers should read. supabase/add-helper-default-resolution.sql. */
  default_resolution: "rest_owed" | "premium_pay" | null;
  effective_resolution: "rest_owed" | "premium_pay" | null;
  created_at: string;
}

// Helper function to generate a legible 6-digit invite code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // High legibility alphabet
  let code = "";
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

/**
 * 1. Invite Endpoint (Server Function)
 * Generates a cryptographically secure 6-digit invitation code.
 * Creates a PENDING_CLAIM entry in helper_profiles storing the baseline wage, shift hours, and rest day.
 */
export const inviteHelperFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      name: string;
      station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
      monthlyRate: number;
      paydayInterval: "semi_monthly" | "monthly";
      shiftStart: string;
      shiftEnd: string;
      dailyBreakDuration?: number;
      weeklyRestDay: number;
      employment?: "live-in" | "live-out";
      phone?: string;
      /** Her first working day, "YYYY-MM-DD"; defaults to today in Postgres. */
      startedOn?: string;
      token: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const {
      name,
      station,
      monthlyRate,
      paydayInterval,
      shiftStart,
      shiftEnd,
      dailyBreakDuration = 60,
      weeklyRestDay,
      employment,
      phone,
      token,
    } = data;

    // A. Authenticate caller and verify they are a manager
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
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can generate helper invites");
    }

    // B. Generate 6-digit alphanumeric invite code
    const inviteCode = generateInviteCode();

    // C. Create pending helper profile entry
    const { data: helperProfile, error: insertError } = await authedClient
      .from("helper_profiles")
      .insert({
        household_id: profile.household_id,
        name,
        station,
        monthly_rate: monthlyRate,
        payday_interval: paydayInterval,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        daily_break_duration: dailyBreakDuration,
        weekly_rest_day: weeklyRestDay,
        invite_code: inviteCode,
        status: "PENDING_CLAIM",
        employment: employment ?? null,
        phone: phone ?? null,
        ...(data.startedOn ? { started_on: data.startedOn } : {}),
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertError || !helperProfile) {
      throw new Error(insertError?.message || "Failed to create helper profile");
    }

    // D. Batas Kasambahay compliance minimum wage check
    const minWage = Number(process.env.REGIONAL_MINIMUM_WAGE || "6000.00");
    if (monthlyRate < minWage) {
      // Log warning in invite_flags for manager transparency audit
      const { error: wageFlagError } = await authedClient.from("invite_flags").insert({
        invite_id: helperProfile.id,
        // Its own field so Needs You can tell this system check from a
        // helper flagging her wage ("wage").
        field: "wage_below_minimum",
        note: `Base wage of ₱${monthlyRate} is below the regional minimum wage limit of ₱${minWage}.`,
      });
      if (wageFlagError) {
        console.error(
          "[inviteHelperFn] Failed to log wage compliance flag:",
          wageFlagError.message,
        );
      }
    }

    return {
      helperId: helperProfile.id,
      inviteCode,
      status: "PENDING_CLAIM",
    };
  });

/**
 * The household's IANA time zone (households.timezone), so the dashboard
 * shows and enters task times in the house's time wherever the manager is
 * (KNOWN_GAPS.md O9). null if it can't be read; the client then keeps using
 * the device's zone.
 */
export async function householdTimeZoneOf(
  client: ReturnType<typeof createAuthedClient>,
  householdId: string | null,
): Promise<string | null> {
  if (!householdId) return null;
  const { data } = await client
    .from("households")
    .select("timezone")
    .eq("id", householdId)
    .maybeSingle();
  return (data?.timezone as string | undefined) ?? null;
}

/**
 * 5. Manager Sign-Up Endpoint (Server Function)
 * Registers a brand-new manager and bootstraps their own household via
 * bootstrap_manager_household() (supabase/add-manager-bootstrap.sql), which
 * sidesteps the same current_household_id() bootstrap deadlock that
 * claim_helper_invite() solves for helpers.
 */
export const managerSignUpFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      fullName: string;
      householdName?: string;
      email: string;
      password: string;
      /** Where the confirmation email's link lands (/email-confirmed on this site). */
      emailRedirectTo?: string;
      /** A manager invite code: join that household instead of starting one. */
      inviteCode?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { fullName, householdName, email, password, emailRedirectTo, inviteCode } = data;

    // Without emailRedirectTo the link goes to Supabase's Site URL setting,
    // which pointed at a retired deployment (404). It must also be listed in
    // Supabase Auth > URL Configuration > Redirect URLs, or Supabase ignores it.
    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });

    if (signUpError && signUpError.code !== "user_already_exists") {
      throw new Error(signUpError.message);
    }

    let session = signUpData?.session ?? null;

    if (!session) {
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword(
        {
          email,
          password,
        },
      );

      if (signInError) {
        if (signInError.code === "email_not_confirmed") {
          return { status: "confirmation_pending" as const };
        }
        throw new Error(signInError.message);
      }
      session = signInData.session;
    }

    if (!session) {
      return { status: "confirmation_pending" as const };
    }

    const authedClient = createAuthedClient(session.access_token);
    if (inviteCode) {
      const { data: claimed, error: claimError } = await authedClient
        .rpc("claim_manager_invite", { p_code: inviteCode, p_full_name: fullName })
        .maybeSingle();
      const row = claimed as { household_id: string; user_type: string } | null;
      if (claimError || !row) {
        throw new Error(claimError?.message || "Couldn't join with that code");
      }
      return {
        status: "authed" as const,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: signUpData?.user?.id ?? session.user.id,
        householdId: row.household_id,
        fullName,
        userType: row.user_type,
        timeZone: await householdTimeZoneOf(authedClient, row.household_id),
      };
    }

    const { data: bootstrapData, error: bootstrapError } = await authedClient
      .rpc("bootstrap_manager_household", {
        p_full_name: fullName,
        p_household_name: householdName ?? null,
      })
      .maybeSingle();
    const bootstrap = bootstrapData as ManagerBootstrapRow | null;

    if (bootstrapError || !bootstrap) {
      throw new Error(bootstrapError?.message || "Failed to set up household");
    }

    return {
      status: "authed" as const,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: bootstrap.user_id,
      householdId: bootstrap.household_id,
      fullName: bootstrap.full_name,
      userType: bootstrap.user_type,
      timeZone: await householdTimeZoneOf(authedClient, bootstrap.household_id),
    };
  });

/**
 * 6. Manager Log-In Endpoint (Server Function)
 * Signs an existing manager in. If this is their first successful login
 * after confirming their email (signup never got to bootstrap because
 * there was no session yet), reports needs_bootstrap instead of failing.
 */
export const managerLoginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;

    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      if (signInError.code === "email_not_confirmed") {
        return { status: "confirmation_pending" as const };
      }
      throw new Error(signInError.message);
    }

    const session = signInData.session;
    if (!session || !signInData.user) {
      throw new Error("Login failed");
    }

    const authedClient = createAuthedClient(session.access_token);
    const { data: profileData, error: profileError } = await authedClient
      .from("user_profiles")
      .select("*")
      .eq("id", signInData.user.id)
      .maybeSingle();
    const profile = profileData as UserProfileRow | null;

    if (profileError) {
      throw new Error(profileError.message);
    }

    // No profile, or a manager in no household now: set one up or join one.
    if (!profile || (profile.user_type !== "helper" && !profile.household_id)) {
      return {
        status: "needs_bootstrap" as const,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: signInData.user.id,
      };
    }

    // One sign-in for everyone: a kasambahay is told her Linara is in the
    // app, rather than refused. No tokens go back, so no web session starts.
    if (profile.user_type === "helper") {
      return { status: "helper" as const };
    }

    return {
      status: "authed" as const,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: profile.id,
      householdId: profile.household_id,
      fullName: profile.full_name,
      userType: profile.user_type,
      timeZone: await householdTimeZoneOf(authedClient, profile.household_id),
    };
  });

/**
 * 6b. Refresh Manager Session Endpoint (Server Function)
 * Trades the stored refresh token for a new access token before the old one
 * (about an hour) runs out -- KNOWN_GAPS.md C75. A throwaway client, like
 * completePasswordResetFn's, so the session never lingers server-side.
 * "expired" means Supabase refused the refresh token (signed out, revoked,
 * already used): the manager has to log in again. Anything else throws,
 * and the caller can try again later.
 */
export const refreshManagerSessionFn = createServerFn({ method: "POST" })
  .validator((data: { refreshToken: string }) => data)
  .handler(async ({ data }) => {
    const client = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_ANON_KEY || "",
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    const { data: refreshed, error } = await client.auth.refreshSession({
      refresh_token: data.refreshToken,
    });
    // 4xx is a refusal; 5xx and rate limits (429) are worth another try.
    if (error && isAuthApiError(error) && error.status >= 400 && error.status < 500) {
      if (error.status !== 429) return { status: "expired" as const };
    }
    if (error || !refreshed.session) {
      throw new Error(error?.message || "Couldn't refresh the session");
    }
    return {
      status: "ok" as const,
      accessToken: refreshed.session.access_token,
      refreshToken: refreshed.session.refresh_token,
    };
  });

/**
 * 7. Finish Bootstrap Endpoint (Server Function)
 * Called at first-login when managerLoginFn/getManagerProfileFn reports
 * needs_bootstrap -- reuses the same RPC signup would have called, just
 * triggered at login time instead.
 */
export const finishBootstrapFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; fullName: string; householdName?: string }) => data)
  .handler(async ({ data }) => {
    const { token, fullName, householdName } = data;

    const authedClient = createAuthedClient(token);
    const { data: bootstrapData, error: bootstrapError } = await authedClient
      .rpc("bootstrap_manager_household", {
        p_full_name: fullName,
        p_household_name: householdName ?? null,
      })
      .maybeSingle();
    const bootstrap = bootstrapData as ManagerBootstrapRow | null;

    if (bootstrapError || !bootstrap) {
      throw new Error(bootstrapError?.message || "Failed to set up household");
    }

    return {
      userId: bootstrap.user_id,
      householdId: bootstrap.household_id,
      fullName: bootstrap.full_name,
      userType: bootstrap.user_type,
      timeZone: await householdTimeZoneOf(authedClient, bootstrap.household_id),
    };
  });

/**
 * 8. Get Manager Profile Endpoint (Server Function)
 * Session rehydration on page load/refresh -- validates a stored token and
 * re-fetches the profile it belongs to.
 */
export const getManagerProfileFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Session expired");
    }

    const { data: profileData, error: profileError } = await authedClient
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    const profile = profileData as UserProfileRow | null;

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!profile || (profile.user_type !== "helper" && !profile.household_id)) {
      return { status: "needs_bootstrap" as const, userId: user.id };
    }

    if (profile.user_type === "helper") {
      throw new Error(
        "This is a helper account. Helpers sign in on the Linara app's own sign-in screen, not on the manager dashboard.",
      );
    }

    return {
      status: "authed" as const,
      userId: profile.id,
      householdId: profile.household_id,
      fullName: profile.full_name,
      userType: profile.user_type,
      timeZone: await householdTimeZoneOf(authedClient, profile.household_id),
    };
  });

/**
 * 9. List Helper Profiles Endpoint (Server Function)
 * Powers the People roster. RLS's existing helper_profiles_isolation
 * already scopes this to the caller's own household once they have a real
 * user_profiles row, so this is a plain authenticated select -- no RPC
 * needed.
 */
export const listHelperProfilesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("helper_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as HelperProfileRow[];
  });

export type InviteFlagRow = {
  id: string;
  invite_id: string;
  field: string;
  note: string | null;
  created_at: string;
};

/**
 * Every flag on this household's helpers: ones a helper raised while
 * claiming (flag_invite), ones she raises later from My Record in
 * LINARA_MOBILE, and the invite-time minimum-wage check. A separate query
 * rather than an embed because invite_flags.invite_id carries no declared
 * foreign key. RLS (invite_flags_isolation) scopes it to the household.
 */
export const listInviteFlagsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: rows, error } = await authedClient
      .from("invite_flags")
      .select("id, invite_id, field, note, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    return (rows ?? []) as InviteFlagRow[];
  });

/** "Mark resolved" in Needs You: removes the flag for good, not just from this tab. */
export const resolveInviteFlagFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; flagId: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { error } = await authedClient.from("invite_flags").delete().eq("id", data.flagId);

    if (error) {
      throw new Error(error.message);
    }
    return { flagId: data.flagId };
  });

/**
 * 10. Cancel Invite Endpoint (Server Function)
 * Deletes a still-pending invite. Restricted to PENDING_CLAIM so a manager
 * can't accidentally delete an already-active helper's profile through
 * this path; covered by the existing household-scoped RLS policy.
 */
export const cancelInviteFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string }) => data)
  .handler(async ({ data }) => {
    const { token, helperId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("helper_profiles")
      .delete()
      .eq("id", helperId)
      .eq("status", "PENDING_CLAIM");

    if (error) {
      throw new Error(error.message);
    }

    return { helperId };
  });

/** What ending an employment on a given day would do -- see
 * employment_end_preview in supabase/add-employment-end.sql. */
export interface EmploymentEndPreview {
  /** Why that day can't be her last one, or null if it can. */
  problem: "not_active" | "future" | "before_start" | "already_paid_past" | null;
  today: string;
  startedOn: string;
  latestPaidCutoffEnd: string | null;
  finalCutoffStart: string;
  finalCutoffEnd: string;
  fullCutoffStart: string;
  fullCutoffEnd: string;
  finalCutoffPaid: boolean;
  /** Closed periods before her final one with no payment of either kind. */
  unpaidPeriods: number;
  openTasks: number;
  pendingVales: number;
  unsettledValeTotal: number;
  /** Unpaid leave her final pay would take (add-unpaid-leave-pay.sql). */
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  pendingRestOff: number;
  futureRestOff: number;
  restOwedMinutes: number;
  basePaidThisYear: number;
}

export const employmentEndPreviewFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; lastDay: string }) => data)
  .handler(async ({ data }): Promise<EmploymentEndPreview> => {
    const authedClient = createAuthedClient(data.token);
    const { data: raw, error } = await authedClient.rpc("employment_end_preview", {
      p_helper_id: data.helperId,
      p_last_day: data.lastDay,
    });
    if (error || !raw) {
      throw new Error(error?.message || "Failed to preview the end of employment");
    }
    const r = raw as Record<string, unknown>;
    return {
      problem: (r.problem as EmploymentEndPreview["problem"]) ?? null,
      today: r.today as string,
      startedOn: r.started_on as string,
      latestPaidCutoffEnd: (r.latest_paid_cutoff_end as string | null) ?? null,
      finalCutoffStart: r.final_cutoff_start as string,
      finalCutoffEnd: r.final_cutoff_end as string,
      // Before add-pay-periods.sql the preview had no full start; the final
      // cutoff's start was the full one then.
      fullCutoffStart:
        (r.full_cutoff_start as string | undefined) ?? (r.final_cutoff_start as string),
      fullCutoffEnd: r.full_cutoff_end as string,
      finalCutoffPaid: Boolean(r.final_cutoff_paid),
      // Before add-pay-periods.sql only the cutoff right before was checked.
      unpaidPeriods: Number(r.unpaid_periods ?? (r.previous_cutoff_unpaid ? 1 : 0)),
      openTasks: Number(r.open_tasks ?? 0),
      pendingVales: Number(r.pending_vales ?? 0),
      unsettledValeTotal: Number(r.unsettled_vale_total ?? 0),
      unpaidLeaveDays: Number(r.unpaid_leave_days ?? 0),
      unpaidLeaveDeduction: Number(r.unpaid_leave_deduction ?? 0),
      pendingRestOff: Number(r.pending_rest_off ?? 0),
      futureRestOff: Number(r.future_rest_off ?? 0),
      restOwedMinutes: Number(r.rest_owed_minutes ?? 0),
      basePaidThisYear: Number(r.base_paid_this_year ?? 0),
    };
  });

/**
 * Ends an employment (KNOWN_GAPS.md O4): the helper goes INACTIVE with her
 * last day recorded, her open tasks move to `reassignTo` or are removed, and
 * her account is detached from the household. Everything she did stays on
 * record. Manager-only, enforced inside end_helper_employment.
 */
export const endEmploymentFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; helperId: string; lastDay: string; reassignTo: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: raw, error } = await authedClient.rpc("end_helper_employment", {
      p_helper_id: data.helperId,
      p_last_day: data.lastDay,
      p_reassign_to: data.reassignTo,
    });
    if (error || !raw) {
      throw new Error(error?.message || "Failed to end the employment");
    }
    const r = raw as Record<string, unknown>;
    return { tasksMoved: Number(r.tasks_moved ?? 0), tasksRemoved: Number(r.tasks_removed ?? 0) };
  });

/**
 * 11. Update Helper Schedule Endpoint (Server Function)
 * Powers the Shifts editor. helper_profiles_isolation is household-scoped
 * with no per-row ownership check, so an authenticated manager can already
 * update any helper's row in their own household -- no new RLS policy
 * needed, see supabase/add-shift-break-columns.sql.
 */
export const updateHelperScheduleFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      helperId: string;
      shiftStart: string;
      shiftEnd: string;
      weeklyRestDay: number;
      breakStart?: string | null;
      breakEnd?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, helperId, shiftStart, shiftEnd, weeklyRestDay, breakStart, breakEnd } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("helper_profiles")
      .update({
        shift_start: shiftStart,
        shift_end: shiftEnd,
        weekly_rest_day: weeklyRestDay,
        break_start: breakStart ?? null,
        break_end: breakEnd ?? null,
      })
      .eq("id", helperId);

    if (error) {
      throw new Error(error.message);
    }

    return { helperId };
  });

/**
 * 12. Update Helper Wage Endpoint (Server Function)
 * The only place `helper_profiles.monthly_rate` could be set was
 * inviteHelperFn, at invite creation -- nothing let a manager adjust it
 * afterward (a raise, or fixing a typo'd wage). Unlike
 * updateHelperScheduleFn, this is explicitly manager-gated in the function
 * body (same role-check pattern as updateHouseholdBudgetFn/decideValeFn):
 * wage is more sensitive than a shift window, so it shouldn't rely on
 * household-scoped RLS alone the way the schedule editor does.
 */
export const updateHelperWageFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; monthlyRate: number }) => data)
  .handler(async ({ data }) => {
    const { token, helperId, monthlyRate } = data;

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
      throw new Error("Forbidden: Only managers can change a helper's wage");
    }

    const { error } = await authedClient
      .from("helper_profiles")
      .update({ monthly_rate: monthlyRate })
      .eq("id", helperId);

    if (error) {
      throw new Error(error.message);
    }

    return { helperId, monthlyRate };
  });

/**
 * Who keeps the pantry: "lead" (in charge of stock and the palengke list) or
 * "runner" (buys what's on it). Client feedback 2026-10-02. Manager-gated
 * here like the wage; the database also keeps a helper from changing her own
 * (helper_profiles_guard_own_update), and enforces what each can do
 * (supabase/add-pantry-roles.sql).
 */
export const updateHelperPantryRoleFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; pantryRole: "lead" | "runner" }) => {
    if (data.pantryRole !== "lead" && data.pantryRole !== "runner") {
      throw new Error("Unknown pantry role");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { token, helperId, pantryRole } = data;

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
      throw new Error("Forbidden: Only managers can change who keeps the pantry");
    }

    const { error } = await authedClient
      .from("helper_profiles")
      .update({ pantry_role: pantryRole })
      .eq("id", helperId);

    if (error) {
      throw new Error(error.message);
    }

    return { helperId, pantryRole };
  });

/**
 * 13. Request Password Reset Endpoint (Server Function)
 * Shared by managers (web /login) and helpers (LINARA_MOBILE sign-in, which
 * calls Supabase directly with the same redirect). Supabase only sends mail
 * to redirect URLs on the project's Auth allow-list, and never reveals
 * whether the address has an account -- neither does this.
 */
export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; redirectTo: string }) => data)
  .handler(async ({ data }) => {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(data.email.trim(), {
      redirectTo: data.redirectTo,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { sent: true };
  });

/**
 * 14. Complete Password Reset Endpoint (Server Function)
 * Takes the recovery session from the emailed link's URL fragment and sets
 * the new password. Uses a throwaway client rather than the shared
 * `supabaseClient`, so the recovery session never lingers in a module-level
 * client that later requests reuse.
 */
export const completePasswordResetFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; refreshToken: string; password: string }) => data)
  .handler(async ({ data }) => {
    if (data.password.length < 6) {
      throw new Error("Dapat may kahit anim (6) na characters ang password.");
    }
    const client = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_ANON_KEY || "",
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { error: sessionError } = await client.auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    if (sessionError) {
      throw new Error("Expired na ang reset link. Humingi ng bago.");
    }
    const { error } = await client.auth.updateUser({ password: data.password });
    if (error) {
      if (error.code === "same_password") {
        throw new Error("Iba dapat ang bagong password sa dati mong password.");
      }
      if (error.code === "weak_password") {
        throw new Error(`Masyadong mahina ang password. ${error.message}`);
      }
      throw new Error(error.message);
    }
    await client.auth.signOut({ scope: "local" });
    return { updated: true };
  });

export interface AccountDeletionRequest {
  id: string;
  status: "pending" | "cancelled" | "done";
  requestedAt: string;
}

interface AccountDeletionRow {
  id: string;
  status: AccountDeletionRequest["status"];
  requested_at: string;
}

const toDeletionRequest = (row: AccountDeletionRow): AccountDeletionRequest => ({
  id: row.id,
  status: row.status,
  requestedAt: row.requested_at,
});

/**
 * The signed-in manager's pending account-deletion request, if any
 * (supabase/add-account-deletion.sql, KNOWN_GAPS.md O8). null before that
 * migration is applied, so the People page still loads.
 */
export const getAccountDeletionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: row, error } = await authedClient
      .from("account_deletion_requests")
      .select("id, status, requested_at")
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      if (/account_deletion_requests/.test(error.message)) return null;
      throw new Error(error.message);
    }
    return row ? toDeletionRequest(row as AccountDeletionRow) : null;
  });

/** Asks for this account to be deleted. Processed by hand within 30 days. */
export const requestAccountDeletionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; note?: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: row, error } = await authedClient
      .rpc("request_account_deletion", { p_note: data.note ?? null })
      .single();
    if (error || !row) {
      throw new Error(error?.message || "Couldn't send the request");
    }
    return toDeletionRequest(row as AccountDeletionRow);
  });

/** Withdraws a pending deletion request; the account carries on as before. */
export const cancelAccountDeletionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { error } = await authedClient.rpc("cancel_account_deletion");
    if (error) {
      throw new Error(error.message);
    }
    return { cancelled: true };
  });
