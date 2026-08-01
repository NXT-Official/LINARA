import { Camera, X } from "lucide-react";
import { useState } from "react";

import { useGrocery } from "../grocery-context";

export function ReceiptSlot({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  const [preview, setPreview] = useState(false);
  if (ctx.receiptPhoto) {
    return (
      <>
        <div
          className={`flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-2 ${compact ? "" : "sm:p-3"}`}
        >
          <button onClick={() => setPreview(true)} className="shrink-0 overflow-hidden rounded-xl">
            <img src={ctx.receiptPhoto} alt="Receipt" className="h-12 w-12 object-cover" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">Receipt attached</div>
            <div className="text-[11px] text-muted-foreground">Tap to view</div>
          </div>
          <button
            onClick={ctx.clearReceipt}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
            aria-label="Remove receipt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
  return (
    <button
      onClick={ctx.attachReceipt}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
    >
      <Camera className="h-3.5 w-3.5" /> Attach receipt photo
    </button>
  );
}
