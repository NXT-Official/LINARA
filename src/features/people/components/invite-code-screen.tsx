import { Check, Link2, X } from "lucide-react";
import { useState } from "react";

import type { Invite } from "../people.types";

import { Modal } from "@/components/shared/modal";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

export function InviteCodeScreen({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">
            {t("people.inviteCreated")}
          </div>
          <h3 className="mt-1 font-display text-2xl text-foreground">
            {richText(t("people.shareThisCodeWith"), { name: invite.name })}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-dashed border-primary/40 bg-primary/5 px-5 py-6 text-center">
        <div className="font-display text-4xl font-semibold tracking-[0.15em] text-primary">
          {invite.code}
        </div>
        <button
          onClick={copy}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> {t("people.copied")}
            </>
          ) : (
            <>
              <Link2 className="h-3 w-3" /> {t("people.copyCode")}
            </>
          )}
        </button>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl bg-background/60 p-4 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">{invite.station}</span> ·{" "}
          {invite.employment === "live-in" ? t("people.liveIn") : t("people.liveOut")}
        </div>
        <div>{richText(t("people.shift"), { shift: invite.shift })}</div>
        <div>{richText(t("people.restDay2"), { restDay: invite.restDay })}</div>
        <div>{richText(t("people.wageMonth"), { value: invite.wagePHP.toLocaleString() })}</div>
        {invite.phone && <div>{richText(t("people.contact"), { phone: invite.phone })}</div>}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {richText(t("people.theyLlSetUpAnd"), {
          span: <span className="font-semibold text-foreground">{t("people.invitedPending")}</span>,
        })}
      </p>

      <div className="mt-5 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          {t("people.done")}
        </button>
      </div>
    </Modal>
  );
}
