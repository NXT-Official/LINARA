/**
 * The Linara logomark: the "i" whose dot lifts into a check that becomes a
 * roofline -- done, and home (brand doc, "Logomark"). Drawn to match the PWA
 * icons in public/ so the tab, the home screen and the app header agree.
 * An interim mark until a designer delivers the final one (KNOWN_GAPS C51).
 */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Linara">
      <rect width="512" height="512" rx="112" fill="var(--pine)" />
      <polyline
        points="157,143 199,181 257,117 348,208"
        fill="none"
        stroke="var(--terracotta)"
        strokeWidth="42"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="221" y="262" width="69" height="164" rx="34.5" fill="var(--card)" />
    </svg>
  );
}

/** Mark + lowercase wordmark, the lockup used in app chrome. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9 shrink-0" />
      <span
        aria-hidden="true"
        className="font-wordmark text-2xl font-semibold leading-none tracking-tight text-primary"
      >
        linara
      </span>
    </span>
  );
}
