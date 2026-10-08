import { CheckSquare, Plus, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";
import type { PayPeriodStore } from "@/features/pay/hooks/use-pay-periods";
import { formatCutoffDay } from "@/features/pay/pay.utils";
import { BulkStaffBar } from "@/features/teams/components/bulk-staff-bar";
import { EditTeamLabelsModal } from "@/features/teams/components/edit-team-labels-modal";
import { StaffScopeBar } from "@/features/teams/components/staff-scope-bar";
import { useStaffScope } from "@/features/teams/hooks/use-staff-scope";
import { LARGE_STAFF } from "@/features/teams/teams.constants";

import type { Helper, Invite, PantryRole } from "../people.types";
import { findHelper } from "../people.utils";
import { EditWageModal } from "./edit-wage-modal";
import { EndEmploymentModal } from "./end-employment-modal";
import { HelperRow } from "./helper-row";
import { InviteCodeScreen } from "./invite-code-screen";
import { InviteHelperModal } from "./invite-helper-modal";

/** The household's helpers and pending invites, from the database. Managers: ManagersSection. */
export function PeopleSection({
  invites,
  canInvite,
  onInvite,
  onCancelInvite,
  onUpdateWage,
  payPeriods,
  onSetPantryRole,
  helpers,
  activeHelpers,
  token,
  onEndEmployment,
}: {
  /** Pending and current helpers; people who have left are in PastStaffSection. */
  invites: Invite[];
  canInvite: boolean;
  onInvite: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags" | "shift"> & {
      paydayInterval: "semi_monthly" | "monthly";
      labelIds?: string[];
    },
  ) => Promise<Invite>;
  onCancelInvite: (id: string) => void;
  onUpdateWage: (id: string, wagePHP: number, effectiveFrom?: string) => Promise<void>;
  /** For the cutoff a new wage can start in. */
  payPeriods: PayPeriodStore;
  onSetPantryRole: (id: string, role: PantryRole) => Promise<void>;
  /** Every helper row, for the pay figures the end-employment preview needs. */
  helpers: Helper[];
  activeHelpers: Helper[];
  token: string | null;
  onEndEmployment: (id: string, lastDay: string, reassignTo: string | null) => Promise<void>;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issued, setIssued] = useState<Invite | null>(null);
  const [editingWage, setEditingWage] = useState<Invite | null>(null);
  const [editingTeam, setEditingTeam] = useState<Invite | null>(null);
  const [ending, setEnding] = useState<Invite | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { teams, sharing, stations } = useAppStores();
  const staff = useStaffScope();

  // Search, team and labels narrow the list; pending invites stay on top,
  // and the rest group by team when the household has teams. A large staff
  // gets one-line rows that open for the details.
  const current = invites;
  const shown = staff.apply(current.map((i) => ({ ...i, name: i.claimedName || i.name })));
  const pending = shown.filter((i) => i.status !== "active");
  const active = shown.filter((i) => i.status === "active");
  const groups = staff.group(active);
  const compact = current.length > LARGE_STAFF;

  const row = (inv: Invite) => (
    <HelperRow
      key={inv.id}
      inv={inv}
      canInvite={canInvite}
      compact={compact}
      teamName={groups || !inv.teamId ? null : (teams.teamById.get(inv.teamId)?.name ?? null)}
      labels={teams.labelsOf(inv.id)}
      alsoAt={sharing
        .householdsOf(inv.id)
        .map((id) => sharing.family.find((h) => h.id === id)?.name)
        .filter((n): n is string => !!n)}
      selectable={selecting}
      selected={selected.includes(inv.id)}
      onSelect={() =>
        setSelected((prev) =>
          prev.includes(inv.id) ? prev.filter((x) => x !== inv.id) : [...prev, inv.id],
        )
      }
      onShowCode={() => setIssued(inv)}
      onCancelInvite={() => onCancelInvite(inv.id)}
      onEditWage={() => setEditingWage(inv)}
      onEditTeam={teams.available ? () => setEditingTeam(inv) : undefined}
      onEnd={() => setEnding(inv)}
      onSetPantryRole={(role) => onSetPantryRole(inv.id, role)}
      stations={stations.names}
      onSetStation={
        stations.available ? (station) => stations.setHelperStation(inv.id, station) : undefined
      }
    />
  );

  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">Helpers</h2>
            <p className="text-xs text-muted-foreground">
              {teams.teams.length > 0
                ? "Your household staff, by team."
                : "Your household team, by station."}
            </p>
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

        {canInvite && teams.available && current.length > 1 && !selecting && (
          <button
            onClick={() => setSelecting(true)}
            className="mb-4 ml-2 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
          >
            <CheckSquare className="h-3.5 w-3.5" /> Choose several
          </button>
        )}

        {staff.show && (
          <div className="mb-4">
            <StaffScopeBar api={staff} shown={shown.length} total={current.length} />
          </div>
        )}

        {shown.length === 0 && current.length > 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nobody matches. Try another name, team or label.
          </p>
        )}

        {pending.length > 0 && (
          <RosterGroup title="Waiting to join" count={pending.length} grouped={!!groups}>
            {pending.map(row)}
          </RosterGroup>
        )}
        {groups
          ? groups.map((g) => (
              <RosterGroup key={g.key} title={g.title} count={g.items.length} grouped>
                {g.items.map(row)}
              </RosterGroup>
            ))
          : active.length > 0 && (
              <RosterGroup title="" count={active.length} grouped={false}>
                {active.map(row)}
              </RosterGroup>
            )}

        {selecting && (
          <div className="mt-4">
            <BulkStaffBar
              selectedIds={selected}
              shownIds={shown.map((i) => i.id)}
              onSelectAll={setSelected}
              onDone={() => {
                setSelecting(false);
                setSelected([]);
              }}
            />
          </div>
        )}

        <p className="mt-4 text-xs italic text-muted-foreground">
          You're entering the household's record and sending an invite — you're not creating their
          login. They'll set up and control their own account, and their record stays theirs.
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
          initialLastDay={ending.noticeLastDay}
          onClose={() => setEnding(null)}
          onConfirm={async (lastDay, reassignTo) => {
            await onEndEmployment(ending.id, lastDay, reassignTo);
            toast.success(`${ending.claimedName || ending.name} is now in Past staff.`);
          }}
        />
      )}
      {editingTeam && (
        <EditTeamLabelsModal
          helperId={editingTeam.id}
          name={editingTeam.claimedName || editingTeam.name}
          initialTeamId={editingTeam.teamId ?? null}
          onClose={() => setEditingTeam(null)}
        />
      )}
      {editingWage && (
        <EditWageModal
          name={editingWage.claimedName || editingWage.name}
          initialWagePHP={editingWage.wagePHP}
          // Periods carry their wage once add-wage-history.sql is in; before
          // that a wage can only change outright, so there's no start to pick.
          currentPeriod={(payPeriods.byHelper[editingWage.id] ?? []).find(
            (p) => p.isCurrent && p.monthlyRate !== null,
          )}
          onClose={() => setEditingWage(null)}
          onSubmit={async (wagePHP, effectiveFrom) => {
            await onUpdateWage(editingWage.id, wagePHP, effectiveFrom);
            const who = editingWage.claimedName || editingWage.name;
            toast.success(
              effectiveFrom
                ? `${who}'s new wage starts ${formatCutoffDay(effectiveFrom)}.`
                : `${who}'s wage is saved.`,
            );
          }}
        />
      )}
    </div>
  );
}

/** A titled block of roster rows: one team, or the invites still waiting. */
function RosterGroup({
  title,
  count,
  grouped,
  children,
}: {
  title: string;
  count: number;
  /** Other groups sit beside it, so it carries a heading. */
  grouped: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      {grouped && title && (
        <h3 className="mb-2 flex items-baseline gap-2 border-b border-border/60 pb-1.5 text-sm font-semibold text-foreground">
          {title}
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{count}</span>
        </h3>
      )}
      <div className="divide-y divide-border/70">{children}</div>
    </div>
  );
}
