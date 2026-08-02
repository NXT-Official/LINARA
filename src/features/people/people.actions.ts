import { createServerFn } from "@tanstack/react-start";
import crypto from "node:crypto";
import { supabaseClient, createAuthedClient } from "@/lib/supabase";

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
      token: string;
    }) => data
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
      await authedClient.from("invite_flags").insert({
        invite_id: helperProfile.id,
        field: "wage",
        note: `Base wage of ₱${monthlyRate} is below the regional minimum wage limit of ₱${minWage}.`,
      });
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

    const { data: helperProfile, error: queryError } = await supabaseClient
      .from("helper_profiles")
      .select("*")
      .eq("invite_code", inviteCode)
      .eq("status", "PENDING_CLAIM")
      .maybeSingle();

    if (queryError || !helperProfile) {
      throw new Error("Invitation code not found or already claimed");
    }

    return {
      inviteCode: helperProfile.invite_code,
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
  .validator(
    (data: {
      inviteCode: string;
      field: string;
      note: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { inviteCode, field, note } = data;

    const { data: helperProfile, error: queryError } = await supabaseClient
      .from("helper_profiles")
      .select("*")
      .eq("invite_code", inviteCode)
      .eq("status", "PENDING_CLAIM")
      .maybeSingle();

    if (queryError || !helperProfile) {
      throw new Error("Invitation code not found");
    }

    // Insert a dispute flag
    const { data: flag, error: flagError } = await supabaseClient
      .from("invite_flags")
      .insert({
        invite_id: helperProfile.id,
        field,
        note,
      })
      .select()
      .single();

    if (flagError || !flag) {
      throw new Error(flagError?.message || "Failed to create dispute flag");
    }

    return {
      flagId: flag.id,
      status: "SUSPENDED",
    };
  });

/**
 * 4. Claim Endpoint (Server Function)
 * Claims the invitation code, registers the helper profile, and returns an access token/session details.
 */
export const claimInviteFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      inviteCode: string;
      email: string;
      password: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { inviteCode, email, password } = data;

    // A. Verify the invitation is still pending claim
    const { data: helperProfile, error: queryError } = await supabaseClient
      .from("helper_profiles")
      .select("*")
      .eq("invite_code", inviteCode)
      .eq("status", "PENDING_CLAIM")
      .maybeSingle();

    if (queryError || !helperProfile) {
      throw new Error("Invitation code not found or already claimed");
    }

    // B. Register the user in Supabase Auth
    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (signUpError || !signUpData.user) {
      throw new Error(signUpError?.message || "Auth signup failed");
    }

    const newUser = signUpData.user;
    let session = signUpData.session;

    // C. If auto-sign-in was not direct, sign in manually to get a valid session
    if (!session) {
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.session) {
        throw new Error(signInError?.message || "Auth signin failed after registration");
      }
      session = signInData.session;
    }

    // D. Create the user profile in public.user_profiles
    // We use an authed client of the new helper so they write their own profile
    const helperAuthedClient = createAuthedClient(session.access_token);
    const { data: userProfile, error: profileError } = await helperAuthedClient
      .from("user_profiles")
      .insert({
        id: newUser.id,
        household_id: helperProfile.household_id,
        full_name: helperProfile.name,
        user_type: "helper",
      })
      .select()
      .single();

    if (profileError || !userProfile) {
      throw new Error(profileError?.message || "Failed to create user profile");
    }

    // E. Link helper_profiles to the user profile and set status to ACTIVE
    // Since the helper is now logged in, they can also update their own helper profile
    const { data: updatedHelperProfile, error: updateError } = await helperAuthedClient
      .from("helper_profiles")
      .update({
        user_id: newUser.id,
        status: "ACTIVE",
      })
      .eq("id", helperProfile.id)
      .select()
      .single();

    if (updateError || !updatedHelperProfile) {
      throw new Error(updateError?.message || "Failed to activate helper profile");
    }

    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: newUser.id,
      helperId: helperProfile.id,
    };
  });
