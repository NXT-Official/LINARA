import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

/**
 * Page-level failure. Rendered in the outlet, so the header, the persona
 * switcher, and the nav stay usable while one page is broken.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <section
      role="alert"
      className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-soft sm:p-8"
    >
      <h1 className="font-display text-xl text-foreground">This page didn't load</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Something went wrong here. The rest of Linara is fine — try again, or pick another tab.
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Try again
      </button>
    </section>
  );
}
