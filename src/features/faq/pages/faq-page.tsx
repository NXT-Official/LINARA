import { Link } from "@tanstack/react-router";

import { LogoMark } from "@/components/shared/logo";

import { FaqList } from "../components/faq-list";
import type { Faq } from "../faq.types";

const CONTACT_HREF = "/manager/help";

/** Public: no session needed. The loader always supplies answers. */
export function FaqPage({ faqs }: { faqs: Faq[] }) {
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
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
          Questions, answered
        </h1>
        <p className="mb-8 mt-2 text-sm text-muted-foreground">
          What Linara is, how pay and privacy work, and how to reach us.
        </p>
        <FaqList faqs={faqs} contactHref={CONTACT_HREF} />
      </main>
    </div>
  );
}
