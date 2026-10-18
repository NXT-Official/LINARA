import { Link } from "@tanstack/react-router";

import { Modal } from "@/components/shared/modal";

import type { SeatKind } from "../billing.types";

/** Shown instead of a toast when an invite is refused for want of a seat. */
export function SeatLimitModal({ kind, onClose }: { kind: SeatKind; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h3 className="font-display text-xl text-foreground">
        {`You've used every ${kind} seat on your plan.`}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Add seats or pick a bigger plan, then send the invite again. Everyone you already have keeps
        working.
      </p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Not now
        </button>
        <Link
          to="/manager/plan"
          onClick={onClose}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          See your plan
        </Link>
      </div>
    </Modal>
  );
}
