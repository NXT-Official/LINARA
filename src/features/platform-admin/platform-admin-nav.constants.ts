import { BarChart3, CircleHelp, Home, MessagesSquare, Receipt, Tags } from "lucide-react";

import type { BottomNavItem } from "@/components/shared/bottom-nav";

export const PLATFORM_ADMIN_NAV: BottomNavItem[] = [
  { to: "/admin", label: "Overview", Icon: BarChart3, exact: true },
  { to: "/admin/households", label: "Households", Icon: Home },
  { to: "/admin/plans", label: "Plans", Icon: Tags },
  { to: "/admin/costs", label: "Costs", Icon: Receipt },
  { to: "/admin/support", label: "Support", Icon: MessagesSquare },
  { to: "/admin/faqs", label: "FAQs", Icon: CircleHelp },
];
