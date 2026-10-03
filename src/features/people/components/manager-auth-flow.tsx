import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Home, Loader2, Smartphone, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { LogoMark } from "@/components/shared/logo";

import { useSession } from "../hooks/use-session";
import { JoinHouseholdForm } from "./household-switcher";

// A manager code given at sign-up, kept while the email waits to be
// confirmed, so the setup screen after it can join with it.
const PENDING_CODE_KEY = "linara_pending_manager_code";

function pendingCode(): string {
  try {
    return window.localStorage.getItem(PENDING_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

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
  // Sign-up joining a household that already exists, with its code.
  const [withCode, setWithCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  // The setup screen: join one instead of starting one.
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (session.status === "needs_bootstrap" && pendingCode()) setJoining(true);
  }, [session.status]);

  const joinAndForget = async (code: string, name?: string) => {
    await session.joinHousehold(code, name);
    window.localStorage.removeItem(PENDING_CODE_KEY);
  };

  // Signed in (already, or just now): into the app. Replace, so Back from the
  // app goes to wherever the visitor came from, not to this form.
  useEffect(() => {
    if (session.status === "authed") navigate({ to: "/manager/pass", replace: true });
  }, [session.status, navigate]);

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
      if (withCode && inviteCode.replace(/s/g, "").length !== 8) {
        toast.error("The invite code is 8 letters and numbers.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const code = withCode ? inviteCode.replace(/s/g, "").toUpperCase() : undefined;
        const result = await session.signUp({
          fullName: fullName.trim(),
          householdName: code ? undefined : householdName.trim() || undefined,
          email: email.trim(),
          password,
          inviteCode: code,
        });
        if (result === "confirmation_pending") {
          if (code) window.localStorage.setItem(PENDING_CODE_KEY, code);
          setConfirmationPending(true);
          toast.info(
            "Nagpadala kami ng confirmation link sa email mo. I-click iyon, tapos mag-log in.",
          );
          setMode("login");
          return;
        }
        toast.success(
          code ? "You've joined the household." : "Tagumpay! Nagawa na ang household mo.",
        );
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
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "May error na naganap.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (session.status === "loading" || session.status === "authed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (session.status === "needs_bootstrap") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
          <LogoMark className="h-10 w-10" />
          <h1 className="mt-4 font-display text-2xl text-foreground">
            {joining ? "Join a household" : "Finish setting up"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {joining
              ? "Enter the code its primary manager gave you."
              : "Set up your household: your name, and what to call it."}
          </p>
          {joining ? (
            <JoinHouseholdForm
              token={session.token}
              onJoin={joinAndForget}
              askName
              initialCode={pendingCode()}
            />
          ) : (
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
          )}
          {!joining && (
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
          )}
          <SwitchLink onClick={() => setJoining(!joining)}>
            {joining
              ? "Setting up a new household instead? Go back"
              : "Joining a household that's already set up? Use your code"}
          </SwitchLink>
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
          {mode === "signup"
            ? withCode
              ? "Join a household"
              : "Set up your household"
            : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "signup"
            ? withCode
              ? "Make your manager account, with the code the household's primary manager gave you."
              : "Gawin ang employer account mo para sa household mo."
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
              {withCode ? (
                <Field label="Invite code">
                  <input
                    disabled={loading}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="8 letters and numbers"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm uppercase tracking-widest outline-none focus:border-primary disabled:opacity-60"
                  />
                </Field>
              ) : (
                <Field label="Household name (optional)">
                  <input
                    disabled={loading}
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder="e.g. Santos Household"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
                  />
                </Field>
              )}
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
            withCode ? (
              "Join household"
            ) : (
              "Create household"
            )
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

        {mode === "signup" && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setWithCode(!withCode)}
            className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
          >
            {withCode
              ? "Starting a new household instead?"
              : "Joining a household that's already set up? Use your code"}
          </button>
        )}

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
