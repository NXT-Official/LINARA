import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { PlansComparison } from "@/features/plan/components/plans-comparison";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const KITCHEN = [
  {
    term: "House Standards (SOPs)",
    body: "Define standards once, like laundry instructions or child allergy guidelines. The operating manual stays in the home, ending continuous retraining.",
  },
  {
    term: "After-Hours Ledger",
    body: "Off-shift tasks automatically register rest-owed minutes to the ledger. Work is balanced transparently without the need to calculate hourly OT.",
  },
  {
    term: "Pantry-to-Palengke",
    body: "Low pantry stocks automatically populate the grocery checklist. The buyer gets clear budgets, actual cost inputs, and silent receipt-photo uploads.",
  },
];

function LandingPage() {
  const t = useT();
  // Password-reset emails land here when the sender passed no redirect (the
  // Supabase Site URL default, e.g. from a LINARA_MOBILE build without
  // EXPO_PUBLIC_WEB_APP_URL). Hand the recovery fragment to the reset page.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("error_code=otp_expired")) {
      window.location.replace(`/reset-password${hash}`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* 1. Wordmark Header */}
      <header
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6"
        role="banner"
      >
        <Link
          to="/"
          aria-label={t("landing.linaraHome")}
          className="flex min-h-11 items-center gap-1.5 select-none"
        >
          {/* Logo combining text dot into soft check and roofline */}
          <span
            aria-hidden="true"
            className="font-wordmark text-2xl font-bold tracking-wider text-primary flex items-center gap-0.5"
          >
            {richText(t("landing.lNara"), {
              span: (
                // eslint-disable-next-line i18next/no-literal-string
                <span className="relative inline-block">
                  i
                  <span className="absolute -top-1 left-0 h-1.5 w-1.5 rounded-full bg-accent"></span>
                </span>
              ),
            })}
          </span>
        </Link>
        {/* One way in for an account that exists (a signed-in manager is sent
            straight on to the Pass), one for a new one. */}
        <nav aria-label={t("landing.account")} className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            {t("landing.logIn")}
          </Link>
          <Link
            to="/signup"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-colors"
          >
            {t("landing.getStarted")}
          </Link>
        </nav>
      </header>

      {/* 2. Hero Section */}
      <section
        className="mx-auto max-w-5xl px-6 py-16 text-center lg:py-24"
        aria-labelledby="hero-title"
      >
        <h1
          id="hero-title"
          className="font-display text-5xl font-semibold tracking-tight text-primary sm:text-6xl lg:text-7xl leading-[1.1]"
        >
          {richText(t("landing.clarityOverControl"), {
            br: <br />,
            span: (
              <span className="text-terracotta-ink font-medium">
                {t("landing.dignityByDesign")}
              </span>
            ),
          })}
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("landing.anOperatingSystemForThe")}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4">
          {/* Opens on Set up your household; a signed-in visitor is sent on to the Pass. */}
          <Link
            to="/signup"
            search={{ step: "household" }}
            className="w-full rounded-lg bg-accent px-8 py-4 text-sm font-semibold text-accent-foreground shadow-soft hover:bg-accent/90 transition-all sm:w-auto text-center"
          >
            {t("landing.setUpYourHousehold")}
          </Link>
          {/* The other two ways in: a co-manager with a code, and a kasambahay,
              whose Linara is the app. */}
          <p className="flex flex-col text-sm text-muted-foreground sm:flex-row sm:gap-5">
            <Link
              to="/signup"
              search={{ step: "join" }}
              className="inline-flex min-h-11 items-center justify-center underline underline-offset-4 hover:text-foreground"
            >
              {t("landing.haveACodeFromA")}
            </Link>
            <Link
              to="/signup"
              search={{ step: "kasambahay" }}
              className="inline-flex min-h-11 items-center justify-center underline underline-offset-4 hover:text-foreground"
            >
              {t("landing.workInAHouseholdGet")}
            </Link>
          </p>
        </div>
      </section>

      {/* 3. The kitchen metaphor: three ideas as one list, not three
          identical icon cards (UI/UX audit 2026-10-29). */}
      <section
        className="border-y border-border/40 bg-card/60 py-16"
        aria-labelledby="kitchen-title"
      >
        <div className="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          <div>
            <h2
              id="kitchen-title"
              className="font-display text-3xl font-semibold text-primary sm:text-4xl"
            >
              {t("landing.aRestaurantKitchenForThe")}
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              {t("landing.weTranslateProvenRestaurantManagement")}
            </p>
          </div>

          <dl className="divide-y divide-border/70 border-y border-border/70">
            {KITCHEN.map(({ term, body }) => (
              <div key={term} className="py-5 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <dt className="font-display text-lg font-semibold text-primary">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground sm:mt-0.5">
                  {body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 4. The Two Lenses Highlight Section */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-24" aria-labelledby="lenses-title">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2
              id="lenses-title"
              className="font-display text-3xl font-semibold text-primary sm:text-4xl"
            >
              {t("landing.oneSourceOfTruthTwo")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("landing.ourAppProvidesDifferentInterfaces")}
            </p>

            <div className="mt-8 space-y-6">
              <div className="flex gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-sans font-semibold text-primary">
                    {t("landing.theManagerSPass")}
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("landing.aReadMostlyAtA")}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-sans font-semibold text-primary">
                    {t("landing.theWorkerSStation")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("landing.aHighContrastMobileScreen")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border/50 bg-card p-8 shadow-soft">
            <div>
              <h3 className="font-display text-xl font-semibold text-primary">
                {t("landing.theirLoginTheirPayRecord")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("landing.theHelperSetsTheirOwn")}
              </p>
              <div className="mt-6 border-t border-border/70 pt-4">
                <div className="text-xs text-muted-foreground">
                  {richText(t("landing.wagesCheckedAgainstTheRegional"), {
                    span: (
                      <span className="font-semibold text-foreground">
                        {t("landing.builtAroundBatasKasambahay")}
                      </span>
                    ),
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Plans, side by side */}
      <PlansComparison />

      {/* 6. Footer */}
      <footer
        className="mx-auto max-w-7xl px-6 py-12 text-center text-xs text-muted-foreground border-t border-border/40"
        role="contentinfo"
      >
        <p>{t("landing.2026LinaraHomeBuiltFor")}</p>
        <p className="mt-1 flex justify-center gap-2">
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center px-2 hover:text-foreground"
          >
            {t("landing.privacy")}
          </Link>
          <Link
            to="/terms"
            className="inline-flex min-h-11 items-center px-2 hover:text-foreground"
          >
            {t("landing.terms")}
          </Link>
          <a href="#plans" className="inline-flex min-h-11 items-center px-2 hover:text-foreground">
            {t("landing.plans")}
          </a>
        </p>
      </footer>
    </div>
  );
}
