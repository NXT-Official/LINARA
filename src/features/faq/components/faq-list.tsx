import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import type { Faq } from "../faq.types";

/** Anchor id for a question: "Who sees my notes?" -> "who-sees-my-notes". */
function faqSlug(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "question";
}

type Group = { category: string; items: { faq: Faq; slug: string }[] };

/** Categories in first-seen order, each question with an anchor unique on the page. */
function groupFaqs(faqs: Faq[]): Group[] {
  const groups = new Map<string, Group>();
  const used = new Set<string>();
  for (const faq of faqs) {
    const base = faqSlug(faq.question);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    const group = groups.get(faq.category) ?? { category: faq.category, items: [] };
    group.items.push({ faq, slug });
    groups.set(faq.category, group);
  }
  return [...groups.values()];
}

export function FaqList({ faqs, contactHref }: { faqs: Faq[]; contactHref: string }) {
  return (
    <div className="space-y-6">
      {groupFaqs(faqs).map((group) => (
        <section
          key={group.category}
          className="rounded-3xl border border-border/40 bg-card px-5 py-4 shadow-soft sm:px-7"
        >
          <h2 className="font-display text-lg font-semibold text-foreground">{group.category}</h2>
          <Accordion type="single" collapsible className="mt-1 divide-y divide-border/60">
            {group.items.map(({ faq, slug }) => (
              <AccordionItem key={faq.id} value={slug} id={slug} className="border-b-0">
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent className="whitespace-pre-line text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
      <p className="text-center text-sm text-muted-foreground">
        <a
          href={contactHref}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Still stuck? Message us
        </a>
      </p>
    </div>
  );
}
