import { Link } from "@tanstack/react-router";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";

import { completePasswordResetFn, requestPasswordResetFn } from "../people.actions";

type Recovery = { accessToken: string; refreshToken: string };
type Mode = "loading" | "request" | "sent" | "set" | "done";

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

  useEffect(() => {
    const found = readRecoveryFromHash();
    // Drop the tokens from the address bar so they aren't left in history.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (found && "error" in found) {
      toast.error(`${found.error}. Humingi ng bagong link sa ibaba.`);
      setMode("request");
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
      toast.error("Dapat may kahit anim (6) na characters ang password.");
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side double-entry check.
    if (password !== confirmPassword) {
      toast.error("Hindi magkatugma ang passwords.");
      return;
    }
    setLoading(true);
    try {
      await completePasswordResetFn({ data: { ...recovery, password } });
      setRecovery(null);
      setMode("done");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "May error na naganap.");
      setMode("request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EC] p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {mode === "done" ? (
            <CheckCircle2 className="h-5 w-5" />
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
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className={inputClass}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  disabled={loading}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              onClick={savePassword}
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save new password"}
            </button>
          </>
        )}

        {mode === "done" && (
          <>
            <h1 className="mt-4 font-display text-2xl text-foreground">Password updated</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Helper ka? Buksan ang Linara app sa phone mo at mag-sign in gamit ang bagong password.
            </p>
          </>
        )}

        {mode !== "loading" && (
          <Link
            to="/login"
            className="mt-4 block text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Manager? Go to log in
          </Link>
        )}
      </div>
    </div>
  );
}
