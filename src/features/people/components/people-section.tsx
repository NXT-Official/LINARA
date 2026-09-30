import { AlertCircle, Info, LogOut, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/shared/avatar";

import { adminPermSummary, adminTypeLabel, REGIONAL_MINIMUM_WAGE } from "../people.constants";
import type { Admin, Helper, Invite } from "../people.types";
import { findHelper, initialsOf } from "../people.utils";
import { EditWageModal } from "./edit-wage-modal";
import { EndEmploymentModal } from "./end-employment-modal";
import { InviteCodeScreen } from "./invite-code-screen";
import { InviteHelperModal } from "./invite-helper-modal";
import { LegalContributionSplitCard } from "./legal-contribution-split-card";

/** The household roster: admins, and real helpers/pending invites from the database. */
export function PeopleSection({
  admins,
  currentAdmin,
  invites,
  canInvite,
  onInvite,
  onCancelInvite,
  onUpdateWage,
  helpers,
  activeHelpers,
  token,
  onEndEmployment,
}: {
  admins: Admin[];
  currentAdmin: Admin | null;
  /** Pending and current helpers; people who have left are in PastStaffSection. */
  invites: Invite[];
  canInvite: boolean;
  onInvite: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags" | "shift"> & {
      paydayInterval: "semi_monthly" | "monthly";
    },
  ) => Promise<Invite>;
  onCancelInvite: (id: string) => void;
  onUpdateWage: (id: string, wagePHP: number) => Promise<void>;
  /** Every helper row, for the pay figures the end-employment preview needs. */
  helpers: Helper[];
  activeHelpers: Helper[];
  token: string | null;
  onEndEmployment: (id: string, lastDay: string, reassignTo: string | null) => Promise<void>;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issued, setIssued] = useState<Invite | null>(null);
  const [showContributions, setShowContributions] = useState<Record<string, boolean>>({});
  const [editingWage, setEditingWage] = useState<Invite | null>(null);
  const [ending, setEnding] = useState<Invite | null>(null);
  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">Admins</h2>
            <p className="text-xs text-muted-foreground">The grown-ups who run the house.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
            <Users className="h-3 w-3" /> {admins.length}
          </span>
        </div>
        <div className="divide-y divide-border/70">
          {admins.map((a) => {
            const isYou = currentAdmin?.id === a.id;
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <Avatar initials={a.initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{a.name}</span>
                    {isYou && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        You
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        a.type === "primary"
                          ? "bg-primary/10 text-primary"
                          : a.type === "co"
                            ? "bg-secondary text-pine-deep"
                            : "bg-terracotta-soft/60 text-[oklch(0.38_0.09_60)]"
                      }`}
                    >
                      {adminTypeLabel[a.type]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{a.location}</div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {adminPermSummary[a.type]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">Helpers</h2>
            <p className="text-xs text-muted-foreground">Your household team, by station.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
            <Users className="h-3 w-3" /> {invites.length}
          </span>
        </div>

        {canInvite && (
          <button
            onClick={() => setInviteOpen(true)}
            className="mb-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Invite a helper
          </button>
        )}

        <div className="divide-y divide-border/70">
          {invites.map((inv) => {
            const displayName = inv.claimedName || inv.name;
            const initials = initialsOf(displayName);
            const isActive = inv.status === "active";
            return (
              <div
                key={inv.id}
                className={`flex flex-wrap items-start gap-3 ${
                  isActive
                    ? "py-3.5 first:pt-0 last:pb-0"
                    : "my-1 rounded-lg bg-terracotta-soft/40 p-3 first:mt-0"
                }`}
              >
                <Avatar initials={initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{displayName}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-pine-deep">
                      {inv.station}
                    </span>
                    {isActive ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
                        Invited — pending
                      </span>
                    )}
                    {inv.flags.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
                        <AlertCircle className="h-2.5 w-2.5" /> {inv.flags.length} flag
                        {inv.flags.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {inv.employment === "live-in" ? "Live-in" : "Live-out"} · {inv.shift} · Rest:{" "}
                    {inv.restDay} · Wage: ₱{(inv.wagePHP || 0).toLocaleString()}
                  </div>
                  {!isActive ? (
                    <div className="text-xs text-muted-foreground">
                      Code:{" "}
                      <span className="font-mono font-semibold text-foreground">{inv.code}</span> ·
                      invited by {inv.createdBy}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Claimed her own account · joined via {inv.createdBy}
                    </div>
                  )}

                  {inv.wagePHP < REGIONAL_MINIMUM_WAGE && (
                    <div className="mt-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-900 dark:text-amber-200">
                          Batas Kasambahay Compliance Warning:
                        </span>{" "}
                        Wage is below the regional minimum of{" "}
                        <span className="font-semibold">
                          ₱{REGIONAL_MINIMUM_WAGE.toLocaleString()}
                        </span>
                        .
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setShowContributions((prev) => ({ ...prev, [inv.id]: !prev[inv.id] }))
                      }
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <Info className="h-3 w-3" />{" "}
                      {showContributions[inv.id]
                        ? "Hide contributions"
                        : "View contributions split"}
                    </button>
                    {canInvite && (
                      <button
                        type="button"
                        onClick={() => setEditingWage(inv)}
                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" /> Edit wage
                      </button>
                    )}
                    {canInvite && isActive && (
                      <button
                        type="button"
                        onClick={() => setEnding(inv)}
                        className="ml-auto text-xs font-semibold text-muted-foreground hover:text-destructive flex items-center gap-1"
                      >
                        <LogOut className="h-3 w-3" /> End employment
                      </button>
                    )}
                  </div>

                  {showContributions[inv.id] && (
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
                </div>
                {!isActive && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <button
                      onClick={() => setIssued(inv)}
                      className="rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
                    >
                      Show code
                    </button>
                    {canInvite && (
                      <button
                        onClick={() => onCancelInvite(inv.id)}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs italic text-muted-foreground">
          You're entering the household's record and sending an invite — you're not creating her
          login. She'll set up and control her own account, and her record stays hers.
        </p>
      </section>

      {inviteOpen && (
        <InviteHelperModal
          onClose={() => setInviteOpen(false)}
          onSubmit={async (data) => {
            const inv = await onInvite(data);
            setInviteOpen(false);
            setIssued(inv);
            toast.success("Nagawa na ang invite code!");
          }}
        />
      )}
      {issued && <InviteCodeScreen invite={issued} onClose={() => setIssued(null)} />}
      {ending && token && (
        <EndEmploymentModal
          helper={findHelper(ending.id, helpers)}
          otherHelpers={activeHelpers.filter((h) => h.id !== ending.id)}
          token={token}
          onClose={() => setEnding(null)}
          onConfirm={async (lastDay, reassignTo) => {
            await onEndEmployment(ending.id, lastDay, reassignTo);
            toast.success(`${ending.claimedName || ending.name} is now in Past staff.`);
          }}
        />
      )}
      {editingWage && (
        <EditWageModal
          name={editingWage.claimedName || editingWage.name}
          initialWagePHP={editingWage.wagePHP}
          onClose={() => setEditingWage(null)}
          onSubmit={(wagePHP) => onUpdateWage(editingWage.id, wagePHP)}
        />
      )}
    </div>
  );
}
