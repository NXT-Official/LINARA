import { createServerFn } from "@tanstack/react-start";
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
  household_id: string;
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
        field: "wage",
        note: `Base wage of ₱${monthlyRate} is below the regional minimum wage limit of ₱${minWage}.`,
      });
      if (wageFlagError) {
        console.error(
          "[inviteHelperFn] Failed to log wage compliance flag:",
          wageFlagError.message,
        );
      }
    }

    const inviteUrl = `/claim?code=${inviteCode}`;

    return {
      helperId: helperProfile.id,
      inviteCode,
      inviteUrl,
      status: "PENDING_CLAIM",
    };
  });

/**
 * 5. Manager Sign-Up Endpoint (Server Function)
 * Registers a brand-new manager and bootstraps their own household via
 * bootstrap_manager_household() (supabase/add-manager-bootstrap.sql), which
 * sidesteps the same current_household_id() bootstrap deadlock that
 * claim_helper_invite() solves for helpers.
 */
export const managerSignUpFn = createServerFn({ method: "POST" })
  .validator(
    (data: { fullName: string; householdName?: string; email: string; password: string }) => data,
  )
  .handler(async ({ data }) => {
    const { fullName, householdName, email, password } = data;

    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
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

    if (!profile) {
      return {
        status: "needs_bootstrap" as const,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: signInData.user.id,
      };
    }

    if (profile.user_type === "helper") {
      throw new Error("This is a helper account — use the Worker's Station app instead.");
    }

    return {
      status: "authed" as const,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: profile.id,
      householdId: profile.household_id,
      fullName: profile.full_name,
      userType: profile.user_type,
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

    if (!profile) {
      return { status: "needs_bootstrap" as const, userId: user.id };
    }

    if (profile.user_type === "helper") {
      throw new Error("This is a helper account — use the Worker's Station app instead.");
    }

    return {
      status: "authed" as const,
      userId: profile.id,
      householdId: profile.household_id,
      fullName: profile.full_name,
      userType: profile.user_type,
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
