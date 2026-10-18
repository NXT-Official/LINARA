import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import type { RecordLeaveInput } from "@/features/shifts/hooks/use-time-off";

import { useOpenTaskCounts } from "../hooks/use-open-task-counts";

import { LEAVE_KIND_HINT, LEAVE_KIND_LABEL, LEAVE_REASON_LABEL } from "../leave.constants";
import type { LeaveKind, LeaveReason } from "../leave.types";

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
        <h3 className="font-display text-xl text-foreground">Record leave for {helperName}</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Approved straight away. {helperName} is asked to confirm it in the app.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LeaveKind)}
            className={inputCls}
          >
            {kind === "" && (
              <option value="" disabled>
                Choose a kind
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
        <Field label="Reason">
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
          <Field label="First day">
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
          <Field label="Last day">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Fever, called in at 6 AM"
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
                {taskCount} of {helperName}'s unfinished {taskCount === 1 ? "task is" : "tasks are"}{" "}
                on these days.
              </span>{" "}
              Move {taskCount === 1 ? "it" : "them"} to Unassigned so someone else can take{" "}
              {taskCount === 1 ? "it" : "them"}.
            </span>
          </label>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!valid || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {saving ? "Saving…" : "Record leave"}
        </button>
      </div>
    </Modal>
  );
}
