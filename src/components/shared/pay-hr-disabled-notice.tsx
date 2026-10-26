import { Info } from "lucide-react";

import { PAY_HR_DISABLED_MESSAGE } from "@/lib/pay-hr";

/** Stands in for a pay or HR section while PAY_HR_ENABLED is off. */
export function PayHrDisabledNotice({ className = "" }: { className?: string }) {
  return (
    <section
      role="status"
      className={`flex items-start gap-2 rounded-3xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground sm:p-5 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{PAY_HR_DISABLED_MESSAGE}</p>
    </section>
  );
}
