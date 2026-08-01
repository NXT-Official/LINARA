import type { Task } from "../task.types";

export function RescheduleNotice({
  notice,
  newTime,
}: {
  notice?: Task["rescheduleNotice"];
  newTime: string;
}) {
  if (!notice) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] leading-snug text-pine-deep">
      <span className="mt-0.5">⏱</span>
      <span>
        <span className="font-semibold">Rescheduled:</span> {notice.oldTime} → {newTime} because{" "}
        <span className="italic">{notice.appointmentTitle}</span> changed.
      </span>
    </div>
  );
}
