import { TONE_DOT } from "./planner-tone";

const LEGEND = [
  { tone: "late", dot: TONE_DOT.late, label: "Late" },
  { tone: "held", dot: TONE_DOT.held, label: "On hold" },
  { tone: "doing", dot: TONE_DOT.doing, label: "Doing" },
  { tone: "done", dot: TONE_DOT.done, label: "Done" },
  { tone: "planned", dot: TONE_DOT.planned, label: "Planned" },
];

/** What the colours mean, once, above the plan. */
export function TaskToneLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {LEGEND.map(({ tone, dot, label }) => (
        <li key={tone} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
