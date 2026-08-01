import { useState } from "react";

import { ReviewRow } from "@/components/shared/detail-row";
import type { Helper, Invite } from "@/features/people/people.types";

export function MyTerms({ helper, invite }: { helper: Helper; invite: Invite | null }) {
  const [open, setOpen] = useState(false);
  const employment = invite?.employment
    ? invite.employment === "live-in"
      ? "Live-in"
      : "Live-out"
    : "—";
  const role = invite?.station ?? helper.station;
  const shift = invite?.shift ?? helper.shift;
  const restDay = invite?.restDay ?? helper.restDay;
  const wage = invite?.wagePHP ? `₱${invite.wagePHP.toLocaleString()} / month` : "Not on file yet";
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            On file with this household
          </div>
          <div className="mt-1 font-display text-lg text-foreground">
            Your terms — as the employer entered them
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read-only. Tap to {open ? "hide" : "review"} any time.
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {open ? "Hide" : "Review"}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-2 rounded-2xl bg-background/60 p-4 text-sm">
          <ReviewRow label="Pangalan" value={invite?.name ?? helper.name} />
          <ReviewRow label="Role / station" value={role} />
          <ReviewRow label="Employment" value={employment} />
          <ReviewRow label="Shift" value={shift} />
          <ReviewRow label="Rest day" value={restDay} />
          <ReviewRow label="Monthly wage" value={wage} />
          {invite?.phone && <ReviewRow label="Contact on file" value={invite.phone} />}
          <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
            May mali? Sabihin mo sa manager mo — huwag muna pumirma kung hindi tugma sa usapan.
          </p>
        </div>
      )}
    </section>
  );
}
