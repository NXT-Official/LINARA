import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import type { RecordLeaveInput } from "@/features/shifts/hooks/use-time-off";

import { useOpenTaskCounts } from "../hooks/use-open-task-counts";

import { LEAVE_KIND_HINT, LEAVE_KIND_LABEL, LEAVE_REASON_LABEL } from "../leave.constants";
import type { LeaveKind, LeaveReason } from "../leave.types";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

/**
 * A manager records leave for her, usually after the fact ("she called in
 * sick"). It's approved at once and she confirms or disputes it from her app.
 * The database checks the dates and balances and explains any refusal.
 */
export function RecordLeaveModal({
  helperName,
  helperId,
  token,
  defaultDate,
  onClose,
  onRecord,
  silHintText,
  silUnavailable = null,
}: {
  helperName: string;
  helperId: string;
  /** For counting her tasks on the chosen days. */
  token: string | null;
  /** YYYY-MM-DD the dates start on: today. */
  defaultDate: string;
  onClose: () => void;
  /** Resolves true once saved; the form stays open on a refusal so it can be fixed. */
  onRecord: (input: RecordLeaveInput) => Promise<boolean>;
  /** The SIL line for the household's rule, when known. */
  silHintText?: string;
  /** Why SIL can't be used now, as a verb phrase ("starts August 15, 2027"); null when it can. */
  silUnavailable?: string | null;
}) {
  const t = useT();
  // SIL first when there is some. Otherwise nothing is picked for the manager:
  // the other kinds dock pay or use rest owed, which shouldn't happen by default.
  const [kind, setKind] = useState<LeaveKind | "">(silUnavailable ? "" : "sil");
  const [reason, setReason] = useState<LeaveReason>("sick");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [keepTasks, setKeepTasks] = useState(false);

  const valid = !!kind && !!startDate && !!endDate && endDate >= startDate;
  const taskCount =
    useOpenTaskCounts(token, valid ? [{ key: "range", helperId, startDate, endDate }] : []).range ??
    0;

  const submit = async () => {
    if (!valid || !kind || saving) return;
    setSaving(true);
    const saved = await onRecord({
      helperId,
      kind,
      reason,
      startDate,
      endDate,
      note: note.trim() || undefined,
      unassignTasks: taskCount > 0 && !keepTasks,
    });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">
          {richText(t("leave.recordLeaveFor"), { helperName: helperName })}
        </h3>
        <button
          onClick={onClose}
          aria-label={t("leave.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {richText(t("leave.approvedStraightAwayIsAsked"), { helperName: helperName })}
      </p>
      <div className="mt-4 space-y-3">
        <Field label={t("leave.kind")}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LeaveKind)}
            className={inputCls}
          >
            {kind === "" && (
              <option value="" disabled>
                {t("leave.chooseAKind")}
              </option>
            )}
            {(Object.keys(LEAVE_KIND_LABEL) as LeaveKind[]).map((k) => (
              <option key={k} value={k} disabled={k === "sil" && !!silUnavailable}>
                {LEAVE_KIND_LABEL[k]}
                {k === "sil" && silUnavailable ? ` (${silUnavailable})` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {kind === ""
              ? `Pick which kind this is. Service incentive leave ${silUnavailable}.`
              : kind === "sil" && silHintText
                ? silHintText
                : LEAVE_KIND_HINT[kind]}
          </p>
        </Field>
        <Field label={t("leave.reason")}>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as LeaveReason)}
            className={inputCls}
          >
            {(Object.keys(LEAVE_REASON_LABEL) as LeaveReason[]).map((r) => (
              <option key={r} value={r}>
                {LEAVE_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("leave.firstDay")}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={inputCls}
            />
          </Field>
          <Field label={t("leave.lastDay")}>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label={t("leave.noteOptional")}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("leave.eGFeverCalledIn")}
            className={inputCls}
          />
        </Field>
        {valid && taskCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl bg-background/60 p-3 ring-1 ring-border/20">
            <input
              type="checkbox"
              checked={!keepTasks}
              onChange={(e) => setKeepTasks(!e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {t("leave.unfinishedOnDays", { count: taskCount, name: helperName })}
              </span>{" "}
              {t("leave.moveSoOthers", { count: taskCount })}
            </span>
          </label>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t("leave.cancel")}
        </button>
        <button
          onClick={() => void submit()}
          disabled={!valid || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {saving ? t("leave.saving") : t("leave.recordLeave")}
        </button>
      </div>
    </Modal>
  );
}
