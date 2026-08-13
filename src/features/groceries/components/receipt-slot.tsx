import { Camera } from "lucide-react";
import { useState } from "react";

import { useGrocery } from "../grocery-context";

/**
 * Read-only view of the active Palengke ticket's uploaded receipt. Nothing
 * here attaches or clears one -- that's LINARA_MOBILE's job (see
 * KNOWN_GAPS.md Closed Gap C13); this app only displays whatever the helper
 * already uploaded via tickets.photo_evidence_url.
 */
export function ReceiptSlot({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  const [preview, setPreview] = useState(false);

  if (!ctx.receiptPhoto) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground/70 ${compact ? "" : ""}`}
      >
        <Camera className="h-3.5 w-3.5" /> No receipt yet
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setPreview(true)}
        className={`flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-2 text-left ${compact ? "" : "sm:p-3"}`}
      >
        <span className="shrink-0 overflow-hidden rounded-xl">
          <img src={ctx.receiptPhoto} alt="Receipt" className="h-12 w-12 object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">Receipt attached</span>
          <span className="block text-[11px] text-muted-foreground">Tap to view</span>
        </span>
      </button>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
          onClick={() => setPreview(false)}
        >
          <img
            src={ctx.receiptPhoto}
            alt="Receipt"
            className="max-h-[85vh] rounded-2xl shadow-lift"
          />
        </div>
      )}
    </>
  );
}
