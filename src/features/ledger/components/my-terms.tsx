import { useState } from "react";

import { ReviewRow } from "@/components/shared/detail-row";
import type { Helper, Invite } from "@/features/people/people.types";
import { LegalContributionSplitCard } from "@/features/people/components/legal-contribution-split-card";
import { useT } from "@/lib/i18n/locale-context";

export function MyTerms({ helper, invite }: { helper: Helper; invite: Invite | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const employment = invite?.employment
    ? invite.employment === "live-in"
      ? "Live-in"
      : "Live-out"
    : "—";
  const role = invite?.station ?? helper.station;
  const shift = invite?.shift ?? helper.shift;
  const restDay = invite?.restDay ?? helper.restDay;
  const wage = invite?.wagePHP ? `₱${invite.wagePHP.toLocaleString()} / month` : "Not on file yet";
  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">
            {t("ledger.onFileWithThisHousehold")}
          </div>
          <div className="mt-1 font-display text-lg text-foreground">
            {t("ledger.yourTermsAsTheEmployer")}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {open ? t("ledger.readOnlyTapToHide") : t("ledger.readOnlyTapToReview")}
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {open ? t("ledger.hide") : t("ledger.review")}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4 rounded-2xl bg-background/60 p-4 text-sm">
          <div className="space-y-2">
            <ReviewRow label={t("ledger.pangalan")} value={invite?.name ?? helper.name} />
            <ReviewRow label={t("ledger.roleStation")} value={role} />
            <ReviewRow label={t("ledger.employment")} value={employment} />
            <ReviewRow label={t("ledger.shift")} value={shift} />
            <ReviewRow label={t("ledger.restDay")} value={restDay} />
            <ReviewRow label={t("ledger.monthlyWage")} value={wage} />
            {invite?.phone && <ReviewRow label={t("ledger.contactOnFile")} value={invite.phone} />}
          </div>

          <LegalContributionSplitCard wagePHP={invite?.wagePHP ?? 16000} />

          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            {t("ledger.mayMaliSabihinMoSa")}
          </p>
        </div>
      )}
    </section>
  );
}
