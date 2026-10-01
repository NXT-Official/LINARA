import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Home, Loader2, Smartphone, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { LogoMark } from "@/components/shared/logo";

import { useSession } from "../hooks/use-session";

/**
 * Full-page manager sign up / log in. Not mounted under `_app` (no
 * AppStoreProvider there yet, since there's no session to build one from),
 * so this owns its own `useSession()` call rather than reading one from
 * context -- after a successful auth, navigating into `/manager/*` mounts
 * `_app.tsx` fresh, which builds its own session that re-resolves from the
 * same localStorage tokens this flow just wrote.
 */
export function ManagerAuthFlow({ initialMode = "login" }: { initialMode?: Mode }) {
  const session = useSession();
  const navigate = useNavigate();

  // One flow for everyone: sign in, or create an account after saying
  // which kind. A kasambahay's Linara is the app; the web says so.
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error("Kumpletuhin muna ang email at password.");
      return;
    }
    if (mode === "signup") {
      if (!fullName.trim()) {
        toast.error("Ilagay ang iyong pangalan.");
        return;
      }
      // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side double-entry check.
      if (password !== confirmPassword) {
        toast.error("Hindi magkatugma ang passwords.");
        return;
      }
      if (password.length < 6) {
        toast.error("Dapat may kahit anim (6) na characters ang password.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await session.signUp({
          fullName: fullName.trim(),
          householdName: householdName.trim() || undefined,
          email: email.trim(),
          password,
        });
        if (result === "confirmation_pending") {
          setConfirmationPending(true);
          toast.info(
            "Nagpadala kami ng confirmation link sa email mo. I-click iyon, tapos mag-log in.",
          );
          setMode("login");
          return;
        }
        toast.success("Tagumpay! Nagawa na ang household mo.");
        navigate({ to: "/manager/pass" });
      } else {
        const result = await session.logIn({ email: email.trim(), password });
        if (result === "confirmation_pending") {
          setConfirmationPending(true);
          toast.info(
            "Hindi pa na-confirm ang email mo. I-click muna ang link, tapos subukan ulit.",
          );
          return;
        }
        if (result === "helper") {
          setMode("kasambahay-signed-in");
          return;
        }
        if (result === "needs_bootstrap") {
          toast.success("Naka-confirm na! Kumpletuhin na lang ang household setup.");
          return;
        }
        toast.success("Welcome back!");
        navigate({ to: "/manager/pass" });
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "May error na naganap.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const submitBootstrap = async () => {
    if (!fullName.trim()) {
      toast.error("Ilagay ang iyong pangalan.");
      return;
    }
    setLoading(true);
    try {
      await session.finishBootstrap({
        fullName: fullName.trim(),
        householdName: householdName.trim() || undefined,
      });
      toast.success("Tapos na! Nagawa na ang household mo.");
      navigate({ to: "/manager/pass" });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "May error na naganap.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (session.status === "needs_bootstrap") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
          <LogoMark className="h-10 w-10" />
          <h1 className="mt-4 font-display text-2xl text-foreground">Finish setting up</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Naka-confirm na ang email mo. Ilagay na lang ang pangalan mo at household name.
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Your name">
              <input
                disabled={loading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ben Santos"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </Field>
            <Field label="Household name (optional)">
              <input
                disabled={loading}
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. Santos Household"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </Field>
          </div>
          <button
            onClick={submitBootstrap}
            disabled={loading || !fullName.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Setting up...
              </>
            ) : (
              "Finish setup"
            )}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <AuthCard>
        <h1 className="mt-4 font-display text-2xl text-foreground">Create an account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Which one are you?</p>
        <div className="mt-5 space-y-3">
          <ChoiceButton
            icon={<Home className="h-5 w-5" />}
            title="I run a household"
            body="Employer. Set up your household, then invite the people who work in it."
            onClick={() => setMode("signup")}
          />
          <ChoiceButton
            icon={<UserRound className="h-5 w-5" />}
            title="I work in a household"
            body="Kasambahay. Join with the invite code your employer gave you."
            onClick={() => setMode("kasambahay")}
          />
        </div>
        <SwitchLink onClick={() => setMode("login")}>Already have an account? Log in</SwitchLink>
      </AuthCard>
    );
  }

  if (mode === "kasambahay" || mode === "kasambahay-signed-in") {
    return (
      <AuthCard>
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {mode === "kasambahay" ? "Sa app ka magsisimula" : "Nasa app ang Linara mo"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "kasambahay"
            ? "Ang account ng kasambahay ay ginagawa sa Linara app, gamit ang invite code galing sa employer mo."
            : "Kasambahay account ito. Ang tasks, sahod at record mo ay nasa Linara app; doon ka mag-sign in."}
        </p>
        <a
          href="linaramobile://sign-in"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          <Smartphone className="h-4 w-4" /> Buksan ang Linara app
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Wala pa ang app sa phone mo? Hingin sa employer mo ang link para ma-download ito.
        </p>
        <SwitchLink onClick={() => setMode("login")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </SwitchLink>
      </AuthCard>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <LogoMark className="h-10 w-10" />
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {mode === "signup" ? "Set up your household" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Gawin ang employer account mo para sa household mo."
            : "Mag-sign in sa Linara, employer man o kasambahay."}
        </p>

        {confirmationPending && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Nagpadala kami ng confirmation link sa email mo. Buksan mo iyon bago mag-log in.
            </span>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {mode === "signup" && (
            <>
              <Field label="Your name">
                <input
                  disabled={loading}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ben Santos"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
                />
              </Field>
              <Field label="Household name (optional)">
                <input
                  disabled={loading}
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="e.g. Santos Household"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
                />
              </Field>
            </>
          )}
          <Field label="Email">
            <input
              disabled={loading}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ben@gmail.com"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </Field>
          <Field label="Password">
            <input
              disabled={loading}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </Field>
          {mode === "signup" && (
            <Field label="Confirm password">
              <input
                disabled={loading}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </Field>
          )}
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {mode === "signup" ? "Setting up..." : "Logging in..."}
            </>
          ) : mode === "signup" ? (
            "Create household"
          ) : (
            "Log in"
          )}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setMode(mode === "signup" ? "login" : "choose");
            setConfirmationPending(false);
          }}
          className="mt-3 w-full text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-60"
        >
          {mode === "signup"
            ? "Already have an account? Log in"
            : "New to Linara? Create an account"}
        </button>

        {mode === "login" && (
          <Link
            to="/reset-password"
            className="mt-2 block text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        )}

        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          {mode === "signup" ? "By creating a household you agree to the " : "Linara's "}
          <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
            terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

type Mode = "login" | "signup" | "choose" | "kasambahay" | "kasambahay-signed-in";

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <LogoMark className="h-10 w-10" />
        {children}
      </div>
    </div>
  );
}

function ChoiceButton({
  icon,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function SwitchLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 flex w-full items-center justify-center gap-1 text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </button>
  );
}
