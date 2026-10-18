import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { loadFaqsFn } from "@/features/faq/faq.actions";
import { FaqPage } from "@/features/faq/pages/faq-page";

export const Route = createFileRoute("/faq")({
  // Never fails: the server function serves the checked-in answers on any problem.
  loader: () => loadFaqsFn({ data: {} }),
  head: () => ({ meta: [{ title: "Linara — FAQ" }] }),
  component: FaqRoute,
  errorComponent: RouteError,
});

function FaqRoute() {
  const { faqs } = Route.useLoaderData();
  return <FaqPage faqs={faqs} />;
}
