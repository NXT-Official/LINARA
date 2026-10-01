import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/shared/logo";

import { LEGAL_LAST_UPDATED, PRIVACY_CONTACT_EMAIL } from "./legal.constants";

/**
 * Shared frame for /privacy and /terms (KNOWN_GAPS.md O8). Public: no session
 * needed, since app stores and the helper app link here. Both documents are
 * drafts until a lawyer has reviewed them, and say so at the top.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Linara — home"
        >
          <LogoMark className="h-8 w-8" />
          <span className="font-wordmark text-xl font-semibold text-primary">linara</span>
        </Link>
        <LegalLinks className="flex gap-4 text-sm font-semibold text-muted-foreground" />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>
        <p
          role="note"
          className="mt-6 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          <strong>Draft, under legal review.</strong> This describes how Linara works today, in
          plain words. It is not final and may change before Linara opens to the public.
        </p>
        <article className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground [&_h2]:pt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-primary [&_h3]:pt-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
          {children}
        </article>
      </main>

      <footer className="border-t border-border/40 px-4 py-8 text-center text-sm text-muted-foreground">
        © 2026 Linara Home · <LegalLinks className="inline-flex gap-3" />
      </footer>
    </div>
  );
}

function LegalLinks({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Legal">
      <Link
        to="/privacy"
        className="hover:text-foreground"
        activeProps={{ className: "text-foreground" }}
      >
        Privacy
      </Link>
      <Link
        to="/terms"
        className="hover:text-foreground"
        activeProps={{ className: "text-foreground" }}
      >
        Terms
      </Link>
    </nav>
  );
}

/** Who to write to, or a visible gap where that goes until it's decided. */
export function PrivacyContact() {
  if (PRIVACY_CONTACT_EMAIL) {
    return (
      <a className="font-semibold text-primary underline" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
        {PRIVACY_CONTACT_EMAIL}
      </a>
    );
  }
  return <strong>[contact address to be added before publication]</strong>;
}
