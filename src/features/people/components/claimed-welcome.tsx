import { Check } from "lucide-react";

import type { Invite } from "../people.types";

export function ClaimedWelcome({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-lift">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-display text-2xl text-foreground">
          Welcome, {invite.claimedName || invite.name}.
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ito na 'yung Station mo. Nandito lahat ng gagawin ngayon — at ang record mo, sa'yo pa rin,
          kahit saan ka magtrabaho.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          Go to my Station
        </button>
      </div>
    </div>
  );
}
