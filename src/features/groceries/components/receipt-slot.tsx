import { useState } from "react";

import { Modal } from "@/components/shared/modal";

import { useGrocery } from "../grocery-context";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The palengke receipts: ones snapped in the app after buying
 * (grocery_receipts), and the active Palengke Run's photo. Read-only here;
 * staff take them in LINARA_MOBILE. It used to be a dashed pill that looked
 * like a button and did nothing when there was none (client feedback,
 * 2026-10-02), so with none it now just says where they come from.
 */
export function ReceiptSlot({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  const [preview, setPreview] = useState<string | null>(null);

  const shots = [
    ...(ctx.receiptPhoto
      ? [{ id: "run", url: ctx.receiptPhoto, label: "Palengke run", sub: "Today" }]
      : []),
    ...ctx.receipts.map((r) => ({
      id: r.id,
      url: r.url,
      label: r.byName ? `From ${r.byName.split(" ")[0]}` : "Receipt",
      sub: when(r.createdAt),
    })),
  ];

  if (shots.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No receipt yet. Staff add one from the Linara app after buying.
      </p>
    );
  }

  return (
    <>
      <ul className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {shots.slice(0, compact ? 1 : shots.length).map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setPreview(s.url)}
              className="flex w-full items-center gap-2 rounded-2xl bg-background/60 p-2 text-left ring-1 ring-border/20"
            >
              <span className="shrink-0 overflow-hidden rounded-xl">
                <img src={s.url} alt="" className="h-12 w-12 object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.sub} · tap to view</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {preview && (
        <Modal onClose={() => setPreview(null)} bare closeOnBackdrop>
          <button type="button" onClick={() => setPreview(null)} aria-label="Close receipt">
            <img src={preview} alt="Receipt" className="max-h-[85dvh] rounded-2xl shadow-lift" />
          </button>
        </Modal>
      )}
    </>
  );
}
