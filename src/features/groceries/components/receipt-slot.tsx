import { Camera, Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { photoFilename, savePhotoUrl } from "@/lib/evidence-photo";
import { shortNameOf } from "@/features/people/people.utils";

import { useGrocery } from "../grocery-context";
import type { GroceryReceipt } from "../grocery.types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The palengke receipts: ones snapped in the app after buying
 * (grocery_receipts), and the active Palengke Run's photo. Staff take them
 * in LINARA_MOBILE; a manager who did the shopping adds one here (KNOWN_GAPS
 * O29). On a phone the file picker offers the camera too.
 *
 * Receipts are deleted after 2 months (KNOWN_GAPS.md O28) -- the costs stay
 * on the list items -- so the full view offers to save one.
 *
 * With `runId`, just that run's receipts, and a new one goes with it.
 * Without, only receipts that belong to no run (the Needed list): a run's
 * receipts live with the run, and listing them here too showed them twice.
 * `receipts` shows a given list instead (a closed run in History), with no
 * add button.
 */
export function ReceiptSlot({
  compact,
  runId,
  receipts,
}: { compact?: boolean; runId?: string; receipts?: GroceryReceipt[] } = {}) {
  const ctx = useGrocery();
  const readOnly = receipts !== undefined;
  const list = receipts ?? ctx.receipts.filter((r) => (runId ? r.runId === runId : !r.runId));
  const [preview, setPreview] = useState<{ url: string; takenAt?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    ctx
      .addReceipt(file, runId)
      .then(() => toast.success("Receipt added"))
      .catch((err) => {
        console.error("[ReceiptSlot] Failed to add receipt:", err);
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't add the receipt. Try again.",
        );
      })
      .finally(() => setUploading(false));
  };

  const addButton = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInput.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5 disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {uploading ? "Adding…" : "Add receipt"}
      </button>
    </>
  );

  const shots = [
    ...(ctx.receiptPhoto && !runId && !readOnly
      ? [
          {
            id: "run",
            url: ctx.receiptPhoto,
            thumb: ctx.receiptPhoto,
            label: "Palengke run",
            sub: "Today",
            takenAt: undefined,
          },
        ]
      : []),
    ...list.map((r) => ({
      id: r.id,
      url: r.url,
      thumb: r.thumbUrl ?? r.url,
      label: r.byName ? `From ${shortNameOf(r.byName)}` : "Receipt",
      sub: when(r.createdAt),
      takenAt: r.createdAt,
    })),
  ];

  if (shots.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {readOnly
            ? "No receipt kept for this run."
            : "No receipt yet. Staff add one from the Linara app after buying."}
        </p>
        {!readOnly && addButton}
      </div>
    );
  }

  return (
    <>
      <ul className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {shots.slice(0, compact ? 1 : shots.length).map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setPreview({ url: s.url, takenAt: s.takenAt })}
              className="flex w-full items-center gap-2 rounded-2xl bg-background/60 p-2 text-left ring-1 ring-border/20"
            >
              <span className="shrink-0 overflow-hidden rounded-xl">
                <img src={s.thumb} alt="" className="h-12 w-12 object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.sub} · tap to view</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!compact && !readOnly && <div className="mt-2 flex justify-end">{addButton}</div>}
      {preview && (
        <Modal onClose={() => setPreview(null)} bare closeOnBackdrop>
          <figure className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => setPreview(null)} aria-label="Close receipt">
              <img
                src={preview.url}
                alt="Receipt"
                className="max-h-[78dvh] rounded-2xl shadow-lift"
              />
            </button>
            <figcaption className="flex items-center gap-3 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-lift">
              <span>Kept 2 months</span>
              <a
                href={savePhotoUrl(preview.url, photoFilename("receipt", preview.takenAt))}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Save receipt
              </a>
            </figcaption>
          </figure>
        </Modal>
      )}
    </>
  );
}
