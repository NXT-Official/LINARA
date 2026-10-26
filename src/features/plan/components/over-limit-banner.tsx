import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { usePlanUsage } from "../hooks/use-plan-usage";
import { limitText, limitsFor, overLimits, planById } from "../plan.logic";
import { saveSelection, usePlan } from "../plan.store";
import type { ActiveSelection } from "../plan.types";

type Item = { id: string; name: string };

/** What the manager can pick from: households they own, and this household's staff. */
function useChoices(): { households: Item[]; kasambahay: Item[] } {
  const { session, invites } = useAppStores();
  // The household you're in first, so it's the one kept by default.
  const owned = session.households
    .filter((h) => h.role === "primary_manager")
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
    .map((h) => ({ id: h.id, name: h.name }));
  return {
    households: owned.length ? owned : [{ id: "current", name: "This household" }],
    kasambahay: invites.invites
      .filter((i) => i.status !== "ended")
      .map((i) => ({ id: i.id, name: i.claimedName || i.name })),
  };
}

function Picker({
  title,
  items,
  picked,
  limit,
  onChange,
}: {
  title: string;
  items: Item[];
  picked: string[];
  limit: number | null;
  onChange: (ids: string[]) => void;
}) {
  const full = limit !== null && picked.length >= limit;
  return (
    <fieldset className="mt-4">
      <legend className="flex w-full items-baseline justify-between gap-3 text-sm font-semibold text-foreground">
        <span>{title}</span>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {picked.length} of {limit ?? "any"} chosen
        </span>
      </legend>
      <ul className="mt-1.5 divide-y divide-border rounded-2xl border border-border">
        {items.map((item) => {
          const checked = picked.includes(item.id);
          const locked = !checked && full;
          return (
            <li key={item.id}>
              <label
                className={`flex min-h-12 items-center gap-3 px-4 py-2.5 ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-secondary/40"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...picked, item.id] : picked.filter((x) => x !== item.id),
                    )
                  }
                  className="size-4 accent-primary"
                />
                <span className="min-w-0 flex-1 text-sm text-foreground">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {checked ? "Stays active" : "Paused"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function ChooseModal({ onClose }: { onClose: () => void }) {
  const { subscription: sub, selection } = usePlan();
  const choices = useChoices();
  const limits = limitsFor(sub);
  const [picked, setPicked] = useState<ActiveSelection>(
    () =>
      selection ?? {
        households: choices.households.slice(0, limits.households ?? undefined).map((h) => h.id),
        kasambahay: choices.kasambahay.slice(0, limits.kasambahay ?? undefined).map((k) => k.id),
      },
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">Choose what stays active</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {planById(sub.planId)?.name ?? "Your plan"} allows{" "}
        {limitText("households", limits.households)} and{" "}
        {limitText("kasambahay", limits.kasambahay)}. For the rest, new tasks and schedule changes
        pause; nothing is deleted, and you can change this any time. A kasambahay not chosen keeps
        her own app: her record, leave and rest days.
      </p>
      <Picker
        title="Households"
        items={choices.households}
        picked={picked.households}
        limit={limits.households}
        onChange={(households) => setPicked({ ...picked, households })}
      />
      <Picker
        title="Kasambahay in this household"
        items={choices.kasambahay}
        picked={picked.kasambahay}
        limit={limits.kasambahay}
        onChange={(kasambahay) => setPicked({ ...picked, kasambahay })}
      />
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-late-soft px-3 py-2 text-sm text-status-late-ink"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="min-h-11 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            const res = saveSelection(picked, {
              households: choices.households.map((h) => h.id),
              kasambahay: choices.kasambahay.map((k) => k.id),
            });
            if (!res.ok) {
              setError(res.message);
              return;
            }
            toast.success("Saved.", {
              description: "Billing isn't live yet, so nothing changed for your staff.",
            });
            onClose();
          }}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-pine-deep"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

/**
 * On the Pass when the household has more than its plan allows: after
 * moving to a smaller plan, or when a payment is overdue past the grace
 * period. Says what happens and opens the choice.
 */
export function OverLimitBanner() {
  const { subscription: sub, selection } = usePlan();
  const usage = usePlanUsage();
  const [choosing, setChoosing] = useState(false);
  const over = overLimits(sub, usage);
  const restricted = sub.status === "restricted";
  if (!restricted && over.length === 0) return null;

  const text = restricted
    ? "Your plan's payment is overdue, so only what you choose stays active. For the rest, new tasks and changes pause until it's paid."
    : "You have more than your plan allows. Choose what stays active; for the rest, new tasks and changes pause.";

  return (
    <section
      role="status"
      className={`rounded-3xl p-5 sm:p-6 ${restricted ? "bg-status-late-soft" : "bg-terracotta-soft"}`}
    >
      <p className={`text-sm ${restricted ? "text-status-late-ink" : "text-hearth-ink"}`}>
        {text} Nothing is deleted.
      </p>
      {selection ? (
        <p className={`mt-1 text-xs ${restricted ? "text-status-late-ink" : "text-hearth-ink"}`}>
          You've chosen {selection.households.length} household
          {selection.households.length === 1 ? "" : "s"} and {selection.kasambahay.length}{" "}
          kasambahay to stay active.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setChoosing(true)}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-pine-deep"
        >
          {selection ? "Change what stays active" : "Choose what stays active"}
        </button>
        <Link
          to="/manager/plan"
          className="inline-flex min-h-11 items-center rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          See your plan
        </Link>
      </div>
      {choosing ? <ChooseModal onClose={() => setChoosing(false)} /> : null}
    </section>
  );
}
