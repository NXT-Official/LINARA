import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/shared/logo";

type Who = "helper" | "manager";
type ConfirmedSearch = { for?: Who };

// Where both apps' confirmation emails land (emailRedirectTo). Supabase has
// already confirmed the address by the time it sends people here; this page
// only says so and points them back, to the app first on a phone.
export const Route = createFileRoute("/email-confirmed")({
  head: () => ({ meta: [{ title: "Email confirmed | Linara" }] }),
  validateSearch: (search: Record<string, unknown>): ConfirmedSearch =>
    search.for === "helper" || search.for === "manager" ? { for: search.for } : {},
  component: EmailConfirmed,
});

/** The app's own sign-in screen (LINARA_MOBILE scheme "linaramobile", app/(auth)/sign-in.tsx). */
const APP_SIGN_IN = "linaramobile://sign-in";

function EmailConfirmed() {
  const { for: who = "manager" } = Route.useSearch();
  const [expired, setExpired] = useState(false);
  const [onPhone, setOnPhone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    setExpired(/error=|error_code=/.test(hash));
    // Don't leave a session token sitting in the address bar or history.
    if (hash)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const phone = /Android|iPhone|iPad/i.test(navigator.userAgent);
    setOnPhone(phone);
    // Like Discord: on a phone, the app first. Does nothing if it isn't installed.
    if (phone && !/error=|error_code=/.test(hash)) window.location.href = APP_SIGN_IN;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <LogoMark className="h-10 w-10" />
        {expired ? (
          <>
            <h1 className="mt-4 flex items-center gap-2 font-display text-2xl text-foreground">
              <AlertCircle className="h-6 w-6 text-terracotta-ink" /> This link has expired
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {who === "helper"
                ? "Luma na o nagamit na ang link na ito. Bumalik sa Linara app at subukan ulit ang invite code mo; magpapadala kami ng bagong link."
                : "It was already used, or it's too old. Try signing in; if it says your email isn't confirmed, sign up again with the same email and we'll send a new link."}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 flex items-center gap-2 font-display text-2xl text-foreground">
              <CheckCircle2 className="h-6 w-6 text-primary" /> Email confirmed
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {who === "helper"
                ? "Na-confirm na ang email mo. Bumalik sa Linara app para tapusin ang pag-claim o mag-sign in."
                : "You're all set. Sign in to finish setting up your household."}
            </p>
          </>
        )}

        <div className="mt-5 space-y-2">
          {(who === "helper" || onPhone) && (
            <a
              href={APP_SIGN_IN}
              className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
            >
              {who === "helper" ? "Buksan ang Linara app" : "Open the Linara app"}
            </a>
          )}
          {who === "manager" && (
            <Link
              to="/login"
              className={`flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition ${
                onPhone
                  ? "border border-border bg-card text-foreground hover:bg-secondary"
                  : "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90"
              }`}
            >
              {onPhone ? "Continue in the browser" : "Sign in"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
