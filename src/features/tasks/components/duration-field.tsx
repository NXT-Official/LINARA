import { Field } from "@/components/shared/field";

import { DURATION_OPTIONS, durationLabel } from "../task.utils";

/**
 * How long a task takes (tickets.duration_minutes,
 * add-task-length-and-leave-unassign.sql). Optional: without one the task is
 * a start time, as before, and counts as half an hour where a length matters.
 */
export function DurationField({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  className: string;
}) {
  // A length set some other way still shows as itself.
  const options =
    value === null || DURATION_OPTIONS.includes(value)
      ? DURATION_OPTIONS
      : [...DURATION_OPTIONS, value].sort((a, b) => a - b);
  return (
    <Field label="How long">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={className}
      >
        <option value="">Not set</option>
        {options.map((m) => (
          <option key={m} value={m}>
            {durationLabel(m)}
          </option>
        ))}
      </select>
    </Field>
  );
}
