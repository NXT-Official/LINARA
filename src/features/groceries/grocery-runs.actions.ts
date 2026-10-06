import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import { signReceipts, toGroceryItem, type GroceryItemRow } from "./grocery.actions";
import type {
  GroceryBudgets,
  GroceryHistory,
  GroceryItem,
  GroceryRun,
  GroceryTemplate,
  MonthSpend,
  RunDraft,
  RunStatus,
  TemplateDraft,
  TemplateItem,
} from "./grocery.types";

// --------------------------------------------------------------------------
// Grocery runs, repeats and budgets (supabase/add-grocery-runs.sql,
// KNOWN_GAPS.md O40). The database decides who may do what (managers
// everything, pantry leads drafts, shoppers ticking and closing); this web
// app is the managers', so it offers all of it. Until the SQL is applied,
// the board falls back to the one list there always was.
// --------------------------------------------------------------------------

type Client = ReturnType<typeof createAuthedClient>;

const isMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    /does not exist|could not find/i.test(error.message ?? ""));

type RunRow = {
  id: string;
  title: string;
  status: RunStatus;
  team_id: string | null;
  shop_on: string | null;
  ticket_id: string | null;
  template_id: string | null;
  cash_given: number | null;
  change_returned: number | null;
  note: string | null;
  created_by: string | null;
  approved_by: string | null;
  closed_by: string | null;
  created_at: string;
  closed_at: string | null;
};

const num = (n: number | string | null) => (n === null ? null : Number(n));

/** Runs with their shoppers and the names of who made, approved and closed them. */
async function hydrateRuns(client: Client, rows: RunRow[]): Promise<GroceryRun[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const people = [
    ...new Set(
      rows.flatMap((r) => [r.created_by, r.approved_by, r.closed_by]).filter(Boolean) as string[],
    ),
  ];
  const [shoppers, profiles] = await Promise.all([
    client.from("grocery_run_shoppers").select("run_id, helper_id").in("run_id", ids),
    people.length
      ? client.from("user_profiles").select("id, full_name").in("id", people)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (shoppers.error) throw new Error(shoppers.error.message);
  const names = new Map(
    ((profiles.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]),
  );
  const byRun = new Map<string, string[]>();
  for (const s of (shoppers.data ?? []) as { run_id: string; helper_id: string }[]) {
    byRun.set(s.run_id, [...(byRun.get(s.run_id) ?? []), s.helper_id]);
  }
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    teamId: r.team_id,
    shopOn: r.shop_on,
    ticketId: r.ticket_id,
    templateId: r.template_id,
    cashGiven: num(r.cash_given),
    changeReturned: num(r.change_returned),
    note: r.note ?? "",
    shopperIds: byRun.get(r.id) ?? [],
    createdByName: name(r.created_by),
    approvedByName: name(r.approved_by),
    closedByName: name(r.closed_by),
    createdAt: r.created_at,
    closedAt: r.closed_at,
  }));
}

/** What was bought from `since`, by the team of the run it was on. */
async function monthSpend(client: Client, since: string): Promise<MonthSpend> {
  const { data, error } = await client
    .from("grocery_items")
    .select("actual_cost, run_id")
    .eq("bought", true)
    .gte("bought_at", since);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { actual_cost: number | null; run_id: string | null }[];
  const runIds = [...new Set(rows.map((r) => r.run_id).filter(Boolean) as string[])];
  const teamOf = new Map<string, string | null>();
  if (runIds.length) {
    const runs = await client.from("grocery_runs").select("id, team_id").in("id", runIds);
    if (runs.error) throw new Error(runs.error.message);
    for (const r of (runs.data ?? []) as { id: string; team_id: string | null }[]) {
      teamOf.set(r.id, r.team_id);
    }
  }
  const spend: MonthSpend = { total: 0, byTeam: {}, noTeam: 0 };
  for (const r of rows) {
    const cost = Number(r.actual_cost ?? 0);
    spend.total += cost;
    const team = r.run_id ? (teamOf.get(r.run_id) ?? null) : null;
    if (team) spend.byTeam[team] = (spend.byTeam[team] ?? 0) + cost;
    else spend.noTeam += cost;
  }
  return spend;
}

