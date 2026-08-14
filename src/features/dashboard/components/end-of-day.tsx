import { Check, Moon } from "lucide-react";

export function EndOfDay({ doneCount, helperName }: { doneCount: number; helperName: string }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-8 text-center shadow-lift">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl text-foreground">
        Great work today — {doneCount} of {doneCount} done
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Salamat po, {helperName}. Rest well.</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-pine-deep">
        <Moon className="h-4 w-4" /> The board is closed for the night
      </div>
    </section>
  );
}
