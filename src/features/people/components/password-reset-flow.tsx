import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";

import { completePasswordResetFn, requestPasswordResetFn } from "../people.actions";

type Recovery = { accessToken: string; refreshToken: string };
type Mode = "loading" | "request" | "sent" | "set" | "done" | "expired";

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60";

/**
 * Reads the recovery session Supabase appends to the emailed link as a URL
 * fragment (`#access_token=...&type=recovery`, implicit flow -- the default
 * for both apps' clients). Returns an error message instead when Supabase
 * redirected here with one (e.g. an expired link).
 */
function readRecoveryFromHash(): Recovery | { error: string } | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const errorDescription = params.get("error_description");
  if (errorDescription) return { error: errorDescription.replace(/\+/g, " ") };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (params.get("type") !== "recovery" || !accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/**
 * One page for both halves of a password reset, for managers and helpers
 * alike: without a recovery fragment it asks for an email and sends the
 * link; arriving from that link it sets the new password. Helpers then go
 * back to the mobile app to sign in -- this page never signs anyone in.
 */
export function PasswordResetFlow() {
  const [mode, setMode] = useState<Mode>("loading");
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Shown on the form and kept there: a toast that vanished while the page
  // jumped back to "request a link" left people unsure whether it worked.
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const found = readRecoveryFromHash();
    // Drop the tokens from the address bar so they aren't left in history.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (found && "error" in found) {
      setMode("expired");
    } else if (found) {
      setRecovery(found);
      setMode("set");
    } else {
      setMode("request");
    }
  }, []);

  const sendLink = async () => {
    if (!email.trim()) {
      toast.error("Ilagay ang email mo.");
      return;
    }
    setLoading(true);
    try {
      await requestPasswordResetFn({
        data: { email: email.trim(), redirectTo: `${window.location.origin}/reset-password` },
      });
      setMode("sent");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "May error na naganap.");
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async () => {
    if (!recovery) return;
    if (password.length < 6) {
      setFormError("Dapat may kahit anim (6) na characters ang password.");
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side double-entry check.
    if (password !== confirmPassword) {
      setFormError("Hindi magkatugma ang dalawang password. Paki-type ulit.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await completePasswordResetFn({ data: { ...recovery, password } });
      setRecovery(null);
      setMode("done");
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      // Only a dead link sends her away from the form; anything she can fix
      // (same password as before, too weak) stays here, on screen.
      if (/expired|nag-expire|Expired na/i.test(message)) {
        setRecovery(null);
        setMode("expired");
      } else {
        setFormError(message || "Hindi na-save ang bagong password. Subukan ulit.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {mode === "done" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : mode === "expired" ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <KeyRound className="h-5 w-5" />
          )}
        </div>

        {mode === "loading" && (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {mode === "request" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">Reset your password</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ilagay ang email ng account mo — manager man o helper — at padadalhan ka namin ng
              link.
            </p>
            <div className="mt-4">
              <Field label="Email">
                <input
                  disabled={loading}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ben@gmail.com"
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              onClick={sendLink}
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </button>
          </>
        )}

        {mode === "sent" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">Check your email</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Kung may account ang {email.trim()}, may reset link na papunta roon. Buksan mo iyon sa
              device na ito o sa phone mo.
            </p>
          </>
        )}

        {mode === "set" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">Choose a new password</h1>
            <div className="mt-4 space-y-3">
              <Field label="New password">
                <input
                  disabled={loading}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="At least 6 characters"
                  className={inputClass}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  disabled={loading}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFormError(null);
                  }}
                  className={inputClass}
                />
              </Field>
            </div>
            {formError && (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
              </p>
            )}
            <button
              onClick={savePassword}
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save new password"}
            </button>
          </>
        )}

        {mode === "done" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">
              Password reset successfully!
            </h1>
            <p className="mt-1.5 text-sm text-foreground">
              Napalitan na ang password mo. Mag-sign in gamit ang bagong password.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Kasambahay ka? Buksan ang Linara app sa phone mo at doon mag-sign in.
            </p>
            <a
              href="linaramobile://sign-in"
              className="mt-5 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
            >
              Buksan ang Linara app
            </a>
          </>
        )}

        {mode === "expired" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">
              This reset link has expired
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Luma na o nagamit na ang link na ito, kaya hindi napalitan ang password mo. Humingi ng
              bagong link.
            </p>
            <button
              onClick={() => setMode("request")}
              className="mt-5 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
            >
              Send a new link
            </button>
          </>
        )}

        {mode !== "loading" && (
          <Link
            to="/login"
            className="mt-4 block text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {mode === "done" ? "Or sign in here" : "Manager? Go to log in"}
          </Link>
        )}
      </div>
    </div>
  );
}
