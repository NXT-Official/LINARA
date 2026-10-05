import { labelToneClass } from "../teams.constants";
import type { Label } from "../teams.types";

/** A helper's label, as a status pill: it says something, it doesn't act. */
export function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${labelToneClass[label.tone]}`}
    >
      {label.name}
    </span>
  );
}

/** A helper's labels in a row, capped so a long set doesn't wrap a lane. */
export function LabelChips({ labels, max = 3 }: { labels: Label[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <>
      {shown.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
      {more > 0 && (
        <span
          className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground"
          title={labels
            .slice(max)
            .map((l) => l.name)
            .join(", ")}
        >
          +{more}
        </span>
      )}
    </>
  );
}
