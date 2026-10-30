import { Loader2, Settings2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { useGrocery } from "../grocery-context";
import { fmtPeso, monthBounds } from "../grocery.utils";
import { BudgetBar } from "./budget-bar";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

/**
 * This month's palengke spend against the house's monthly budget, and each
 * team's against its own, from what was ticked bought this month (on a run
 * or not). The budgets are set from here.
 */
export function MonthBudget() {
  const t = useT();
  const ctx = useGrocery();
  const { teams } = useAppStores();
  const [editing, setEditing] = useState(false);
  const label = monthBounds(new Date()).label;
  const teamRows = teams.available
    ? teams.teams.filter(
        (t) => ctx.budgets.byTeam[t.id] !== undefined || (ctx.month.byTeam[t.id] ?? 0) > 0,
      )
    : [];

  const hasBudget =
    ctx.budgets.house !== null || teamRows.some((t) => ctx.budgets.byTeam[t.id] !== undefined);
  const budgetsButton = (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
    >
      {hasBudget ? (
        <>
          <Settings2 className="h-3.5 w-3.5" /> {t("groceries.budgets")}
        </>
      ) : (
        t("groceries.setABudget")
      )}
    </button>
  );

  return (
    <div>
      {ctx.budgets.house !== null ? (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {richText(t("groceries.soFar"), { label: label })}
            </div>
            {budgetsButton}
          </div>
          <BudgetBar spent={ctx.month.total} budget={ctx.budgets.house} compact />
        </>
      ) : (
        // No house budget: one line, not a big number with nothing to measure it against.
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm text-muted-foreground">
            {ctx.month.total > 0
              ? richText(t("groceries.boughtInSoFar"), {
                  amount: (
                    <span className="font-semibold tabular-nums text-foreground">
                      {fmtPeso(ctx.month.total)}
                    </span>
                  ),
                  label,
                })
              : t("groceries.nothingBoughtInYet", { label })}
          </p>
          {budgetsButton}
        </div>
      )}
      {teamRows.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border/40 pt-2">
          {teamRows.map((t) => {
            const spent = ctx.month.byTeam[t.id] ?? 0;
            const budget = ctx.budgets.byTeam[t.id];
            const over = budget !== undefined && spent > budget;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold text-foreground">{t.name}</span>
                <span
                  className={`tabular-nums ${over ? "font-semibold text-status-late-ink" : "text-muted-foreground"}`}
                >
                  {fmtPeso(spent)}
                  {budget !== undefined && ` of ${fmtPeso(budget)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <BudgetsModal onClose={() => setEditing(false)} />}
    </div>
  );
}

const toAmount = (s: string): number | null | "bad" => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(/[,₱\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : "bad";
};

/** The house's monthly budget and each team's. Empty means none. */
function BudgetsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ctx = useGrocery();
  const { teams } = useAppStores();
  const teamList = teams.available ? teams.teams : [];
  const initial = (n: number | null | undefined) =>
    n === null || n === undefined ? "" : String(n);
  const [house, setHouse] = useState(initial(ctx.budgets.house));
  const [byTeam, setByTeam] = useState<Record<string, string>>(
    Object.fromEntries(teamList.map((t) => [t.id, initial(ctx.budgets.byTeam[t.id])])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const houseAmount = toAmount(house);
    const teamAmounts = teamList.map((t) => [t.id, toAmount(byTeam[t.id] ?? "")] as const);
    if (houseAmount === "bad" || teamAmounts.some(([, a]) => a === "bad")) {
      setError("Budgets are amounts in pesos, or empty for none.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const writes: Promise<void>[] = [];
      if (houseAmount !== ctx.budgets.house) writes.push(ctx.setBudget(null, houseAmount));
      for (const [id, amount] of teamAmounts) {
        if (amount !== (ctx.budgets.byTeam[id] ?? null)) {
          writes.push(ctx.setBudget(id, amount as number | null));
        }
      }
      await Promise.all(writes);
      toast.success("Budgets saved.");
      onClose();
    } catch {
      // useGroceryList already said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-28 rounded-xl border border-input bg-background px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-primary";

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">{t("groceries.monthlyBudgets")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("groceries.whatThePalengkeMayCost")}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("groceries.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 divide-y divide-border/60">
        <label className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            {t("groceries.theWholeHouse")}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            {t("groceries.text")}
            <input
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              inputMode="decimal"
              placeholder={t("groceries.none")}
              className={input}
            />
          </span>
        </label>
        {teamList.map((team) => (
          <label key={team.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate text-sm text-foreground">{team.name}</span>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              {t("groceries.text")}
              <input
                value={byTeam[team.id] ?? ""}
                onChange={(e) => setByTeam((prev) => ({ ...prev, [team.id]: e.target.value }))}
                inputMode="decimal"
                placeholder={t("groceries.none")}
                aria-label={`${team.name} monthly budget`}
                className={input}
              />
            </span>
          </label>
        ))}
      </div>
      {teamList.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{t("groceries.aTeamSSpendIs")}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/40 pt-4">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {t("groceries.cancel")}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
        >
          {richText(t("groceries.save2"), {
            value: saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          })}
        </button>
      </div>
    </Modal>
  );
}
