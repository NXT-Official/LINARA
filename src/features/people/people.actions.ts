import { createServerFn } from "@tanstack/react-start";
import crypto from "node:crypto";
import { supabaseClient, createAuthedClient } from "@/lib/supabase";

// The Supabase client here isn't generated against a Database type, so
// .rpc() calls resolve to `{}` instead of the function's actual return
// row. These describe the SECURITY DEFINER functions in
// supabase/fix-claim-flow-rls-gaps.sql closely enough to type their
// results.
interface PendingInviteRow {
  id: string;
  household_id: string;
  name: string;
  station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
  monthly_rate: number;
  shift_start: string;
  shift_end: string;
  weekly_rest_day: number;
}

interface ClaimHelperInviteRow {
  helper_id: string;
  household_id: string;
  full_name: string;
}

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
 * 2. Verify Code Endpoint (Server Function)
 * Allows lookups of unclaimed invite terms without authentication.
 */
export const verifyClaimFn = createServerFn({ method: "POST" })
  .validator((data: { inviteCode: string }) => data)
  .handler(async ({ data }) => {
    const { inviteCode } = data;

    // Same anon-RLS problem as claimInviteFn's step A: an unauthenticated
    // caller can never satisfy helper_profiles_isolation's household_id
    // check, so this must go through the RPC. See
    // supabase/fix-claim-flow-rls-gaps.sql.
    const { data: rpcData, error: queryError } = await supabaseClient
      .rpc("lookup_pending_invite", { p_invite_code: inviteCode })
      .maybeSingle();
    const helperProfile = rpcData as PendingInviteRow | null;

    if (queryError || !helperProfile) {
      throw new Error("Invitation code not found or already claimed");
    }

    return {
      inviteCode,
      name: helperProfile.name,
      station: helperProfile.station,
      monthlyRate: Number(helperProfile.monthly_rate),
      shiftStart: helperProfile.shift_start,
      shiftEnd: helperProfile.shift_end,
      weeklyRestDay: helperProfile.weekly_rest_day,
    };
  });

/**
 * 3. Flag Endpoint (Server Function)
 * Flags a mismatch in invitation terms prior to claiming, suspending the handshake process.
 */
export const flagInviteFn = createServerFn({ method: "POST" })
  .validator((data: { inviteCode: string; field: string; note: string }) => data)
  .handler(async ({ data }) => {
    const { inviteCode, field, note } = data;

    // Validation and insert both happen inside flag_invite() -- see
    // supabase/fix-claim-flow-rls-gaps.sql. An anonymous claimant has no
    // auth.uid(), so no household-scoped RLS policy can ever grant them
    // direct table access; the SECURITY DEFINER function re-validates the
    // invite_code itself instead of trusting the caller.
    const { data: flagId, error: flagError } = await supabaseClient.rpc("flag_invite", {
      p_invite_code: inviteCode,
      p_field: field,
      p_note: note,
    });

    if (flagError || !flagId) {
      throw new Error(flagError?.message || "Invitation code not found");
    }

    return {
      flagId,
      status: "SUSPENDED",
    };
  });

/**
 * 4. Claim Endpoint (Server Function)
 * Claims the invitation code, registers the helper profile, and returns an access token/session details.
 */
export const claimInviteFn = createServerFn({ method: "POST" })
  .validator((data: { inviteCode: string; email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { inviteCode, email, password } = data;

    // A. Verify the invitation is still pending claim. Uses the
    // lookup_pending_invite() RPC, not a direct table query -- an
    // unauthenticated caller can never satisfy helper_profiles_isolation's
    // household_id check, so a plain .from("helper_profiles").select(...)
    // always returns zero rows here. See
    // supabase/fix-claim-flow-rls-gaps.sql.
    const { data: pendingInvite, error: lookupError } = await supabaseClient
      .rpc("lookup_pending_invite", { p_invite_code: inviteCode })
      .maybeSingle();

    if (lookupError || !pendingInvite) {
      throw new Error("Invitation code not found or already claimed");
    }

    // B. Register the user in Supabase Auth. With email confirmation on,
    // this returns no session until the link is clicked. If this email is
    // already registered -- e.g. the helper is re-submitting this same form
    // after confirming their email from a previous attempt -- signUp
    // reports that rather than erroring outright, so fall through to
    // signing in instead of failing.
    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (signUpError && signUpError.code !== "user_already_exists") {
      throw new Error(signUpError.message);
    }

    let session = signUpData?.session ?? null;
    let newUserId = signUpData?.user?.id ?? null;

    // C. No session yet means either the confirmation email hasn't been
    // clicked yet, or this account already exists from an earlier attempt.
    // Signing in resolves both: it fails with "email not confirmed" for the
    // former, and succeeds for the latter once the link has been clicked.
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
      newUserId = signInData.user?.id ?? newUserId;
    }

    if (!session || !newUserId) {
      return { status: "confirmation_pending" as const };
    }

    // D & E. Create the user_profiles row and activate the helper_profiles
    // row atomically via claim_helper_invite(). A direct authed insert into
    // user_profiles cannot work here: RLS checks the new row against
    // current_household_id(), which looks up the caller's *existing*
    // user_profiles row -- but this insert creates that caller's first row.
    // The SECURITY DEFINER RPC sidesteps that bootstrap problem; auth.uid()
    // inside it still reflects the calling JWT, so it can only ever act on
    // the authenticated caller's own account. See
    // supabase/fix-claim-flow-rls-gaps.sql.
    const helperAuthedClient = createAuthedClient(session.access_token);
    const { data: claimedData, error: claimError } = await helperAuthedClient
      .rpc("claim_helper_invite", { p_invite_code: inviteCode })
      .maybeSingle();
    const claimed = claimedData as ClaimHelperInviteRow | null;

    if (claimError || !claimed) {
      throw new Error(claimError?.message || "Failed to activate helper profile");
    }

    return {
      status: "claimed" as const,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: newUserId,
      helperId: claimed.helper_id,
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
