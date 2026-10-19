import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { loadFaqsFn } from "@/features/faq/faq.actions";
import { loadFaqsSafely } from "@/features/faq/faq-loader";
import { FaqPage } from "@/features/faq/pages/faq-page";

export const Route = createFileRoute("/faq")({
  // Never fails: any problem serves the checked-in answers (a server with no Supabase env throws before the action runs).
  loader: () => loadFaqsSafely(() => loadFaqsFn({ data: {} })),
  head: () => ({ meta: [{ title: "Linara — FAQ" }] }),
  component: FaqRoute,
  errorComponent: RouteError,
});

function FaqRoute() {
  const { faqs } = Route.useLoaderData();
  return <FaqPage faqs={faqs} />;
}
