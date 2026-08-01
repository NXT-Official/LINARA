import { createFileRoute } from "@tanstack/react-router";

import { PayRecordPage } from "@/features/ledger/pages/pay-record-page";

export const Route = createFileRoute("/_app/helper/pay")({
  component: PayRecordPage,
});