export type GroceryBoard = {
  available: boolean;
  items: GroceryItem[];
  runs: GroceryRun[];
  templates: GroceryTemplate[];
  budgets: GroceryBudgets;
  month: MonthSpend;
};

/** Before add-grocery-runs.sql: every line on one list, against the old petty-cash number. */
async function legacyBoard(client: Client): Promise<GroceryBoard> {
  const [items, household] = await Promise.all([
    client.from("grocery_items").select("*").order("created_at", { ascending: true }),
    client.from("households").select("petty_cash_budget").limit(1).maybeSingle(),
  ]);
  if (items.error) throw new Error(items.error.message);
  const rows = ((items.data ?? []) as GroceryItemRow[]).map(toGroceryItem);
  const total = rows.reduce((s, g) => s + (g.bought ? (g.costPHP ?? 0) : 0), 0);
  return {
    available: false,
    items: rows,
    runs: [],
    templates: [],
    budgets: {
      house: household.data ? Number(household.data.petty_cash_budget) : null,
      byTeam: {},
    },
    month: { total, byTeam: {}, noTeam: total },
  };
}

/**
 * Everything the Pantry page's palengke needs at once: the pool (unbought,
 * plus what was ticked since `dayStart`), the open runs and their lines,
 * the repeats, the budgets and this month's spend from `monthStart`.
 * History is fetched a month at a time by listGroceryHistoryFn.
 */
export const listGroceryBoardFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; monthStart: string; dayStart: string }) => data)
  .handler(async ({ data }): Promise<GroceryBoard> => {
    const client = createAuthedClient(data.token);
    const runsRes = await client
      .from("grocery_runs")
      .select("*")
      .in("status", ["draft", "pending", "ready"])
      .order("created_at", { ascending: true });
    if (isMissing(runsRes.error)) return legacyBoard(client);
    if (runsRes.error) throw new Error(runsRes.error.message);
    const runRows = (runsRes.data ?? []) as RunRow[];
    const openIds = runRows.map((r) => r.id);

    const [pool, onRuns, templates, budgets, runs, month] = await Promise.all([
      client
        .from("grocery_items")
        .select("*")
        .is("run_id", null)
        .or(`bought.eq.false,bought_at.gte."${data.dayStart}"`)
        .order("created_at", { ascending: true }),
      openIds.length
        ? client
            .from("grocery_items")
            .select("*")
            .in("run_id", openIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      client
        .from("grocery_templates")
        .select("*, items:grocery_template_items(name, qty, unit, pantry_item_id, created_at)")
        .order("title", { ascending: true }),
      client.from("grocery_budgets").select("team_id, monthly_amount"),
      hydrateRuns(client, runRows),
      monthSpend(client, data.monthStart),
    ]);
    for (const res of [pool, onRuns, templates, budgets]) {
      if (res.error) throw new Error(res.error.message);
    }

    const templateRows = (templates.data ?? []) as {
      id: string;
      title: string;
      team_id: string | null;
      repeat_weekday: number | null;
      cash_default: number | null;
      shopper_ids: string[];
      items: {
        name: string;
        qty: number;
        unit: string;
        pantry_item_id: string | null;
        created_at: string;
      }[];
    }[];
    const lastStarted = new Map<string, string>();
    if (templateRows.length) {
      const started = await client
        .from("grocery_runs")
        .select("template_id, created_at")
        .in(
          "template_id",
          templateRows.map((t) => t.id),
        )
        .order("created_at", { ascending: false });
      if (started.error) throw new Error(started.error.message);
      for (const r of (started.data ?? []) as { template_id: string; created_at: string }[]) {
        if (!lastStarted.has(r.template_id)) lastStarted.set(r.template_id, r.created_at);
      }
    }

    const budgetRows = (budgets.data ?? []) as { team_id: string | null; monthly_amount: number }[];
    return {
      available: true,
      items: [...(pool.data ?? []), ...(onRuns.data ?? [])].map((r) =>
        toGroceryItem(r as GroceryItemRow),
      ),
      runs,
      templates: templateRows.map((t) => ({
        id: t.id,
        title: t.title,
        teamId: t.team_id,
        weekday: t.repeat_weekday,
        cashDefault: num(t.cash_default),
        shopperIds: t.shopper_ids ?? [],
        items: [...(t.items ?? [])]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((i) => ({
            name: i.name,
            qty: Number(i.qty),
            unit: i.unit,
            pantryItemId: i.pantry_item_id,
          })),
        lastStartedAt: lastStarted.get(t.id) ?? null,
      })),
      budgets: {
        house: num(budgetRows.find((b) => b.team_id === null)?.monthly_amount ?? null),
        byTeam: Object.fromEntries(
          budgetRows
            .filter((b) => b.team_id !== null)
            .map((b) => [b.team_id as string, Number(b.monthly_amount)]),
        ),
      },
      month,
    };
  });

/** One month of closed runs, with their lines and receipts, and what was bought outside a run. */
export const listGroceryHistoryFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<GroceryHistory> => {
    const client = createAuthedClient(data.token);
    const runsRes = await client
      .from("grocery_runs")
      .select("*")
      .in("status", ["done", "cancelled"])
      .gte("closed_at", data.from)
      .lt("closed_at", data.to)
      .order("closed_at", { ascending: false });
    if (isMissing(runsRes.error)) return { runs: [], outside: [] };
    if (runsRes.error) throw new Error(runsRes.error.message);
    const runRows = (runsRes.data ?? []) as RunRow[];
    const ids = runRows.map((r) => r.id);

    const [runs, items, receipts, outside] = await Promise.all([
      hydrateRuns(client, runRows),
      ids.length
        ? client.from("grocery_items").select("*").in("run_id", ids).order("created_at")
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? client
            .from("grocery_receipts")
            .select("*, uploaded_by_profile:user_profiles(full_name)")
            .in("run_id", ids)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      client
        .from("grocery_items")
        .select("*")
        .is("run_id", null)
        .eq("bought", true)
        .gte("bought_at", data.from)
        .lt("bought_at", data.to)
        .order("bought_at", { ascending: false }),
    ]);
    for (const res of [items, receipts, outside]) {
      if (res.error) throw new Error(res.error.message);
    }
    const signed = await signReceipts(
      client,
      (receipts.data ?? []) as unknown as Parameters<typeof signReceipts>[1],
    );
    const lines = ((items.data ?? []) as GroceryItemRow[]).map(toGroceryItem);
    return {
      runs: runs.map((r) => ({
        ...r,
        items: lines.filter((g) => g.runId === r.id),
        receipts: signed.filter((s) => s.runId === r.id),
      })),
      outside: ((outside.data ?? []) as GroceryItemRow[]).map(toGroceryItem),
    };
  });

