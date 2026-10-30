import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Home, Loader2, Smartphone, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { LogoMark } from "@/components/shared/logo";
import { inMobileApp, openAppScreen } from "@/lib/mobile-app";

import { useSession } from "../hooks/use-session";
import { ExistingAccountError } from "../people.auth";
import { clearPendingCode, readPendingCode, savePendingCode } from "../pending-invite";
import { JoinHouseholdForm } from "./household-switcher";
import { useT } from "@/lib/i18n/locale-context";
import { textParts } from "@/lib/i18n/instance";

/** The steps of /signup after "Which one are you?", each its own `?step=`. */
export const SIGNUP_STEPS = ["household", "join", "kasambahay"] as const;
export type SignupStep = (typeof SIGNUP_STEPS)[number];

/**
 * Full-page manager log in (/login) and sign up (/signup). Not mounted under
 * `_app` (no AppStoreProvider there yet, since there's no session to build
 * one from), so this owns its own `useSession()` call rather than reading one
 * from context -- after a successful auth, navigating into `/manager/*`
 * mounts `_app.tsx` fresh, which builds its own session that re-resolves
 * from the same localStorage tokens this flow just wrote.
 *
 * The sign-up step lives in the URL, not in state, so the browser's Back
 * returns to the previous step. Steps share this one mounted component, so
 * what was typed survives going back and forth.
 */
