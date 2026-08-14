import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock, Receipt, Sparkles, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* 1. Wordmark Header */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6" role="banner">
        <div className="flex items-center gap-1.5 select-none">
          {/* Logo combining text dot into soft check and roofline */}
          <span className="font-display text-2xl font-bold tracking-wider text-primary flex items-center gap-0.5">
            l
            <span className="relative inline-block">
              i
              <span className="absolute -top-1 left-0 h-1.5 w-1.5 rounded-full bg-accent"></span>
            </span>
            nara
          </span>
        </div>
        <Link
          to="/manager/pass"
          className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-colors"
        >
          Open Manager Pass
        </Link>
      </header>

      {/* 2. Hero Section */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center lg:py-24" aria-labelledby="hero-title">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>Home, made clear.</span>
        </div>
        
        <h1 id="hero-title" className="mt-8 font-display text-5xl font-semibold tracking-tight text-primary sm:text-6xl lg:text-7xl leading-[1.1]">
          Clarity over control. <br />
          <span className="text-accent font-medium">Dignity by design.</span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          An operating system for the Filipino household where a family and the people who help run it manage work, pay, and care together, on fair terms.
        </p>
        
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/manager/pass"
            className="w-full rounded-full bg-accent px-8 py-4 text-sm font-semibold text-accent-foreground shadow-soft hover:bg-accent/90 transition-all sm:w-auto text-center"
          >
            Start Household Pass
          </Link>
          <Link
            to="/helper/today"
            className="w-full rounded-full border border-border bg-white px-8 py-4 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-all sm:w-auto text-center"
          >
            May Invite Code ako (Helper)
          </Link>
        </div>
      </section>

      {/* 3. The Metaphor comparison cards */}
      <section className="bg-white/50 py-16 border-y border-border/40" aria-labelledby="kitchen-title">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">The Concept</span>
            <h2 id="kitchen-title" className="mt-2 font-display text-3xl font-semibold text-primary sm:text-4xl">
              A restaurant kitchen for the home
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              We translate proven restaurant management structures into collaborative tools that eliminate friction, ambiguity, and overwork.
            </p>
          </div>
          
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl border border-border/50 bg-card p-6 shadow-soft hover:border-primary/30 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-primary">House Standards (SOPs)</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Define standards once—like laundry instructions or child allergy guidelines. The operating manual stays in the home, ending continuous retraining.
              </p>
            </div>
            
            <div className="rounded-3xl border border-border/50 bg-card p-6 shadow-soft hover:border-primary/30 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-primary">After-Hours Ledger</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Off-shift tasks automatically register rest-owed minutes to the ledger. Work is balanced transparently without the need to calculate hourly OT.
              </p>
            </div>
            
            <div className="rounded-3xl border border-border/50 bg-card p-6 shadow-soft hover:border-primary/30 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Receipt className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-primary">Pantry-to-Palengke</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Low pantry stocks automatically populate the grocery checklist. The buyer gets clear budgets, actual cost inputs, and silent receipt-photo uploads.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Two Lenses Highlight Section */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-24" aria-labelledby="lenses-title">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 id="lenses-title" className="font-display text-3xl font-semibold text-primary sm:text-4xl">
              One source of truth, two lenses
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Our app provides different interfaces tailored specifically to each user’s job and environment. 
            </p>
            
            <div className="mt-8 space-y-6">
              <div className="flex gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-primary">The Manager's Pass</h4>
                  <p className="text-sm text-muted-foreground">
                    A read-mostly, at-a-glance dashboard showing status bars, active boards, and money dials. Perfect for busy parents or OFW families managing from abroad.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-primary">The Worker's Station</h4>
                  <p className="text-sm text-muted-foreground">
                    A high-contrast mobile screen displaying a single focal card. No open chat channels—instead, work is tracked as secure, silent tickets.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border/50 bg-card p-8 shadow-lift relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 -mr-16 -mt-16"></div>
            <div className="relative">
              <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">Portable Records</span>
              <h3 className="mt-3 font-display text-xl font-semibold text-primary">Her work history is hers to keep</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                In Linara, the helper owns her credentials and history. Her logs, verified payslips, and completed training modules form a portable portfolio she can present to banks, agencies, or future employers.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Batas Kasambahay Compliant</span> · Regional rates and statutory splits checked and validated on-chain.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="mx-auto max-w-7xl px-6 py-12 text-center text-xs text-muted-foreground border-t border-border/40" role="contentinfo">
        <p>© 2026 Linara Home. Built for dignity, clarity, and household harmony.</p>
      </footer>
    </div>
  );
}
