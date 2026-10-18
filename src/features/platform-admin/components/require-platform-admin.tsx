import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { usePlatformAdminSession } from "../hooks/use-platform-admin-session";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-3xl bg-card p-6 text-center shadow-soft ring-1 ring-border/20 sm:p-8">
      <h1 className="font-display text-xl text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Link
        to="/manager/pass"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Back to dashboard
      </Link>
    </section>
  );
}

/**
 * Client-side gate for /admin, like the manager's: the session is in
 * localStorage, which the server can't see. The database's RLS is what
 * actually protects the data; this only decides what to show.
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { status, retry } = usePlatformAdminSession();
  const navigate = useNavigate();

  // Replace, not push, so Back doesn't land on a page that bounces again.
  useEffect(() => {
    if (status === "anon") void navigate({ to: "/login", replace: true });
  }, [status, navigate]);

  if (status === "not_admin") {
    return (
      <Notice
        title="This account isn't a Linara admin."
        body="Sign in with the Linara staff account to use these tools."
      />
    );
  }
  if (status === "unavailable") {
    return (
      <Notice
        title="Admin tools aren't switched on yet"
        body="They turn on once the platform admin setup has been applied to the database."
      />
    );
  }
  if (status === "error") {
    return (
      <section
        role="alert"
        className="mx-auto mt-16 max-w-md rounded-3xl bg-card p-6 text-center shadow-soft ring-1 ring-border/20 sm:p-8"
      >
        <h1 className="font-display text-xl text-foreground">Couldn't check admin access.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
        <button
          onClick={retry}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Try again
        </button>
      </section>
    );
  }
  if (status !== "admin") {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex min-h-[50vh] items-center justify-center"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  return <>{children}</>;
}
