import { AlertCircle, ChevronDown, Info, LogOut, Pencil, Tags } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { LabelChips } from "@/features/teams/components/label-chip";
import type { Label } from "@/features/teams/teams.types";

import { REGIONAL_MINIMUM_WAGE } from "../people.constants";
import type { Invite, PantryRole } from "../people.types";
import { initialsOf } from "../people.utils";
import { LegalContributionSplitCard } from "./legal-contribution-split-card";
import { PantryRolePicker } from "./pantry-role-picker";

/**
 * One helper, or one pending invite, on People. In a large household
 * (`compact`) the row is one line of who and where, and opens for the rest:
 * terms, pantry role, contributions and actions.
 */
export function HelperRow({
  inv,
  canInvite,
  compact,
  teamName,
  labels,
  alsoAt = [],
  selectable,
  selected,
  onSelect,
  onShowCode,
  onCancelInvite,
  onEditWage,
  onEditTeam,
  onEnd,
  onSetPantryRole,
}: {
  inv: Invite;
  canInvite: boolean;
  compact: boolean;
  /** Shown when the list isn't already grouped by team. */
  teamName: string | null;
  labels: Label[];
  /** The family's other households she also works in. */
  alsoAt?: string[];
  /** Bulk selection is on. */
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onShowCode: () => void;
  onCancelInvite: () => void;
  onEditWage: () => void;
  /** Absent until add-teams-and-labels.sql is applied. */
  onEditTeam?: () => void;
  onEnd: () => void;
  onSetPantryRole: (role: PantryRole) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const displayName = inv.claimedName || inv.name;
  const isActive = inv.status === "active";
  const expanded = !compact || open;
  const belowMinimum = inv.wagePHP < REGIONAL_MINIMUM_WAGE;

  return (
    <div
      className={`flex flex-wrap items-start gap-3 ${
        isActive
          ? "py-3.5 first:pt-0 last:pb-0"
          : "my-1 rounded-lg bg-terracotta-soft/40 p-3 first:mt-0"
      }`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${displayName}`}
          className="mt-3 h-4 w-4 shrink-0 accent-primary"
        />
      )}
      <Avatar initials={initialsOf(displayName)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-pine-deep">
            {inv.station}
          </span>
          {!isActive && (
            <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
              Invited — pending
            </span>
          )}
          {isActive && !compact && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Active
            </span>
          )}
          {isActive && inv.noticeLastDay && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-terracotta-ink">
              Leaving{" "}
              {new Date(`${inv.noticeLastDay}T00:00:00`).toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          {inv.flags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
              <AlertCircle className="h-2.5 w-2.5" /> {inv.flags.length} flag
              {inv.flags.length > 1 ? "s" : ""}
            </span>
          )}
          {compact && belowMinimum && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-2.5 w-2.5" /> Below minimum
            </span>
          )}
        </div>
        {(teamName || labels.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {teamName && (
              <span className="text-xs font-semibold text-muted-foreground">{teamName}</span>
            )}
            <LabelChips labels={labels} max={compact ? 3 : 6} />
          </div>
        )}
        {alsoAt.length > 0 && (
          <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
            Also works at {alsoAt.join(", ")}
          </div>
        )}
        <div className="mt-0.5 text-xs text-muted-foreground">
          {inv.employment === "live-in" ? "Live-in" : "Live-out"} · {inv.shift} · Rest:{" "}
          {inv.restDay}
          {expanded && <> · Wage: ₱{(inv.wagePHP || 0).toLocaleString()}</>}
        </div>

        {expanded && (
          <>
            {!isActive ? (
              <div className="text-xs text-muted-foreground">
                Code: <span className="font-mono font-semibold text-foreground">{inv.code}</span> ·
                invited by {inv.createdBy}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Claimed her own account · joined via {inv.createdBy}
              </div>
            )}

            {inv.pantryRole && (
              <PantryRolePicker
                name={displayName}
                role={inv.pantryRole}
                canChange={canInvite}
                onChange={onSetPantryRole}
              />
            )}

            {belowMinimum && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-semibold text-amber-900 dark:text-amber-200">
                    Batas Kasambahay Compliance Warning:
                  </span>{" "}
                  Wage is below the regional minimum of{" "}
                  <span className="font-semibold">₱{REGIONAL_MINIMUM_WAGE.toLocaleString()}</span>.
                </div>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                onClick={() => setShowContributions((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Info className="h-3 w-3" />{" "}
                {showContributions ? "Hide contributions" : "View contributions split"}
              </button>
              {canInvite && (
                <button
                  type="button"
                  onClick={onEditWage}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Edit wage
                </button>
              )}
              {canInvite && onEditTeam && (
                <button
                  type="button"
                  onClick={onEditTeam}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Tags className="h-3 w-3" /> Teams & houses
                </button>
              )}
              {canInvite && isActive && (
                <button
                  type="button"
                  onClick={onEnd}
                  className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-3 w-3" /> End employment
                </button>
              )}
            </div>

            {showContributions && (
              <div className="mt-2.5">
                <LegalContributionSplitCard wagePHP={inv.wagePHP} />
              </div>
            )}
            {inv.flags.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-[oklch(0.38_0.09_60)]">
                {inv.flags.map((f) => (
                  <li key={f.id}>
                    Flagged: <span className="font-semibold">{f.field}</span>
                    {f.note ? ` — "${f.note}"` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {!isActive && (
          <>
            <button
              onClick={onShowCode}
              className="rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
            >
              Show code
            </button>
            {canInvite && (
              <button
                onClick={onCancelInvite}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
              >
                Cancel
              </button>
            )}
          </>
        )}
        {compact && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Less about ${displayName}` : `More about ${displayName}`}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
}
