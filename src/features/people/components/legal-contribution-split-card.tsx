import { Info } from "lucide-react";

import { computeStatutorySplit } from "../people.utils";

interface LegalContributionSplitCardProps {
  wagePHP: number;
}

export function LegalContributionSplitCard({ wagePHP }: LegalContributionSplitCardProps) {
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
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
        <Info className="h-3.5 w-3.5 text-primary" />
        Legal Contribution Split (Batas Kasambahay)
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground font-semibold">
              <th className="pb-1.5 font-normal">Contribution</th>
              <th className="pb-1.5 text-right font-normal">Employer Share</th>
              <th className="pb-1.5 text-right font-normal">Employee Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 text-foreground">
            <tr>
              <td className="py-2 font-medium">SSS Premium</td>
              <td className="py-2 text-right tabular-nums">₱{sssEmployer.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-emerald font-semibold">0% (₱0)</span>
                ) : (
                  `₱${sssEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium">PhilHealth</td>
              <td className="py-2 text-right tabular-nums">
                ₱{philhealthEmployer.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-emerald font-semibold">0% (₱0)</span>
                ) : (
                  `₱${philhealthEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium">Pag-IBIG Fund</td>
              <td className="py-2 text-right tabular-nums">₱{pagibigEmployer.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums">
                {isUnder5k ? (
                  <span className="text-emerald font-semibold">0% (₱0)</span>
                ) : (
                  `₱${pagibigEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
            <tr className="font-semibold text-foreground border-t border-border">
              <td className="pt-2 font-semibold text-primary">Total Contribution</td>
              <td className="pt-2 text-right tabular-nums text-primary">
                ₱{totalEmployer.toLocaleString()}
              </td>
              <td className="pt-2 text-right tabular-nums text-primary">
                {isUnder5k ? (
                  <span className="text-emerald font-semibold">₱0</span>
                ) : (
                  `₱${totalEmployee.toLocaleString()}`
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {isUnder5k && (
        <p className="text-[10px] italic text-emerald leading-relaxed">
          * Dahil ang buwanang sweldo ay mas mababa sa ₱5,000, ang Employer ay obligadong magbayad
          ng 100% ng kontribusyon ayon sa batas.
        </p>
      )}
    </div>
  );
}
