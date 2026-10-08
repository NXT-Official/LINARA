import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));

const { requestPasswordResetFromSupabase, signInWithSupabase, signUpWithSupabase } =
  await import("./people.auth");

const session = { access_token: "access", refresh_token: "refresh" };
const user = { id: "user-1" };
const authError = (status: number, code: string, message: string) => ({ status, code, message });

beforeEach(() => {
  auth.signInWithPassword.mockReset();
  auth.signUp.mockReset();
  auth.resetPasswordForEmail.mockReset();
});

describe("signInWithSupabase", () => {
  it("hands back the session", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session, user }, error: null });
    await expect(signInWithSupabase("ben@example.com", "secret1")).resolves.toEqual({
      status: "ok",
      accessToken: "access",
      refreshToken: "refresh",
      userId: "user-1",
    });
  });

  it("says when the email isn't confirmed yet", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: authError(400, "email_not_confirmed", "Email not confirmed"),
    });
    await expect(signInWithSupabase("ben@example.com", "secret1")).resolves.toEqual({
      status: "confirmation_pending",
    });
  });

  it("passes on a wrong password as Supabase says it", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: authError(400, "invalid_credentials", "Invalid login credentials"),
    });
    await expect(signInWithSupabase("ben@example.com", "nope")).rejects.toThrow(
      "Invalid login credentials",
    );
  });

  it("says plainly when Supabase is throttling", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: authError(429, "over_request_rate_limit", "Request rate limit reached"),
    });
    await expect(signInWithSupabase("ben@example.com", "nope")).rejects.toThrow(
      "Too many tries. Wait a few minutes, then try again.",
    );
  });
});

describe("signUpWithSupabase", () => {
  it("uses the session sign-up gives, with the confirmation link", async () => {
    auth.signUp.mockResolvedValue({ data: { session, user }, error: null });
    const result = await signUpWithSupabase(
      "new@example.com",
      "secret1",
      "https://x/email-confirmed",
    );
    expect(result).toMatchObject({ status: "ok", accessToken: "access", userId: "user-1" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "secret1",
      options: {
        emailRedirectTo: "https://x/email-confirmed",
        data: { signed_up_as: "manager" },
      },
    });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("with no session back, tries signing in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user }, error: null });
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: authError(400, "email_not_confirmed", "Email not confirmed"),
    });
    await expect(signUpWithSupabase("new@example.com", "secret1", "https://x")).resolves.toEqual({
      status: "confirmation_pending",
    });
  });

  it("an address that already has an account signs in instead", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: authError(422, "user_already_exists", "User already registered"),
    });
    auth.signInWithPassword.mockResolvedValue({ data: { session, user }, error: null });
    await expect(
      signUpWithSupabase("ben@example.com", "secret1", "https://x"),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("throttled, says so", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: authError(429, "over_email_send_rate_limit", "email rate limit exceeded"),
    });
    await expect(signUpWithSupabase("new@example.com", "secret1", "https://x")).rejects.toThrow(
      "Too many tries",
    );
  });
});

describe("requestPasswordResetFromSupabase", () => {
  it("asks Supabase for the email, with where its link lands", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestPasswordResetFromSupabase("ben@example.com", "https://x/reset-password");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ben@example.com", {
      redirectTo: "https://x/reset-password",
    });
  });

  it("throttled, says so", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: authError(429, "over_email_send_rate_limit", "email rate limit exceeded"),
    });
    await expect(requestPasswordResetFromSupabase("ben@example.com", "https://x")).rejects.toThrow(
      "Too many tries",
    );
  });
});