/** Sets a run's shoppers to exactly these people. */
async function syncShoppers(client: Client, runId: string, helperIds: string[]) {
  const { data, error } = await client
    .from("grocery_run_shoppers")
    .select("helper_id")
    .eq("run_id", runId);
  if (error) throw new Error(error.message);
  const current = new Set(((data ?? []) as { helper_id: string }[]).map((r) => r.helper_id));
  const wanted = new Set(helperIds);
  const gone = [...current].filter((id) => !wanted.has(id));
  const added = [...wanted].filter((id) => !current.has(id));
  if (gone.length) {
    const res = await client
      .from("grocery_run_shoppers")
      .delete()
      .eq("run_id", runId)
      .in("helper_id", gone);
    if (res.error) throw new Error(res.error.message);
  }
  if (added.length) {
    const res = await client
      .from("grocery_run_shoppers")
      .insert(added.map((helper_id) => ({ run_id: runId, helper_id })));
    if (res.error) throw new Error(res.error.message);
  }
}

/**
 * Makes a run, or saves one. `itemIds` come off the pool onto it and
 * `newItems` (pantry-low suggestions nobody had listed yet) go straight on;
 * with `send` a new run goes out ready to shop (a manager's own run needs no
 * approval).
 */
export const saveGroceryRunFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id?: string;
      draft: RunDraft;
      itemIds?: string[];
      newItems?: TemplateItem[];
      send?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { draft } = data;
    const fields = {
      title: draft.title.trim(),
      team_id: draft.teamId,
      shop_on: draft.shopOn,
      ticket_id: draft.ticketId,
      note: draft.note.trim() || null,
      cash_given: draft.cashGiven,
    };
    let id = data.id;
    if (id) {
      const { error } = await client.from("grocery_runs").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await client
        .from("grocery_runs")
        .insert({ ...fields, status: data.send ? "ready" : "draft" })
        .select("id")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Couldn't make the run.");
      id = row.id as string;
    }
    await syncShoppers(client, id, draft.shopperIds);
    if (data.itemIds?.length) {
      const { error } = await client
        .from("grocery_items")
        .update({ run_id: id })
        .in("id", data.itemIds);
      if (error) throw new Error(error.message);
    }
    if (data.newItems?.length) {
      const household = await client
        .from("grocery_runs")
        .select("household_id")
        .eq("id", id)
        .single();
      if (household.error) throw new Error(household.error.message);
      const { error } = await client.from("grocery_items").insert(
        data.newItems.map((i) => ({
          household_id: household.data.household_id,
          name: i.name,
          qty: i.qty,
          unit: i.unit,
          pantry_item_id: i.pantryItemId,
          run_id: id,
          bought: false,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { id };
  });

export const setGroceryRunStatusFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id: string;
      status: RunStatus;
      cashGiven?: number | null;
      changeReturned?: number | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.cashGiven !== undefined) patch.cash_given = data.cashGiven;
    if (data.changeReturned !== undefined) patch.change_returned = data.changeReturned;
    const { error } = await client.from("grocery_runs").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/** Only a draft or a run waiting for approval; its lines go back to the pool. */
export const deleteGroceryRunFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: gone, error } = await client
      .from("grocery_runs")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("Only a draft can be deleted. Cancel the run instead.");
    return { id: data.id };
  });

