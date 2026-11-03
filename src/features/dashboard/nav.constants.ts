import { Calendar, ClipboardList, Package, Users, Wallet } from "lucide-react";

import { currentT } from "@/lib/i18n/current-t";
import type { BottomNavItem } from "@/components/shared/bottom-nav";

/** Labels are read when shown, so they follow a language change. */
export const MANAGER_NAV: BottomNavItem[] = [
  {
    to: "/manager/pass",
    get label() {
      return currentT()("dashboard.navPass");
    },
    Icon: ClipboardList,
  },
  {
    to: "/manager/schedule",
    get label() {
      return currentT()("dashboard.navSchedule");
    },
    Icon: Calendar,
  },
  {
    to: "/manager/pantry",
    get label() {
      return currentT()("dashboard.navPantry");
    },
    Icon: Package,
  },
  {
    to: "/manager/money",
    get label() {
      return currentT()("dashboard.navMoney");
    },
    Icon: Wallet,
  },
  {
    to: "/manager/people",
    get label() {
      return currentT()("dashboard.navPeople");
    },
    Icon: Users,
  },
];
