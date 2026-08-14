import { Calendar, ClipboardList, Package, Users, Wallet } from "lucide-react";

import type { BottomNavItem } from "@/components/shared/bottom-nav";

export const MANAGER_NAV: BottomNavItem[] = [
  { to: "/manager/pass", label: "Pass", Icon: ClipboardList },
  { to: "/manager/schedule", label: "Schedule", Icon: Calendar },
  { to: "/manager/pantry", label: "Pantry", Icon: Package },
  { to: "/manager/money", label: "Money", Icon: Wallet },
  { to: "/manager/people", label: "People", Icon: Users },
];
