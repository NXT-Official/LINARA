import { ShoppingBasket } from "lucide-react";
import { useEffect, useState } from "react";

import { useGrocery } from "../grocery-context";
import { BudgetBar } from "./budget-bar";
import { HistoryView } from "./history-view";
import { MonthBudget } from "./month-budget";
import { NeededList } from "./needed-list";
import { RepeatsList } from "./repeats-list";
import { RunModal } from "./run-modal";
import { RunsList } from "./runs-list";

type Tab = "needed" | "runs" | "repeats" | "history";
const TAB_KEY = "linara.groceryTab";

const readTab = (): Tab => {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    return v === "runs" || v === "repeats" || v === "history" ? v : "needed";
  } catch {
    return "needed";
  }
};

/**
 * The palengke, for a household of any size (supabase/add-grocery-runs.sql,
 * KNOWN_GAPS.md O40):
 *
 *   Needed   -- the pool: what's low, "Ubos na", anything added by hand.
 *   Runs     -- open shopping runs made from it: who goes, cash, approval.
 *   Repeats  -- runs made every week.
 *   History  -- closed runs a month at a time, with what they cost.
 *
 * This month's spend against the budgets sits on top. Before the SQL is
 * applied it is the single list it always was.
 */
export function GrocerySection() {
  const ctx = useGrocery();
  const [tab, setTab] = useState<Tab>("needed");
  // "new", a run's id, or nothing open.
  const [openRun, setOpenRun] = useState<string | null>(null);
  useEffect(() => setTab(readTab()), []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      // Private window: it just won't be remembered.
    }
  };

  const pending = ctx.runs.filter((r) => r.status === "pending").length;
  const run = openRun && openRun !== "new" ? ctx.runs.find((r) => r.id === openRun) : undefined;
  const openStarted = (id: string) => {
    choose("runs");
    setOpenRun(id);
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "needed", label: "Needed", count: ctx.toBuyCount },
    { key: "runs", label: "Runs", count: ctx.runs.length },
    { key: "repeats", label: "Repeats" },
    { key: "history", label: "History" },
  ];

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-terracotta-soft text-accent-foreground">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Grocery list</h2>
          </div>
          {/* With runs, the tabs say what's here and Needed carries the count. */}
          {!ctx.runsAvailable && (
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-suggested from Pantry lows. Attached to the Palengke run.
            </p>
          )}
        </div>
        {!ctx.runsAvailable && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
            {ctx.toBuyCount} to buy
          </span>
        )}
      </div>

      {ctx.runsAvailable ? (
        <>
          <div className="mt-3">
            <MonthBudget />
          </div>
          <div
            className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-background/60 p-1"
            role="tablist"
            aria-label="Groceries"
          >
            {tabs.map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => choose(key)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  )}
                  {key === "runs" && pending > 0 && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-terracotta" aria-hidden />
                      <span className="sr-only">, {pending} waiting for approval</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4" role="tabpanel">
            {tab === "needed" && <NeededList onPlanRun={() => setOpenRun("new")} />}
            {tab === "runs" && <RunsList onOpen={setOpenRun} onNew={() => setOpenRun("new")} />}
            {tab === "repeats" && <RepeatsList onStarted={openStarted} />}
            {tab === "history" && <HistoryView />}
          </div>
        </>
      ) : (
        <>
          <LegacyBudget />
          <div className="mt-4">
            <NeededList />
          </div>
        </>
      )}

      {openRun === "new" && <RunModal onClose={() => setOpenRun(null)} />}
      {run && <RunModal key={run.id} run={run} onClose={() => setOpenRun(null)} />}
    </section>
  );
}

/** Before add-grocery-runs.sql: the one petty-cash number, against everything bought. */
function LegacyBudget() {
  const ctx = useGrocery();
  const [draft, setDraft] = useState(String(ctx.budget));
  const budget = ctx.budget;
  useEffect(() => {
    setDraft(String(budget));
  }, [budget]);
  return (
    <div className="mt-4 rounded-2xl bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">Petty cash budget</div>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          ₱
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = parseFloat(draft);
              if (!isNaN(n)) void ctx.setBudget(null, n).catch(() => {});
              else setDraft(String(ctx.budget));
            }}
            inputMode="numeric"
            className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
      </div>
      <BudgetBar spent={ctx.spent} budget={ctx.budget} compact />
    </div>
  );
}
