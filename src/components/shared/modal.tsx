import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Every overlay in the app goes through this. Layering, top to bottom:
 * toasts (sonner) > modal (z-50) > bottom nav (z-40) > top bar (z-30).
 *
 * - Portalled to <body>, so no parent's stacking context (the sticky header's
 *   backdrop blur, a transformed card) can trap it under the nav again.
 * - A bottom sheet on phones (clear of the home indicator), centred from `sm`.
 * - Capped to the viewport and scrolls inside itself, so a long form's buttons
 *   are always reachable -- the page behind is scroll-locked and can't help.
 * - Escape closes. A backdrop tap does not by default: most of these are
 *   forms, and a stray tap shouldn't throw away what someone typed.
 * - Named by its first heading for screen readers; focus moves in on open and
 *   returns to whatever opened it on close.
 */
export function Modal({
  onClose,
  children,
  size = "md",
  scroll = "panel",
  closeOnBackdrop = false,
  bare = false,
}: {
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
  /** "inner": the content lays out its own scrolling body (header/body/footer). */
  scroll?: "panel" | "inner";
  closeOnBackdrop?: boolean;
  /** No panel chrome -- for a media lightbox. */
  bare?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const heading = panel?.querySelector<HTMLElement>("h1, h2, h3");
    if (panel && heading) {
      if (!heading.id) heading.id = headingId;
      panel.setAttribute("aria-labelledby", heading.id);
    }
    panel?.focus({ preventScroll: true });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [headingId]);

  if (typeof document === "undefined") return null;

  const width = size === "lg" ? "max-w-lg" : "max-w-md";
  const panelCls = bare
    ? "max-h-full outline-none"
    : [
        // Phone: a sheet flush to the bottom edge, home-indicator space inside
        // its padding. From sm: a centred card.
        "w-full rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift outline-none",
        "sm:rounded-3xl sm:p-6",
        width,
        "max-h-[calc(100dvh-0.75rem)] sm:max-h-[calc(100dvh-1.5rem)]",
        scroll === "panel" ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden",
      ].join(" ");

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center backdrop-blur-sm ${
        bare ? "items-center bg-ink/70 p-4" : "items-end bg-ink/40 pt-3 sm:items-center sm:p-3"
      }`}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className={panelCls}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
