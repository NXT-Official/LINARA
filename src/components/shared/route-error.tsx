import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/locale-context";

/**
 * Page-level failure. Rendered in the outlet, so the header, the persona
 * switcher, and the nav stay usable while one page is broken.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const t = useT();
  console.error(error);
  const router = useRouter();

  return (
    <section
      role="alert"
      className="rounded-3xl ring-1 ring-border/20 bg-card p-6 text-center shadow-soft sm:p-8"
    >
      <h1 className="font-display text-xl text-foreground">{t("common.thisPageDidnTLoad")}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t("common.somethingWentWrongHereThe")}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        {t("common.tryAgain")}
      </button>
    </section>
  );
}