/** Lines onto a run, or back to the pool (`runId` null). */
export const moveGroceryItemsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemIds: string[]; runId: string | null }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client
      .from("grocery_items")
      .update({ run_id: data.runId })
      .in("id", data.itemIds);
    if (error) throw new Error(error.message);
    return { moved: data.itemIds.length };
  });

/** Makes or replaces a repeat, its items included. */
export const saveGroceryTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id?: string; draft: TemplateDraft }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { draft } = data;
    const fields = {
      title: draft.title.trim(),
      team_id: draft.teamId,
      repeat_weekday: draft.weekday,
      cash_default: draft.cashDefault,
      shopper_ids: draft.shopperIds,
    };
    let id = data.id;
    if (id) {
      const { error } = await client.from("grocery_templates").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      const del = await client.from("grocery_template_items").delete().eq("template_id", id);
      if (del.error) throw new Error(del.error.message);
    } else {
      const { data: row, error } = await client
        .from("grocery_templates")
        .insert(fields)
        .select("id")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Couldn't save the repeat.");
      id = row.id as string;
    }
    if (draft.items.length) {
      const { error } = await client.from("grocery_template_items").insert(
        draft.items.map((i) => ({
          template_id: id,
          name: i.name.trim(),
          qty: i.qty,
          unit: i.unit.trim() || "pcs",
          pantry_item_id: i.pantryItemId,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { id };
  });

export const deleteGroceryTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.from("grocery_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/** A draft run from a repeat (start_grocery_run). */
export const startGroceryTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; shopOn: string | null }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: runId, error } = await client.rpc("start_grocery_run", {
      p_template_id: data.id,
      p_shop_on: data.shopOn,
    });
    if (error) throw new Error(error.message);
    return { id: runId as string };
  });

/** The house's monthly budget (`teamId` null) or a team's; `amount` null removes it. */
export const setGroceryBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; teamId: string | null; amount: number | null }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const existing =
      data.teamId === null
        ? client.from("grocery_budgets").select("id").is("team_id", null)
        : client.from("grocery_budgets").select("id").eq("team_id", data.teamId);
    const { data: rows, error } = await existing;
    if (error) throw new Error(error.message);
    const id = (rows ?? [])[0]?.id as string | undefined;
    if (data.amount === null) {
      if (id) {
        const res = await client.from("grocery_budgets").delete().eq("id", id);
        if (res.error) throw new Error(res.error.message);
      }
      return { ok: true };
    }
    const res = id
      ? await client
          .from("grocery_budgets")
          .update({ monthly_amount: data.amount, updated_at: new Date().toISOString() })
          .eq("id", id)
      : await client
          .from("grocery_budgets")
          .insert({ team_id: data.teamId, monthly_amount: data.amount });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });
