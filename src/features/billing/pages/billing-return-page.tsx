import { Link } from "@tanstack/react-router";

import { LogoMark } from "@/components/shared/logo";

/**
 * Where Xendit sends a household after the payment page. Public on purpose:
 * the Linara app opens Xendit in the system browser, where no web session
 * exists. Says nothing the redirect can't know: the plan itself moves when
 * Xendit's webhook arrives.
 */
export function BillingReturnPage({ paid }: { paid: "1" | "0" | undefined }) {
  const ok = paid === "1";
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <header className="mx-auto flex max-w-3xl items-center px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="font-wordmark text-xl font-semibold text-primary">linara</span>
        </span>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-soft sm:p-8">
          <h1 role="status" className="font-display text-2xl text-foreground">
            {ok ? "Paid, thank you." : "Payment didn't go through. Try again when you're ready."}
          </h1>
          {ok && (
            <p className="mt-2 text-sm text-muted-foreground">
              Xendit tells Linara within a minute; your plan updates on its own.
            </p>
          )}
          <Link
            to="/manager/plan"
            search={paid ? { paid } : {}}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-pine-deep"
          >
            Back to your plan
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            In the Linara app? Close this tab and go back to the app.
          </p>
        </section>
      </main>
    </div>
  );
}
