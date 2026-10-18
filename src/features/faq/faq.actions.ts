import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient, supabaseClient } from "@/lib/supabase";

import { FAQ_FALLBACK } from "./faq-fallback";
import type { Faq, FaqDraft, FaqSource } from "./faq.types";

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  published: boolean;
};

const COLUMNS = "id, question, answer, category, sort_order, published";

const toFaq = (r: FaqRow): Faq => ({
  id: r.id,
  question: r.question,
  answer: r.answer,
  category: r.category,
  sortOrder: r.sort_order,
  published: r.published,
});

/** The table isn't there yet (supabase/add-faqs.sql not applied). */
const missingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  /does not exist|could not find/i.test(error?.message ?? "");

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

type Client = ReturnType<typeof createAuthedClient>;

/**
 * Public read. Never throws and never returns nothing: any problem, or a table
 * with no published rows, serves the checked-in answers.
 */
export async function loadFaqs(
  client: Client = supabaseClient,
): Promise<{ faqs: Faq[]; source: FaqSource }> {
  try {
    const { data, error } = await client
      .from("faqs")
      .select(COLUMNS)
      .eq("published", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return { faqs: FAQ_FALLBACK, source: "fallback" };
    return { faqs: (data as FaqRow[]).map(toFaq), source: "db" };
  } catch {
    return { faqs: FAQ_FALLBACK, source: "fallback" };
  }
}

export async function listAllFaqs(client: Client): Promise<{ available: boolean; faqs: Faq[] }> {
  const { data: rows, error } = await client
    .from("faqs")
    .select(COLUMNS)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (missingTable(error)) return { available: false, faqs: [] };
  if (error) fail(error, "Couldn't load the FAQs");
  return { available: true, faqs: ((rows ?? []) as FaqRow[]).map(toFaq) };
}

export async function saveFaq(client: Client, faq: FaqDraft): Promise<{ available: boolean }> {
  const { id, question, answer, category, sortOrder, published } = faq;
  const values = {
    question: question.trim(),
    answer: answer.trim(),
    category: category.trim(),
    sort_order: sortOrder,
    published,
  };
  if (!id) {
    const { error } = await client.from("faqs").insert(values);
    if (missingTable(error)) return { available: false };
    if (error) fail(error, "Couldn't save the FAQ");
    return { available: true };
  }
  // PostgREST answers 200 for a write RLS filtered to zero rows, so ask for
  // the row back and treat none as a refusal.
  const { data: rows, error } = await client.from("faqs").update(values).eq("id", id).select("id");
  if (missingTable(error)) return { available: false };
  if (error) fail(error, "Couldn't save the FAQ");
  if (!rows || rows.length === 0) fail(null, "Couldn't save the FAQ: it was not changed");
  return { available: true };
}

export async function deleteFaq(client: Client, id: string): Promise<{ available: boolean }> {
  const { data: rows, error } = await client.from("faqs").delete().eq("id", id).select("id");
  if (missingTable(error)) return { available: false };
  if (error) fail(error, "Couldn't delete the FAQ");
  if (!rows || rows.length === 0) fail(null, "Couldn't delete the FAQ: it was not removed");
  return { available: true };
}

export const loadFaqsFn = createServerFn({ method: "POST" })
  .validator((data: Record<string, never>) => data)
  .handler(() => loadFaqs());

export const listAllFaqsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(({ data }) => listAllFaqs(createAuthedClient(data.token)));

export const saveFaqFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; faq: FaqDraft }) => data)
  .handler(({ data }) => saveFaq(createAuthedClient(data.token), data.faq));

export const deleteFaqFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(({ data }) => deleteFaq(createAuthedClient(data.token), data.id));
