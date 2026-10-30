import { Info } from "lucide-react";

import { PAY_HR_ENABLED } from "@/lib/pay-hr";

import { computeStatutorySplit } from "../people.utils";
import { useT } from "@/lib/i18n/locale-context";

interface LegalContributionSplitCardProps {
  wagePHP: number;
}

export function LegalContributionSplitCard({ wagePHP }: LegalContributionSplitCardProps) {
  const t = useT();
  if (!PAY_HR_ENABLED) return null;
  const {
    isUnder5k,
    sssEmployer,
    sssEmployee,
    philhealthEmployer,
    philhealthEmployee,
    pagibigEmployer,
    pagibigEmployee,
    totalEmployer,
    totalEmployee,
  } = computeStatutorySplit(wagePHP);

  return (
    <div className="rounded-2xl border border-border/80 bg-background/50 p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Info className="h-3.5 w-3.5 text-primary" />
        {t("people.legalContributionSplitBatasKasambahay")}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground font-semibold">
              <th className="pb-1.5 font-normal">{t("people.contribution")}</th>
              <th className="pb-1.5 text-right font-normal">{t("people.employerShare")}</th>
              <th className="pb-1.5 text-right font-normal">{t("people.employeeShare")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 text-foreground">
            <tr>
              <td className="py-2 font-medium">{t("people.sssPremium")}</td>
              <td className="py-2 text-right tabular-nums">₱{sssEmployer.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-status-done-ink font-semibold">{t("people.00")}</span>
                ) : (
                  `₱${sssEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium">{t("people.philhealth")}</td>
              <td className="py-2 text-right tabular-nums">
                ₱{philhealthEmployer.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-status-done-ink font-semibold">{t("people.00")}</span>
                ) : (
                  `₱${philhealthEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium">{t("people.pagIbigFund")}</td>
              <td className="py-2 text-right tabular-nums">₱{pagibigEmployer.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-status-done-ink font-semibold">{t("people.00")}</span>
                ) : (
                  `₱${pagibigEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr className="font-semibold text-foreground border-t border-border">
              <td className="pt-2 font-semibold text-primary">{t("people.totalContribution")}</td>
              <td className="pt-2 text-right tabular-nums text-primary">
                ₱{totalEmployer.toLocaleString()}
              </td>
              <td className="pt-2 text-right tabular-nums text-primary">
                {isUnder5k ? (
                  <span className="text-status-done-ink font-semibold">{t("people.0")}</span>
                ) : (
                  `₱${totalEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("people.perMonthAtThe2026")}
      </p>
      {isUnder5k && (
        <p className="text-xs italic text-status-done-ink leading-relaxed">
          {t("people.dahilAngBuwanangSweldoAy")}
        </p>
      )}
    </div>
  );
}
