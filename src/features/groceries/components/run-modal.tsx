import { ChevronRight, Loader2, Plus, Repeat, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { parseAmount } from "@/features/pantry/pantry.utils";
import { HelperPicker } from "@/features/teams/components/helper-picker";

import { useGrocery } from "../grocery-context";
import type {
  GroceryItem,
  GroceryReceipt,
  GroceryRun,
  RunDraft,
  RunStatus,
  TemplateItem,
} from "../grocery.types";
import {
  WEEKDAYS,
  expectedChange,
  fmtPeso,
  reconcile,
  spentOn,
  unpricedCount,
} from "../grocery.utils";
import { GroceryRow } from "./grocery-row";
import { PoolPicker } from "./pool-picker";
import { ReceiptSlot } from "./receipt-slot";
import { RunStatusPill } from "./run-status-pill";

const FIELD =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const NO_TASK = "";

const fromRun = (run: GroceryRun): RunDraft => ({
  title: run.title,
  teamId: run.teamId,
  shopOn: run.shopOn,
  ticketId: run.ticketId,
  note: run.note,
  cashGiven: run.cashGiven,
  shopperIds: run.shopperIds,
});

const money = (s: string): number | null | "bad" => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(/[,₱\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : "bad";
};

/**
 * One grocery run, new or open, or closed (from History): who goes, when,
 * for which team and task, the cash handed over, its lines, receipts and
 * the change that came back. The footer moves it along: send or approve
 * (ready), send back (draft), close (done), cancel or delete. A manager can
 * still fix the figures on a closed one.
 */
export function RunModal({
  run,
  closedItems,
  closedReceipts,
  onClose,
}: {
  /** Absent: a new run. */
  run?: GroceryRun;
  /** A closed run's lines and receipts, from History. */
  closedItems?: GroceryItem[];
  closedReceipts?: GroceryReceipt[];
  onClose: () => void;
}) {
  const ctx = useGrocery();
  const { activeHelpers, teams, board } = useAppStores();
  const status: RunStatus = run?.status ?? "draft";
  const closed = status === "done" || status === "cancelled";
  const items = closedItems ?? (run ? (ctx.itemsByRun.get(run.id) ?? []) : []);

  const [draft, setDraft] = useState<RunDraft>(() =>
    run
      ? fromRun(run)
      : {
          title: "",
          teamId: null,
          shopOn: null,
          ticketId: null,
          note: "",
          cashGiven: null,
          shopperIds: [],
        },
  );
  const [cash, setCash] = useState(run?.cashGiven != null ? String(run.cashGiven) : "");
  const [change, setChange] = useState(
    run?.changeReturned != null ? String(run.changeReturned) : "",
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickingFromPool, setPickingFromPool] = useState(!run);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineName, setLineName] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [lineUnit, setLineUnit] = useState("pcs");
  // Task and note start folded unless the run already has one.
  const [moreOpen, setMoreOpen] = useState(
    () => !!run && (run.ticketId !== null || run.note.trim() !== ""),
  );

  const set = <K extends keyof RunDraft>(key: K, value: RunDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const spent = spentOn(items);
  const cashN = money(cash);
  const changeN = money(change);
  const unbought = items.filter((g) => !g.bought).length;
  const unpriced = unpricedCount(items);
  const anyBought = items.some((g) => g.bought);
  // A closed run (History) only has its cash and change fixed here.
  const canBuy = status === "ready";

  const helperName = (id: string) => activeHelpers.find((h) => h.id === id)?.name ?? "Someone";
  const taskOptions = useMemo(() => {
    const open = board.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    const linked = draft.ticketId ? board.tasks.find((t) => t.id === draft.ticketId) : undefined;
    return linked && !open.includes(linked) ? [linked, ...open] : open;
  }, [board.tasks, draft.ticketId]);

  /** Runs one step; shows the error here (the store already toasted). */
  const step = async (label: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      if (done) toast.success(done);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Left empty, a run is named for its day.
  const defaultTitle = draft.shopOn
    ? `${WEEKDAYS[new Date(`${draft.shopOn}T12:00:00`).getDay()]} palengke`
    : "Palengke";

  const validDraft = (): RunDraft | null => {
    if (cashN === "bad") {
      setError("Cash given: an amount in pesos, or empty.");
      return null;
    }
    return { ...draft, title: draft.title.trim() || defaultTitle, cashGiven: cashN };
  };

  const pickedLines = () => {
    const ids = [...picked];
    const real = ids.filter((id) => !id.startsWith("sug-"));
    const newItems: TemplateItem[] = ctx.needed
      .filter((g) => picked.has(g.id) && g.id.startsWith("sug-"))
      .map((g) => ({
        name: g.name,
        qty: g.qty,
        unit: g.unit,
        pantryItemId: g.pantryItemId ?? null,
      }));
    return { itemIds: real, newItems };
  };

  // A run sent to shop needs something to buy and someone to see it: a helper
  // sees a ready run only as its shopper, on its team or on its task
  // (grocery_run_visible). Drafts can stay empty.
  const sendBlocker = (d: RunDraft): string | null => {
    const lines = run ? items.length : picked.size;
    const taskHelper = d.ticketId ? board.tasks.find((t) => t.id === d.ticketId)?.helperId : null;
    const goes = d.shopperIds.length > 0 || d.teamId !== null || !!taskHelper;
    if (!lines && !goes) return "Pick at least one line and who goes.";
    if (!lines) return "Pick at least one line to buy.";
    if (!goes) return "Pick who goes (or a team, or a task with someone on it).";
    return null;
  };

  /** Saves the details (and, for a new run, its chosen lines); with `then`, moves it along after. */
  const save = async (label: string, opts: { send?: boolean; then?: RunStatus } = {}) => {
    const d = validDraft();
    if (!d) return;
    const blocked = opts.send || opts.then === "ready" ? sendBlocker(d) : null;
    if (blocked) return setError(blocked);
    const ok = await step(label, async () => {
      const chosen = pickedLines();
      const id = await ctx.saveRun(d, { id: run?.id, ...chosen, send: !run && opts.send });
      if (run && opts.then) await ctx.setRunStatus({ ...run, id }, opts.then);
    });
    if (ok) {
      toast.success(
        opts.send || opts.then === "ready"
          ? `${d.title.trim()} is ready to shop.`
          : run
            ? "Run saved."
            : "Draft saved.",
      );
      onClose();
    }
  };

  const addPicked = () =>
    step(
      "add",
      async () => {
        if (!run) return;
        const { itemIds } = pickedLines();
        if (itemIds.length) await ctx.moveItems(itemIds, run.id);
        // Suggestions go on linked to their pantry item, so buying them restocks it.
        for (const g of ctx.needed.filter((s) => picked.has(s.id) && s.id.startsWith("sug-"))) {
          await ctx.addSuggestion(g, run.id);
        }
        setPicked(new Set());
        setPickingFromPool(false);
      },
      undefined,
    );

  const addLine = () => {
    const n = parseAmount(lineQty);
    if (!lineName.trim()) return setError("Type what to buy.");
    if (n === null || n === 0) return setError("Qty: a number above 0.");
    if (!run) return;
    setError(null);
    ctx.addManual(lineName, n, lineUnit, run.id);
    setLineName("");
    setLineQty("1");
    setLineUnit("pcs");
  };

  // No more change can come back than the cash that went out (KNOWN_GAPS.md O51).
  const changeOverCash =
    cashN !== "bad" && changeN !== "bad" && cashN !== null && changeN !== null && changeN > cashN;
  const overCashError = () =>
    setError(`Change can't be more than the cash given (${fmtPeso(Number(cashN))}).`);

  const closeRun = () => {
    if (cashN === "bad") return setError("Cash given: an amount in pesos, or empty.");
    if (changeN === "bad") return setError("Change: an amount in pesos, or empty.");
    if (changeOverCash) return overCashError();
    if (!run) return;
    // With cash handed over, the change is what makes petty cash add up.
    if (cashN !== null && changeN === null) {
      return setError(
        `Enter the change that came back${expected !== null ? ` (${fmtPeso(expected)} if every cost is in)` : ""}.`,
      );
    }
    void step(
      "close",
      // The cash too: it's edited in the petty-cash box, and closing used to drop it.
      () => ctx.setRunStatus(run, "done", { cashGiven: cashN, changeReturned: changeN }),
      `${run.title} is closed.`,
    ).then((ok) => ok && onClose());
  };

  const fixFigures = () => {
    if (!run) return;
    if (cashN === "bad" || changeN === "bad") return setError("Amounts in pesos, or empty.");
    if (changeOverCash) return overCashError();
    void step(
      "fix",
      () => ctx.setRunStatus(run, run.status, { cashGiven: cashN, changeReturned: changeN }),
      "Saved.",
    ).then((ok) => ok && onClose());
  };

  const saveAsRepeat = () => {
    const d = validDraft();
    if (!d) return;
    const weekday = d.shopOn ? new Date(`${d.shopOn}T12:00:00`).getDay() : null;
    const source = items.length ? items : ctx.needed.filter((g) => picked.has(g.id));
    void step(
      "repeat",
      () =>
        ctx.saveTemplate({
          title: d.title.trim(),
          teamId: d.teamId,
          weekday,
          cashDefault: d.cashGiven,
          shopperIds: d.shopperIds,
          items: source.map((g) => ({
            name: g.name,
            qty: g.qty,
            unit: g.unit,
            pantryItemId: g.pantryItemId ?? null,
          })),
        }),
      `Saved ${d.title.trim()} as a repeat.`,
    );
  };

  const recon = reconcile(
    {
      cashGiven: cashN === "bad" ? null : cashN,
      changeReturned: changeN === "bad" ? null : changeN,
    },
    spent,
  );
  const expected = expectedChange(cashN === "bad" ? null : cashN, spent);

  const btn = (primary = false) =>
    primary
      ? "flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
      : "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5 disabled:opacity-50";
  const spin = (label: string) =>
    busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null;

  const readOnlyRow = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );

  const detailsSection = closed ? (
    <div className="divide-y divide-border/40">
      {draft.teamId && readOnlyRow("Team", teams.teamById.get(draft.teamId)?.name ?? "A team")}
      {draft.shopperIds.length > 0 &&
        readOnlyRow("Went", draft.shopperIds.map(helperName).join(", "))}
      {draft.note && readOnlyRow("Note", draft.note)}
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Name">
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={defaultTitle}
            maxLength={60}
            className={FIELD}
          />
        </Field>
      </div>
      <Field label="Day">
        <input
          type="date"
          value={draft.shopOn ?? ""}
          onChange={(e) => set("shopOn", e.target.value || null)}
          className={FIELD}
        />
      </Field>
      {teams.available && teams.teams.length > 0 && (
        <Field label="For team">
          <select
            value={draft.teamId ?? ""}
            onChange={(e) => set("teamId", e.target.value || null)}
            className={FIELD}
          >
            <option value="">No team</option>
            {teams.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="sm:col-span-2" role="group" aria-label="Who goes">
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Who goes</span>
        {draft.shopperIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.shopperIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  set(
                    "shopperIds",
                    draft.shopperIds.filter((x) => x !== id),
                  )
                }
                aria-label={`Take ${helperName(id)} off this run`}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary"
              >
                {helperName(id)} <X className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        <HelperPicker
          helpers={activeHelpers.filter((h) => !draft.shopperIds.includes(h.id))}
          value=""
          onChange={(id) => id && set("shopperIds", [...draft.shopperIds, id])}
          ariaLabel="Add someone to this run"
          before={[{ value: "", label: "Add someone…" }]}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          They see it in the Linara app once it&apos;s ready
          {draft.teamId ? ", and so does everyone on its team" : ""}.
        </span>
      </div>
      {/* Once it's ready to shop, the cash sits with the spend and change in
          the petty-cash box below, so it's entered in one place. */}
      {status !== "ready" && (
        <Field label="Cash given (₱)">
          <input
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            placeholder={status === "pending" ? "Set when approving" : "None yet"}
            aria-invalid={cashN === "bad"}
            className={FIELD}
          />
        </Field>
      )}
      <details
        className="group sm:col-span-2"
        open={moreOpen}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
      >
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-lg py-1 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden />
          Task and note
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Task it rides on">
            <select
              value={draft.ticketId ?? NO_TASK}
              onChange={(e) => set("ticketId", e.target.value || null)}
              className={FIELD}
            >
              <option value={NO_TASK}>None</option>
              {draft.ticketId && !taskOptions.some((t) => t.id === draft.ticketId) && (
                <option value={draft.ticketId}>A task on another day</option>
              )}
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.time} · {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
              maxLength={300}
              placeholder="e.g. Buy the fish at Suki Mang Ben"
              className={FIELD}
            />
          </Field>
        </div>
      </details>
    </div>
  );

  const linesSection = (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {run ? `On this run · ${items.length}` : "What to buy"}
        </span>
        {run && !closed && !pickingFromPool && (
          <button
            type="button"
            onClick={() => setPickingFromPool(true)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            Add from Needed
          </button>
        )}
      </div>
      {pickingFromPool && !closed && (
        <div className="mb-2 space-y-2">
          <PoolPicker items={ctx.needed} picked={picked} onPicked={setPicked} />
          {run && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPicked(new Set());
                  setPickingFromPool(false);
                }}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={picked.size === 0 || busy !== null}
                onClick={() => void addPicked()}
                className={btn()}
              >
                {spin("add")} Add {picked.size || ""} to this run
              </button>
            </div>
          )}
        </div>
      )}
      {run && (
        <div className="divide-y divide-border/70">
          {items.map((g) => (
            <GroceryRow
              key={g.id}
              item={g}
              onToggleBought={canBuy ? () => ctx.toggleBought(g) : undefined}
              onCost={canBuy ? (cost) => ctx.setCost(g, cost) : undefined}
              onEdit={closed ? undefined : (patch) => ctx.edit(g, patch)}
              onRemove={closed ? undefined : () => void ctx.moveItems([g.id], null)}
              unlist
            />
          ))}
          {items.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">Nothing on this run yet.</p>
          )}
        </div>
      )}
      {run && !closed && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3">
          <label className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Add a line
            </span>
            <input
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLine()}
              placeholder="e.g. ulam for Sunday"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="w-16">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Qty</span>
            <input
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <label className="w-20">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Unit</span>
            <input
              value={lineUnit}
              onChange={(e) => setLineUnit(e.target.value)}
              className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
            />
          </label>
          <button type="button" onClick={addLine} className={btn()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-foreground">{run ? run.title : "New run"}</h3>
            {run && <RunStatusPill status={status} />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {run
              ? [
                  run.createdByName && `Made by ${run.createdByName}`,
                  run.approvedByName && `approved by ${run.approvedByName}`,
                  run.closedByName && `closed by ${run.closedByName}`,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "Choose what's needed, who goes, and the cash they take."}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* A closed run reads as a record, details first. Otherwise what to buy is
          the point of the run, so it comes first and the details follow. */}
      <div className="mt-4 space-y-5">
        {closed ? detailsSection : linesSection}
        {closed ? linesSection : detailsSection}
      </div>

      {/* Money */}
      {run && (status === "ready" || closed) && (
        <div className="mt-5 rounded-2xl bg-background/60 p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Petty cash</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Cash given</div>
              <input
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                inputMode="decimal"
                placeholder="₱"
                aria-label="Cash given"
                aria-invalid={cashN === "bad"}
                className="mt-1 w-full rounded-lg border border-input bg-card px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-primary"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Spent</div>
              <div className="font-display text-lg tabular-nums text-foreground">
                {fmtPeso(spent)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Change back</div>
              <input
                value={change}
                onChange={(e) => setChange(e.target.value)}
                inputMode="decimal"
                placeholder="₱"
                aria-label="Change returned"
                className="mt-1 w-full rounded-lg border border-input bg-card px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-primary"
              />
            </div>
          </div>
          {/* The expected change is said in words, with a button to use it: as a
              placeholder it looked already typed in. Only once every cost is in,
              or it would be a wrong number to accept. */}
          {change.trim() === "" && expected !== null && unpriced === 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                Expected back:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {fmtPeso(expected)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setChange(String(expected))}
                className="rounded-lg px-2 py-1 font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5"
              >
                Use {fmtPeso(expected)}
              </button>
            </p>
          )}
          {/* A bought line with no cost counts as ₱0, so the gap may be that, not
              missing cash. Say which, rather than "not accounted for". */}
          {unpriced > 0 ? (
            <p className="mt-2 text-xs font-semibold text-terracotta-ink">
              {unpriced} bought {unpriced === 1 ? "line has" : "lines have"} no cost yet. Add{" "}
              {unpriced === 1 ? "its cost" : "their costs"} above to check the change.
            </p>
          ) : (
            recon.gap !== null && (
              <p
                className={`mt-2 text-xs font-semibold ${recon.gap === 0 ? "text-pine-deep" : "text-status-late-ink"}`}
              >
                {recon.gap === 0
                  ? "It balances."
                  : recon.gap > 0
                    ? `${fmtPeso(recon.gap)} not accounted for.`
                    : `${fmtPeso(-recon.gap)} more came back than expected; check the costs.`}
              </p>
            )
          )}
          {status === "ready" && unbought > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Closing puts the {unbought} {unbought === 1 ? "line" : "lines"} not bought back in
              Needed.
            </p>
          )}
        </div>
      )}

      {/* Receipts */}
      {run && (status === "ready" || closed) && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Receipts</div>
          {closed ? (
            <ReceiptSlot receipts={closedReceipts ?? []} />
          ) : (
            <ReceiptSlot runId={run.id} />
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      {/* Moving it along */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-4">
        {run && (status === "draft" || status === "pending") && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void step(
                "delete",
                () => ctx.deleteRun(run),
                "Deleted. Its lines are back in Needed.",
              ).then((ok) => ok && onClose())
            }
            className="mr-auto rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {spin("delete")} Delete
          </button>
        )}
        {run && status === "ready" && !anyBought && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void step("cancel", () => ctx.setRunStatus(run, "cancelled"), "Run cancelled.").then(
                (ok) => ok && onClose(),
              )
            }
            className="mr-auto rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {spin("cancel")} Cancel run
          </button>
        )}
        {ctx.runsAvailable && (items.length > 0 || picked.size > 0) && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={saveAsRepeat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {spin("repeat") ?? <Repeat className="h-3.5 w-3.5" />} Save as repeat
          </button>
        )}

        {!run && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("draft")}
              className={btn()}
            >
              {spin("draft")} Save draft
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("send", { send: true })}
              className={btn(true)}
            >
              {spin("send")} Send to shop
            </button>
          </>
        )}
        {run && status === "draft" && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("save")}
              className={btn()}
            >
              {spin("save")} Save
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("send", { then: "ready" })}
              className={btn(true)}
            >
              {spin("send")} Send to shop
            </button>
          </>
        )}
        {run && status === "pending" && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void step(
                  "back",
                  () => ctx.setRunStatus(run, "draft"),
                  "Sent back as a draft.",
                ).then((ok) => ok && onClose())
              }
              className={btn()}
            >
              {spin("back")} Send back
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("approve", { then: "ready" })}
              className={btn(true)}
            >
              {spin("approve")} Approve
            </button>
          </>
        )}
        {run && status === "ready" && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void save("save")}
              className={btn()}
            >
              {spin("save")} Save
            </button>
            <button type="button" disabled={busy !== null} onClick={closeRun} className={btn(true)}>
              {spin("close")} Close run
            </button>
          </>
        )}
        {run && closed && (
          <button type="button" disabled={busy !== null} onClick={fixFigures} className={btn(true)}>
            {spin("fix")} Save figures
          </button>
        )}
      </div>
    </Modal>
  );
}
