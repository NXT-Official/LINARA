import { toast } from "sonner";

import { Segmented } from "@/components/shared/segmented";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { LeaveSection } from "@/features/leave/components/leave-section";
import { setPayDaysPerYearFn } from "@/features/leave/leave.actions";
import { PlanSummary } from "@/features/plan/components/plan-summary";
import { PlacesSection } from "@/features/sharing/components/places-section";
import { SharedStaffSection } from "@/features/sharing/components/shared-staff-section";
import { TeamsLabelsSection } from "@/features/teams/components/teams-labels-section";
import { toHouseholdClock, toISODate } from "@/lib/time";

import { AccountSection } from "../components/account-section";
import { ManagersSection } from "../components/managers-section";
import { PastStaffSection } from "../components/past-staff-section";
import { PeopleSection } from "../components/people-section";
import { StationsSection } from "../components/stations-section";
import { useT } from "@/lib/i18n/locale-context";

export const PEOPLE_TABS = [
  { key: "staff", label: "Staff" },
  { key: "teams", label: "Stations & teams" },
  { key: "leave", label: "Leave" },
] as const;
export type PeopleTab = (typeof PEOPLE_TABS)[number]["key"];

/**
 * The household roster, in three tabs: Staff (managers, helpers and pending
 * invites, shared staff, past staff), Stations & teams (with places), and Leave (the rules and
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
  const t = useT();
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
  } = useAppStores();
  // Stations are always there (the five, before add-household-stations.sql),
  // so the tab is too.
  const tabs = PEOPLE_TABS;
  const shown: PeopleTab = tabs.some((t) => t.key === tab) ? tab : "staff";
  const { currentAdmin, adminType } = session;
  const canInvite = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";

  const current = invites.invites.filter((i) => i.status !== "ended");
  const past = invites.invites.filter((i) => i.status === "ended");

  return (
    <>
      <h1 className="sr-only">{t("people.people")}</h1>
      <div className="-mx-1 overflow-x-auto px-1">
        <Segmented
          label={t("people.peopleSection")}
          options={tabs}
          value={shown}
          onChange={onTabChange}
        />
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
              onUpdateWage={async (id, wage, effectiveFrom) => {
                await invites.updateWage(id, wage, effectiveFrom);
                // Each period's wage comes with the periods.
                await payPeriods.refresh();
              }}
              payPeriods={payPeriods}
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
          <div className="mt-6">
            <StationsSection canEdit={canInvite} />
          </div>
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
        <PlanSummary />
      </div>

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
