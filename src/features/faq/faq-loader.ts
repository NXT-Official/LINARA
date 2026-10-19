import { FAQ_FALLBACK } from "./faq-fallback";
import type { Faq, FaqSource } from "./faq.types";

export type FaqReply = { faqs: Faq[]; source: FaqSource };

/**
 * The /faq loader. A visitor must always get a page: a failed call (including
 * a server with no Supabase env, which throws before the action's own
 * try/catch runs) or a malformed or empty reply serves the checked-in answers
 * instead of a 500.
 */
export async function loadFaqsSafely(fetchFaqs: () => Promise<FaqReply>): Promise<FaqReply> {
  try {
    const res = await fetchFaqs();
    return Array.isArray(res?.faqs) && res.faqs.length > 0
      ? res
      : { faqs: FAQ_FALLBACK, source: "fallback" };
  } catch {
    return { faqs: FAQ_FALLBACK, source: "fallback" };
  }
}
