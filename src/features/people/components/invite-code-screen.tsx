import { Check, Link2, X } from "lucide-react";
import { useState } from "react";

import type { Invite } from "../people.types";

export function InviteCodeScreen({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Invite created
            </div>
            <h3 className="mt-1 font-display text-2xl text-foreground">
              Share this code with {invite.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-dashed border-primary/40 bg-primary/5 px-5 py-6 text-center">
          <div className="font-display text-4xl font-semibold tracking-[0.15em] text-primary">
            {invite.code}
          </div>
          <button
            onClick={copy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:border-primary"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3" /> Copy code
              </>
            )}
          </button>
        </div>

        <div className="mt-5 space-y-2 rounded-2xl bg-background/60 p-4 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">{invite.station}</span> ·{" "}
            {invite.employment === "live-in" ? "Live-in" : "Live-out"}
          </div>
          <div>Shift: {invite.shift}</div>
          <div>Rest day: {invite.restDay}</div>
          <div>Wage: ₱{invite.wagePHP.toLocaleString()} / month</div>
          {invite.phone && <div>Contact: {invite.phone}</div>}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          She'll set up and control her own account with this code — her record stays hers. Until
          then she'll appear as{" "}
          <span className="font-semibold text-foreground">Invited — pending</span> in your People
          list.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
