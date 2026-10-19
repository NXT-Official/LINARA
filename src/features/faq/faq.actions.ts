import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient, supabaseClient } from "@/lib/supabase";

import { FAQ_FALLBACK } from "./faq-fallback";
import type { Faq, FaqSource } from "./faq.types";

/**
 * The public FAQ read. Questions are written in the Linara console
 * (LINARA_ADMIN supabase/020-faq.sql); this app reads only the published ones,
 * through `faq_public_list()`, which anon may call.
 */
type Client = ReturnType<typeof createAuthedClient>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFaq = (r: Record<string, unknown>): Faq => ({
  id: String(r.id),
  question: String(r.question ?? ""),
  answer: String(r.answer ?? ""),
  category: String(r.category ?? "General"),
  sortOrder: Number(r.sort_order ?? 0),
});

const byCategory = (a: Faq, b: Faq) =>
  a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder;

/**
 * Public read. Never throws and never returns nothing: any problem (including
 * the function not being there yet), or no published rows, serves the
 * checked-in answers.
 */
export async function loadFaqs(
  client: Client = supabaseClient,
): Promise<{ faqs: Faq[]; source: FaqSource }> {
  try {
    const { data, error } = await client.rpc("faq_public_list");
    const faqs = !error && Array.isArray(data) ? data.filter(isRecord).map(toFaq) : [];
    if (faqs.length === 0) return { faqs: FAQ_FALLBACK, source: "fallback" };
    return { faqs: faqs.sort(byCategory), source: "db" };
  } catch {
    return { faqs: FAQ_FALLBACK, source: "fallback" };
  }
}

export const loadFaqsFn = createServerFn({ method: "POST" })
  .validator((data: Record<string, never>) => data)
  .handler(() => loadFaqs());
