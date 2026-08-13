import type { QuickUtos } from "../utos.types";
import { UtosChip } from "./utos-chip";

export function QuickUtosFeed({
  utosList,
  onAck,
  available,
  wiped,
  helperName,
}: {
  utosList: QuickUtos[];
  onAck: (id: string, ack: "seen" | "done") => void;
  available: boolean;
  wiped: boolean;
  helperName: string;
}) {
  const ordered = [...utosList].sort((a, b) => b.timestamp - a.timestamp);
  const isEmptyAfterWipe = utosList.length === 0 && wiped;

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Today's quick utos
      </h3>

      {isEmptyAfterWipe ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-center">
          <div className="text-sm font-semibold text-foreground">Today's list was deleted 🌙</div>
          <p className="mt-1 text-xs text-muted-foreground">
            The individual utos are gone, not hidden. Tomorrow starts clean.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((u) => (
            <UtosChip key={u.id} utos={u} onAck={onAck} available={available} helperName={helperName} />
          ))}
        </ul>
      )}
    </section>
  );
}
