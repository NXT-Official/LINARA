import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { LeaveSection } from "@/features/leave/components/leave-section";
import { setPayDaysPerYearFn } from "@/features/leave/leave.actions";
import { PlacesSection } from "@/features/sharing/components/places-section";
import { SharedStaffSection } from "@/features/sharing/components/shared-staff-section";
import { TeamsLabelsSection } from "@/features/teams/components/teams-labels-section";
import { toHouseholdClock, toISODate } from "@/lib/time";

import { AccountSection } from "../components/account-section";
import { ManagersSection } from "../components/managers-section";
import { PastStaffSection } from "../components/past-staff-section";
import { PeopleSection } from "../components/people-section";

export const PEOPLE_TABS = [
  { key: "staff", label: "Staff" },
  { key: "teams", label: "Teams & places" },
  { key: "leave", label: "Leave" },
] as const;
export type PeopleTab = (typeof PEOPLE_TABS)[number]["key"];

/**
 * The household roster, in three tabs: Staff (managers, helpers and pending
 * invites, shared staff, past staff), Teams & places, and Leave (the rules and
 * each helper's balance). Your account sits under every tab. One page of six
 * sections ran past 3,800px on a phone (UX review 2026-10-07).
 */
export function PeoplePage({
  tab,
  onTabChange,
}: {
  tab: PeopleTab;
  onTabChange: (tab: PeopleTab) => void;
}) {
  const {
    session,
    invites,
    teams,
    helpers,
    activeHelpers,
    employedHelpers,
    payslips,
    payPeriods,
    vales,
    board,
    timeOff,
    clock,
    sharing,
  } = useAppStores();
  // Teams & places has nothing to show before add-teams-and-labels.sql and
  // add-shared-staff-and-places.sql are applied, so the tab waits for them.
  const tabs = PEOPLE_TABS.filter((t) => t.key !== "teams" || teams.available || sharing.available);
  const shown: PeopleTab = tabs.some((t) => t.key === tab) ? tab : "staff";
  const { currentAdmin, adminType } = session;
  const canInvite = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";

  const current = invites.invites.filter((i) => i.status !== "ended");
  const past = invites.invites.filter((i) => i.status === "ended");

  return (
    <>
      <h1 className="sr-only">People</h1>
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft"
          role="group"
          aria-label="People section"
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              aria-pressed={shown === key}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                shown === key
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown === "staff" && (
        <>
          <div className="mt-6">
            <ManagersSection />
          </div>
          <div className="mt-6">
            <PeopleSection
              invites={current}
              canInvite={canInvite}
              onInvite={async (data) => {
                const invite = await invites.create(data, authorName);
                // The labels chosen in the form were written with the invite.
                if (data.labelIds?.length) teams.refresh().catch(() => {});
                return invite;
              }}
              onCancelInvite={invites.cancel}
              onUpdateWage={invites.updateWage}
              onSetPantryRole={invites.setPantryRole}
              helpers={helpers}
              activeHelpers={activeHelpers}
              token={session.token}
              onEndEmployment={async (id, lastDay, reassignTo) => {
                await invites.endEmployment(id, lastDay, reassignTo);
                // Her open tasks moved or went, and pending vales were declined.
                await Promise.all([
                  board.refresh(),
                  vales.refresh(),
                  payslips.refresh(),
                  payPeriods.refresh(),
                ]);
              }}
            />
          </div>
          <div className="mt-6 empty:hidden">
            <SharedStaffSection canEdit={canInvite} />
          </div>
          <div className="mt-6">
            <PastStaffSection
              pastStaff={past}
              helpers={helpers}
              payslips={payslips.payslips}
              payPeriods={payPeriods}
              vales={vales.vales}
              token={session.token}
              canPay={adminType !== null}
              onPayNow={payslips.payNow}
              onReconcile={payslips.reconcile}
              onRecordOffApp={payslips.recordOffApp}
              onWithdrawOffApp={payslips.withdrawOffApp}
            />
          </div>
        </>
      )}

      {shown === "teams" && (
        <>
          {teams.available && (
            <div className="mt-6">
              <TeamsLabelsSection canEdit={canInvite} />
            </div>
          )}
          <div className="mt-6 empty:hidden">
            <PlacesSection canEdit={canInvite} />
          </div>
        </>
      )}

      {shown === "leave" && (
        <div className="mt-6">
          <LeaveSection
            helpers={employedHelpers}
            leave={timeOff.leave}
            token={session.token}
            todayIso={toISODate(toHouseholdClock(clock.nowTs))}
            canManage={canInvite}
            payDaysFor={(id) =>
              invites.helperProfiles.find((p) => p.id === id)?.pay_days_per_year ?? 365
            }
            onSetPayDays={(helperId, payDaysPerYear) => {
              if (!session.token) return;
              setPayDaysPerYearFn({ data: { token: session.token, helperId, payDaysPerYear } })
                .then(() => invites.refresh())
                .catch((err) => {
                  console.error("[PeoplePage] Failed to save pay days:", err);
                  toast.error("Couldn't save that setting.");
                });
            }}
            onRecord={timeOff.recordLeave}
            onCancel={(id) => void timeOff.cancelLeave(id)}
          />
        </div>
      )}

      <div className="mt-6">
        <AccountSection
          token={session.token}
          activeHelperCount={employedHelpers.length}
          confirmName={session.currentAdmin?.name ?? ""}
        />
      </div>
    </>
  );
}
