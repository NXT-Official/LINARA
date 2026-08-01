import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PayRecordPage } from "@/features/ledger/pages/pay-record-page";

export const Route = createFileRoute("/_app/helper/pay")({
  head: () => ({ meta: [{ title: "My Pay | Linara" }] }),
  component: PayRecordPage,
  errorComponent: RouteError,
});
