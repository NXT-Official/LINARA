import type { ReactNode } from "react";

/**
 * A labelled form control. `error` shows under it and is announced, so a form
 * that won't save says why instead of just sitting there (QA, 2026-10-02).
 * Pair it with `aria-invalid` on the control.
 */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-semibold text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
