import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Calendar,
  Clock,
  type LucideIcon,
  Receipt,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import type { LandingContent, LandingIcon } from "@/features/landing/landing-content";

const ICONS: Record<LandingIcon, LucideIcon> = {
  "book-open": BookOpen,
  clock: Clock,
  receipt: Receipt,
  calendar: Calendar,
  wallet: Wallet,
  users: Users,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
};

/**
 * Public homepage. Markup and classes are the pre-CMS page verbatim
 * (pinned by landing-view.test.tsx); only text and visibility come from
 * `content`. Link destinations and the wordmark are code-owned.
 */
export function LandingView({ content }: { content: LandingContent }) {
  const { header, hero, kitchen, lenses, account, footer } = content;
  const showLenses = !lenses.hidden;
  const showAccount = !account.hidden;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* 1. Wordmark Header */}
      <header
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6"
        role="banner"
      >
        <div className="flex items-center gap-1.5 select-none">
          {/* Logo combining text dot into soft check and roofline */}
          <span className="font-wordmark text-2xl font-bold tracking-wider text-primary flex items-center gap-0.5">
            l
            <span className="relative inline-block">
              i<span className="absolute -top-1 left-0 h-1.5 w-1.5 rounded-full bg-accent"></span>
            </span>
            nara
          </span>
        </div>
        <Link
          to="/manager/pass"
          className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-colors"
        >
          {header.ctaLabel}
        </Link>
      </header>

      {/* 2. Hero Section */}
      <section
        className="mx-auto max-w-5xl px-6 py-16 text-center lg:py-24"
        aria-labelledby="hero-title"
      >
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <span>{hero.kicker}</span>
        </div>

        <h1
          id="hero-title"
          className="mt-8 font-display text-5xl font-semibold tracking-tight text-primary sm:text-6xl lg:text-7xl leading-[1.1]"
        >
          {hero.headlineLine1} <br />
          <span className="text-terracotta-ink font-medium">{hero.headlineLine2}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {hero.description}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/manager/pass"
            className="w-full rounded-lg bg-accent px-8 py-4 text-sm font-semibold text-accent-foreground shadow-soft hover:bg-accent/90 transition-all sm:w-auto text-center"
          >
            {hero.ctaLabel}
          </Link>
        </div>
      </section>

      {/* 3. The Metaphor comparison cards */}
      {!kitchen.hidden && (
        <section
          className="bg-white/50 py-16 border-y border-border/40"
          aria-labelledby="kitchen-title"
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center">
              <h2
                id="kitchen-title"
                className="font-display text-3xl font-semibold text-primary sm:text-4xl"
              >
                {kitchen.heading}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{kitchen.body}</p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {kitchen.cards.map((card) => {
                const Icon = ICONS[card.icon];
                return (
                  <div
                    key={card._key}
                    className="rounded-3xl border border-border/50 bg-card p-6 shadow-soft hover:border-primary/30 transition-all"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 font-display text-lg font-semibold text-primary">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {card.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 4. The Two Lenses Highlight Section */}
      {(showLenses || showAccount) && (
        <section className="mx-auto max-w-7xl px-6 py-16 lg:py-24" aria-labelledby="lenses-title">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {showLenses && (
              <div>
                <h2
                  id="lenses-title"
                  className="font-display text-3xl font-semibold text-primary sm:text-4xl"
                >
                  {lenses.heading}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {lenses.body}
                </p>

                <div className="mt-8 space-y-6">
                  {lenses.items.map((lens, index) => (
                    <div key={lens._key} className="flex gap-4">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-sans font-semibold text-primary">{lens.title}</h3>
                        <p className="text-sm text-muted-foreground">{lens.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAccount && (
              <div className="rounded-3xl border border-border/50 bg-card p-8 shadow-lift relative overflow-hidden">
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 -mr-16 -mt-16"></div>
                <div className="relative">
                  <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                    {account.badge}
                  </span>
                  <h3
                    // Without the lenses column this card names the section.
                    id={showLenses ? undefined : "lenses-title"}
                    className="mt-3 font-display text-xl font-semibold text-primary"
                  >
                    {account.heading}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {account.body}
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {account.complianceTitle}
                      </span>{" "}
                      · {account.complianceBody}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. Footer */}
      <footer
        className="mx-auto max-w-7xl px-6 py-12 text-center text-xs text-muted-foreground border-t border-border/40"
        role="contentinfo"
      >
        <p>{footer.copyright}</p>
        <p className="mt-2 flex justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">
            {footer.privacyLabel}
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            {footer.termsLabel}
          </Link>
        </p>
      </footer>
    </div>
  );
}
