import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import {
  COST_CATEGORIES,
  type Analytics,
  type CostCategory,
  type CostEntry,
  type CostEntryInput,
  type ModelPrice,
} from "./analytics.types";

/**
 * Costs and analytics for Linara staff. Until the SQL that creates the tables
 * and `platform_analytics` is applied they don't exist, and every answer is
 * `available: false` so the page says so instead of failing.
 */
type DbError = { code?: string; message?: string } | null;

const missing = (error: DbError) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  /does not exist|could not find/i.test(error?.message ?? "");

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type Json = Record<string, unknown>;

function toAnalytics(raw: Json): Analytics {
  const series = Array.isArray(raw.series) ? (raw.series as Json[]) : [];
  const byFn = Array.isArray(raw.ai_by_fn) ? (raw.ai_by_fn as Json[]) : [];
  return {
    revenueCentavos: num(raw.revenue_centavos),
    cogsCentavos: num(raw.cogs_centavos),
    costEntriesCentavos: num(raw.cost_entries_centavos),
    aiCostCentavos: num(raw.ai_cost_centavos),
    aiCalls: num(raw.ai_calls),
    costPerCallCentavos: numOrNull(raw.cost_per_call_centavos),
    profitCentavos: num(raw.profit_centavos),
    payingHouseholds: num(raw.paying_households),
    users: num(raw.users),
    profitPerUserCentavos: numOrNull(raw.profit_per_user_centavos),
    series: series.map((p) => ({
      month: String(p.month ?? ""),
      revenueCentavos: num(p.revenue_centavos),
      cogsCentavos: num(p.cogs_centavos),
      profitCentavos: num(p.profit_centavos),
      aiCalls: num(p.ai_calls),
    })),
    aiByFn: byFn.map((r) => ({
      fn: String(r.fn ?? ""),
      calls: num(r.calls),
      costCentavos: num(r.cost_centavos),
      inputTokens: num(r.input_tokens),
      outputTokens: num(r.output_tokens),
    })),
  };
}

export const getAnalyticsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; analytics: Analytics | null }> => {
    const client = createAuthedClient(data.token);
    const { data: raw, error } = await client.rpc("platform_analytics", {
      p_from: data.from,
      p_to: data.to,
    });
    if (missing(error)) return { available: false, analytics: null };
    if (error) throw new Error(error.message || "Couldn't load the analytics");
    if (raw === null || typeof raw !== "object") return { available: false, analytics: null };
    return { available: true, analytics: toAnalytics(raw as Json) };
  });

type CostRow = {
  id: string;
  month: string;
  category: CostCategory;
  label: string;
  amount_centavos: number;
  note: string | null;
};

const COST_COLUMNS = "id, month, category, label, amount_centavos, note";

const toEntry = (r: CostRow): CostEntry => ({
  id: r.id,
  month: r.month,
  category: r.category,
  label: r.label,
  amountCentavos: Number(r.amount_centavos),
  note: r.note,
});

export const listCostEntriesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; entries: CostEntry[] }> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("cost_entries")
      .select(COST_COLUMNS)
      .order("month", { ascending: false })
      .order("created_at", { ascending: false });
    if (missing(error)) return { available: false, entries: [] };
    if (error) throw new Error(error.message || "Couldn't load the costs");
    return { available: true, entries: ((rows ?? []) as CostRow[]).map(toEntry) };
  });

export const saveCostEntryFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; entry: CostEntryInput }) => {
    const { entry } = data;
    if (!COST_CATEGORIES.includes(entry.category)) throw new Error("Pick a valid category.");
    if (!/^\d{4}-\d{2}-01$/.test(entry.month)) throw new Error("Pick a month.");
    if (!entry.label.trim()) throw new Error("Add a label.");
    if (!Number.isSafeInteger(entry.amountCentavos) || entry.amountCentavos < 0) {
      throw new Error("The amount must be ₱0 or more.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ available: boolean; entry: CostEntry | null }> => {
    const client = createAuthedClient(data.token);
    const { entry } = data;
    const fields = {
      month: entry.month,
      category: entry.category,
      label: entry.label,
      amount_centavos: entry.amountCentavos,
      note: entry.note,
    };
    const query = entry.id
      ? client.from("cost_entries").update(fields).eq("id", entry.id)
      : client.from("cost_entries").insert(fields);
    const { data: row, error } = await query.select(COST_COLUMNS).single();
    if (missing(error)) return { available: false, entry: null };
    if (error || !row) throw new Error(error?.message || "Couldn't save the cost");
    return { available: true, entry: toEntry(row as CostRow) };
  });

export const deleteCostEntryFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean }> => {
    const client = createAuthedClient(data.token);
    const { data: removed, error } = await client
      .from("cost_entries")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (missing(error)) return { available: false };
    if (error) throw new Error(error.message || "Couldn't delete the cost");
    // RLS filters a delete it doesn't allow without an error: zero rows means nothing happened.
    if (!removed || removed.length === 0) throw new Error("Couldn't delete the cost");
    return { available: true };
  });

type PriceRow = {
  model: string;
  input_centavos_per_1m: number;
  output_centavos_per_1m: number;
  audio_centavos_per_minute: number;
  note: string | null;
};

const PRICE_COLUMNS =
  "model, input_centavos_per_1m, output_centavos_per_1m, audio_centavos_per_minute, note";

const toPrice = (r: PriceRow): ModelPrice => ({
  model: r.model,
  inputCentavosPer1m: Number(r.input_centavos_per_1m),
  outputCentavosPer1m: Number(r.output_centavos_per_1m),
  audioCentavosPerMinute: Number(r.audio_centavos_per_minute),
  note: r.note,
});

export const listModelPricesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; prices: ModelPrice[] }> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("model_prices")
      .select(PRICE_COLUMNS)
      .order("model", { ascending: true });
    if (missing(error)) return { available: false, prices: [] };
    if (error) throw new Error(error.message || "Couldn't load the model prices");
    return { available: true, prices: ((rows ?? []) as PriceRow[]).map(toPrice) };
  });

export const saveModelPriceFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; price: ModelPrice }) => {
    const { price } = data;
    if (!price.model.trim()) throw new Error("Name the model.");
    for (const v of [
      price.inputCentavosPer1m,
      price.outputCentavosPer1m,
      price.audioCentavosPerMinute,
    ]) {
      if (!Number.isSafeInteger(v) || v < 0) throw new Error("Prices must be ₱0 or more.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ available: boolean; price: ModelPrice | null }> => {
    const client = createAuthedClient(data.token);
    const { price } = data;
    const { data: row, error } = await client
      .from("model_prices")
      .upsert(
        {
          model: price.model,
          input_centavos_per_1m: price.inputCentavosPer1m,
          output_centavos_per_1m: price.outputCentavosPer1m,
          audio_centavos_per_minute: price.audioCentavosPerMinute,
          note: price.note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "model" },
      )
      .select(PRICE_COLUMNS)
      .single();
    if (missing(error)) return { available: false, price: null };
    if (error || !row) throw new Error(error?.message || "Couldn't save the price");
    return { available: true, price: toPrice(row as PriceRow) };
  });