export function ManagerAuthFlow({
  page,
  step,
  confirmationSent = false,
}: {
  page: "login" | "signup";
  step?: SignupStep;
  confirmationSent?: boolean;
}) {
  const t = useT();
  const session = useSession();
  const navigate = useNavigate();

  // One flow for everyone: sign in, or create an account after saying
  // which kind. A kasambahay's Linara is the app; the web says so.
  const [helperSignedIn, setHelperSignedIn] = useState(false);
  const mode: Mode =
    page === "login"
      ? helperSignedIn
        ? "kasambahay-signed-in"
        : "login"
      : step === "kasambahay"
        ? "kasambahay"
        : step
          ? "signup"
          : "choose";
  // Sign-up joining a household that already exists, with its code.
  const withCode = step === "join";
  // Inside the app (QA LMM-A6), its own sign-in, chooser and kasambahay
  // onboarding stand in for these pages: there is one of each, the app's.
  const goToStep = (next?: SignupStep) => {
    if (!next && openAppScreen("create-account")) return;
    if (next === "kasambahay" && openAppScreen("kasambahay")) return;
    navigate({ to: "/signup", search: next ? { step: next } : {} });
  };
  const goToLogin = () => {
    if (!openAppScreen("sign-in")) navigate({ to: "/login" });
  };

  const [fullName, setFullName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(confirmationSent);
  const [inviteCode, setInviteCode] = useState("");
  // Sign-up hit an account the email already had: say so, and offer log in.
  const [existingAccount, setExistingAccount] = useState(false);
  // The setup screen: join one instead of starting one.
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (session.status === "needs_bootstrap" && readPendingCode()) setJoining(true);
  }, [session.status]);

  const joinAndForget = async (code: string, name?: string) => {
    await session.joinHousehold(code, name);
    clearPendingCode();
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
      // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side double-entry check.
      if (password !== confirmPassword) {
        toast.error("Hindi magkatugma ang passwords.");
        return;
      }
      if (password.length < 6) {
        toast.error("Dapat may kahit anim (6) na characters ang password.");
        return;
      }
      if (withCode && inviteCode.replace(/\s/g, "").length !== 8) {
        toast.error("The invite code is 8 letters and numbers.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        // Just the account here. Name, and the household to start or join,
        // are asked once, on "Finish setting up" at first login (QA LMM-A2).
        // A code waits there for it; no code means start one, so an old
        // one from an earlier try mustn't open the join form instead. An
        // account the email already had joins with it from the dashboard.
        if (withCode) {
          savePendingCode(inviteCode.replace(/\s/g, "").toUpperCase());
        } else {
          clearPendingCode();
        }
        const result = await session.signUp({ email: email.trim(), password });
        if (result === "confirmation_pending") {
          toast.info(
            "Nagpadala kami ng confirmation link sa email mo. I-click iyon, tapos mag-log in.",
          );
          if (!openAppScreen("sign-in", "confirm-email")) {
            navigate({ to: "/login", search: { sent: true } });
          }
          return;
        }
        if (result === "helper") {
          toast.info("Kasambahay account ang email na ito. Sa Linara app ito ginagamit.");
          goToStep("kasambahay");
          return;
        }
        if (result === "authed") toast.success("Welcome back!");
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
          setHelperSignedIn(true);
          return;
        }
        if (result === "needs_bootstrap") {
          toast.success("Naka-confirm na! Kumpletuhin na lang ang household setup.");
          return;
        }
        toast.success("Welcome back!");
      }
    } catch (err) {
      if (err instanceof ExistingAccountError) {
        setExistingAccount(true);
        return;
      }
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
      <AuthCard>
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {joining ? t("people.joinAHousehold") : t("people.finishSettingUp")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {joining ? t("people.enterPrimaryCode") : t("people.setUpNameAndHousehold")}
        </p>
        {joining ? (
          <JoinHouseholdForm
            token={session.token}
            onJoin={joinAndForget}
            askName
            initialCode={readPendingCode()}
          />
        ) : (
          <div className="mt-4 space-y-3">
            <Field label={t("people.yourName")}>
              <input
                disabled={loading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("people.eGBenSantos")}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </Field>
            <Field label={t("people.householdNameOptional")}>
              <input
                disabled={loading}
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder={t("people.eGSantosHousehold")}
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
                <Loader2 className="h-4 w-4 animate-spin" /> {t("people.settingUp")}
              </>
            ) : (
              t("people.finishSetup")
            )}
          </button>
        )}
        <SwitchLink onClick={() => setJoining(!joining)}>
          {joining ? t("people.settingUpNewGoBack") : t("people.joiningUseCode")}
        </SwitchLink>
        {/* The one way off this screen: in the app it also signs the app
              out, back to its own sign-in (app/manager.tsx). */}
        <button
          type="button"
          disabled={loading}
          onClick={session.logOut}
          className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
        >
          {t("people.notYouLogOut")}
        </button>
      </AuthCard>
    );
  }

  if (mode === "choose") {
    return (
      <AuthCard>
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {t("people.createAnAccount")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("people.whichOneAreYou")}</p>
        <div className="mt-5 space-y-3">
          <ChoiceButton
            icon={<Home className="h-5 w-5" />}
            title={t("people.iRunAHousehold")}
            body="Employer. Set up your household, then invite the people who work in it."
            onClick={() => goToStep("household")}
          />
          <ChoiceButton
            icon={<UserRound className="h-5 w-5" />}
            title={t("people.iWorkInAHousehold")}
            body="Kasambahay. Join with the invite code your employer gave you."
            onClick={() => goToStep("kasambahay")}
          />
        </div>
        <SwitchLink onClick={goToLogin}>{t("people.alreadyHaveAnAccountLog")}</SwitchLink>
      </AuthCard>
    );
  }

  if (mode === "kasambahay" || mode === "kasambahay-signed-in") {
    return (
      <AuthCard>
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {mode === "kasambahay"
            ? t("people.kasambahayStartInApp")
            : t("people.kasambahayLinaraInApp")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "kasambahay"
            ? t("people.kasambahayAccountMadeInApp")
            : t("people.kasambahayAccountSignInApp")}
        </p>
        <a
          href="linaramobile://sign-in"
          onClick={(e) => {
            if (openAppScreen(mode === "kasambahay" ? "kasambahay" : "sign-in")) e.preventDefault();
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          <Smartphone className="h-4 w-4" /> {t("people.buksanAngLinaraApp")}
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("people.walaPaAngAppSa")}
        </p>
        <SwitchLink onClick={() => (page === "login" ? setHelperSignedIn(false) : goToLogin())}>
          <ArrowLeft className="h-3.5 w-3.5" /> {t("people.backToSignIn")}
        </SwitchLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="mt-4 font-display text-2xl text-foreground">
        {mode === "signup"
          ? withCode
            ? t("people.joinAHousehold")
            : t("people.setUpYourHousehold")
          : t("people.welcomeBack")}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "signup"
          ? withCode
            ? t("people.makeManagerWithCode")
            : t("people.makeEmployerAccount")
          : t("people.signInEmployerOrKasambahay")}
      </p>

      {confirmationPending && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t("people.nagpadalaKamiNgConfirmationLink")}</span>
        </div>
      )}

      {existingAccount && mode === "signup" && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm text-foreground"
        >
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {textParts(t("people.emailHasAccount")).map((part, i) =>
                typeof part === "string" ? (
                  part
                ) : (
                  <span key={i} className="font-semibold">
                    {email.trim()}
                  </span>
                ),
              )}{" "}
              {withCode ? t("people.logInInsteadCode") : t("people.logInToItInstead")}
            </span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 pl-6">
            <button
              type="button"
              onClick={goToLogin}
              className="text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {t("people.logInInstead")}
            </button>
            <Link
              to="/reset-password"
              onClick={(e) => {
                if (openAppScreen("forgot-password")) e.preventDefault();
              }}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("people.forgotThePassword")}
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {mode === "signup" && withCode && (
          <Field label={t("people.inviteCode")}>
            <input
              disabled={loading}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={t("people.8LettersAndNumbers")}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm uppercase tracking-widest outline-none focus:border-primary disabled:opacity-60"
            />
          </Field>
        )}
        <Field label={t("people.email")}>
          <input
            disabled={loading}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setExistingAccount(false);
            }}
            placeholder={t("people.eGBenGmailCom")}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </Field>
        <Field label={t("people.password")}>
          <input
            disabled={loading}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? t("people.atLeast6") : undefined}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </Field>
        {mode === "signup" && (
          <Field label={t("people.confirmPassword")}>
            <input
              disabled={loading}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {mode === "signup" ? t("people.settingUp") : t("people.loggingIn")}
          </>
        ) : mode === "signup" ? (
          withCode ? (
            t("people.joinHousehold")
          ) : (
            t("people.createHousehold")
          )
        ) : (
          t("people.logIn")
        )}
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={() => (mode === "signup" ? goToLogin() : goToStep())}
        className="mt-1 min-h-11 w-full text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-60"
      >
        {mode === "signup" ? t("people.haveAccountLogIn") : t("people.newCreateAccount")}
      </button>

      {mode === "signup" && (
        <button
          type="button"
          disabled={loading}
          onClick={() => goToStep(withCode ? "household" : "join")}
          className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
        >
          {withCode ? t("people.startingNewInstead") : t("people.joiningUseCode")}
        </button>
      )}

      {mode === "login" && (
        <Link
          to="/reset-password"
          onClick={(e) => {
            if (openAppScreen("forgot-password")) e.preventDefault();
          }}
          className="mt-2 block text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("people.forgotPassword")}
        </Link>
      )}

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        {/* The two links sit wherever the language puts them. */}
        {textParts(mode === "signup" ? t("people.agreeSignup") : t("people.agreeLogin")).map(
          (part, i) =>
            typeof part === "string" ? (
              part
            ) : part.name === "terms" ? (
              <Link
                key={i}
                to="/terms"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("people.terms")}
              </Link>
            ) : (
              <Link
                key={i}
                to="/privacy"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("people.privacyPolicy")}
              </Link>
            ),
        )}
      </p>
    </AuthCard>
  );
}

type Mode = "login" | "signup" | "choose" | "kasambahay" | "kasambahay-signed-in";

// Every auth screen's card. On the web it leads back to the home page; in
// the app there's no home page to go to, only the app's own screens.
function AuthCard({ children }: { children: ReactNode }) {
  const t = useT();
  const onWeb = !inMobileApp();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {onWeb && (
          <Link
            to="/"
            className="mb-3 -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" /> {t("people.backToHome")}
          </Link>
        )}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-lift">
          {onWeb ? (
            <Link to="/" aria-label={t("people.linaraHome")} className="inline-block rounded-xl">
              <LogoMark className="h-10 w-10" />
            </Link>
          ) : (
            <LogoMark className="h-10 w-10" />
          )}
          {children}
        </div>
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
      className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 text-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </button>
  );
}
