import { createClient, type AuthError } from "@supabase/supabase-js";

/**
 * Logging in, signing up and asking for a reset email go from the browser
 * straight to Supabase Auth (QA LM-A7 and F4, 2026-10-07). They used to go
 * through this site's server functions, so Auth's limits (about 30 sign-ins
 * per 5 minutes per IP, and its email limits) only ever saw Vercel's
 * addresses: anyone could guess passwords or send reset emails without being
 * slowed, and one of them could get every manager's login throttled. What
 * comes after (who the account is, setting up the household) still runs on
 * the server, with the session this returns.
 *
 * A throwaway client per call: signing in on the shared `supabaseClient`
 * would hand its live-update channels this user's token. Nothing is stored;
 * use-session.ts keeps the tokens.
 */
function authClient() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_ANON_KEY || "", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type DirectSession = { accessToken: string; refreshToken: string; userId: string };
export type DirectAuthResult =
  { status: "confirmation_pending" } | ({ status: "ok" } & DirectSession);

/** Auth's own message, except when it's throttling, which says so plainly. */
function authFailure(error: AuthError): Error {
  if (error.status === 429) {
    return new Error("Too many tries. Wait a few minutes, then try again.");
  }
  return Object.assign(new Error(error.message), { code: error.code });
}

/**
 * Sign-up with an email that already has an account, and a password that
 * isn't its password. Auth alone says "Invalid login credentials", which
 * reads like a bad invite code on the join form.
 */
export class ExistingAccountError extends Error {
  constructor() {
    super("That email already has a Linara account, with a different password.");
    this.name = "ExistingAccountError";
  }
}

function isWrongPassword(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "invalid_credentials" || /invalid login credentials/i.test(err.message);
}

export async function signInWithSupabase(
  email: string,
  password: string,
): Promise<DirectAuthResult> {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { status: "confirmation_pending" };
    throw authFailure(error);
  }
  if (!data.session || !data.user) throw new Error("Login failed");
  return {
    status: "ok",
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.user.id,
  };
}

/**
 * Makes the account. Without a session back (email confirmation on, or the
 * address already has an account), it tries signing in with the same
 * password, as the server flow did.
 *
 * The account is marked `signed_up_as: "manager"` in its user metadata, so
 * the LINARA_MOBILE app can tell an employer who hasn't finished household
 * setup from a kasambahay whose invite-code claim failed: both have no
 * profile yet, and only the first belongs on "Finish setting up" (QA LMM-A1).
 */
export async function signUpWithSupabase(
  email: string,
  password: string,
  /** Where the confirmation email's link lands (/email-confirmed on this site). */
  emailRedirectTo: string,
): Promise<DirectAuthResult> {
  const client = authClient();
  // emailRedirectTo must also be listed in Supabase Auth > URL Configuration
  // > Redirect URLs, or Supabase ignores it and uses the Site URL.
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo, data: { signed_up_as: "manager" } },
  });
  if (error && error.code !== "user_already_exists") throw authFailure(error);
  if (data?.session && data.user) {
    return {
      status: "ok",
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId: data.user.id,
    };
  }
  // A new account waiting on its confirmation email signs in as
  // "confirmation_pending", so a wrong password here means the address
  // already had an account.
  try {
    return await signInWithSupabase(email, password);
  } catch (err) {
    if (isWrongPassword(err)) throw new ExistingAccountError();
    throw err;
  }
}

/**
 * Sends the reset email. Supabase only links to redirect URLs on the
 * project's Auth allow-list (anything else falls back to the Site URL),
 * holds each address to one email a minute, and never says whether the
 * address has an account; neither does this.
 */
export async function requestPasswordResetFromSupabase(email: string, redirectTo: string) {
  const { error } = await authClient().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw authFailure(error);
}
