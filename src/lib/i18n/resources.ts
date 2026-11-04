import type { ResourceKey } from "i18next";

import type { Locale } from "./locales";

import enAppointments from "@/locales/en/appointments.json";
import enAvailability from "@/locales/en/availability.json";
import enCommon from "@/locales/en/common.json";
import enDashboard from "@/locales/en/dashboard.json";
import enGroceries from "@/locales/en/groceries.json";
import enLanding from "@/locales/en/landing.json";
import enLeave from "@/locales/en/leave.json";
import enLedger from "@/locales/en/ledger.json";
import enLegal from "@/locales/en/legal.json";
import enPages from "@/locales/en/pages.json";
import enPantry from "@/locales/en/pantry.json";
import enPay from "@/locales/en/pay.json";
import enPeople from "@/locales/en/people.json";
import enPlan from "@/locales/en/plan.json";
import enSharing from "@/locales/en/sharing.json";
import enShifts from "@/locales/en/shifts.json";
import enTasks from "@/locales/en/tasks.json";
import enTeams from "@/locales/en/teams.json";
import enUtos from "@/locales/en/utos.json";
import filAppointments from "@/locales/fil/appointments.json";
import filAvailability from "@/locales/fil/availability.json";
import filCommon from "@/locales/fil/common.json";
import filDashboard from "@/locales/fil/dashboard.json";
import filGroceries from "@/locales/fil/groceries.json";
import filLanding from "@/locales/fil/landing.json";
import filLeave from "@/locales/fil/leave.json";
import filLedger from "@/locales/fil/ledger.json";
import filLegal from "@/locales/fil/legal.json";
import filPages from "@/locales/fil/pages.json";
import filPantry from "@/locales/fil/pantry.json";
import filPay from "@/locales/fil/pay.json";
import filPeople from "@/locales/fil/people.json";
import filPlan from "@/locales/fil/plan.json";
import filSharing from "@/locales/fil/sharing.json";
import filShifts from "@/locales/fil/shifts.json";
import filTasks from "@/locales/fil/tasks.json";
import filTeams from "@/locales/fil/teams.json";
import filUtos from "@/locales/fil/utos.json";
import esAppointments from "@/locales/es/appointments.json";
import esAvailability from "@/locales/es/availability.json";
import esCommon from "@/locales/es/common.json";
import esDashboard from "@/locales/es/dashboard.json";
import esGroceries from "@/locales/es/groceries.json";
import esLanding from "@/locales/es/landing.json";
import esLeave from "@/locales/es/leave.json";
import esLedger from "@/locales/es/ledger.json";
import esLegal from "@/locales/es/legal.json";
import esPages from "@/locales/es/pages.json";
import esPantry from "@/locales/es/pantry.json";
import esPay from "@/locales/es/pay.json";
import esPeople from "@/locales/es/people.json";
import esPlan from "@/locales/es/plan.json";
import esSharing from "@/locales/es/sharing.json";
import esShifts from "@/locales/es/shifts.json";
import esTasks from "@/locales/es/tasks.json";
import esTeams from "@/locales/es/teams.json";
import esUtos from "@/locales/es/utos.json";
import zhAppointments from "@/locales/zh-CN/appointments.json";
import zhAvailability from "@/locales/zh-CN/availability.json";
import zhCommon from "@/locales/zh-CN/common.json";
import zhDashboard from "@/locales/zh-CN/dashboard.json";
import zhGroceries from "@/locales/zh-CN/groceries.json";
import zhLanding from "@/locales/zh-CN/landing.json";
import zhLeave from "@/locales/zh-CN/leave.json";
import zhLedger from "@/locales/zh-CN/ledger.json";
import zhLegal from "@/locales/zh-CN/legal.json";
import zhPages from "@/locales/zh-CN/pages.json";
import zhPantry from "@/locales/zh-CN/pantry.json";
import zhPay from "@/locales/zh-CN/pay.json";
import zhPeople from "@/locales/zh-CN/people.json";
import zhPlan from "@/locales/zh-CN/plan.json";
import zhSharing from "@/locales/zh-CN/sharing.json";
import zhShifts from "@/locales/zh-CN/shifts.json";
import zhTasks from "@/locales/zh-CN/tasks.json";
import zhTeams from "@/locales/zh-CN/teams.json";
import zhUtos from "@/locales/zh-CN/utos.json";
import jaAppointments from "@/locales/ja/appointments.json";
import jaAvailability from "@/locales/ja/availability.json";
import jaCommon from "@/locales/ja/common.json";
import jaDashboard from "@/locales/ja/dashboard.json";
import jaGroceries from "@/locales/ja/groceries.json";
import jaLanding from "@/locales/ja/landing.json";
import jaLeave from "@/locales/ja/leave.json";
import jaLedger from "@/locales/ja/ledger.json";
import jaLegal from "@/locales/ja/legal.json";
import jaPages from "@/locales/ja/pages.json";
import jaPantry from "@/locales/ja/pantry.json";
import jaPay from "@/locales/ja/pay.json";
import jaPeople from "@/locales/ja/people.json";
import jaPlan from "@/locales/ja/plan.json";
import jaSharing from "@/locales/ja/sharing.json";
import jaShifts from "@/locales/ja/shifts.json";
import jaTasks from "@/locales/ja/tasks.json";
import jaTeams from "@/locales/ja/teams.json";
import jaUtos from "@/locales/ja/utos.json";

/**
 * Every language's catalog, one file per area under src/locales/<language>/,
 * merged into a single namespace so a key reads "area.key". English is the
 * reference: its shape is the type every key is checked against, and
 * src/lib/i18n/i18n.test.ts holds the others to it. Generated from the files
 * in src/locales/en/ (add an area there, for every language, then regenerate).
 */
export const en = {
  ...enAppointments,
  ...enAvailability,
  ...enCommon,
  ...enDashboard,
  ...enGroceries,
  ...enLanding,
  ...enLeave,
  ...enLedger,
  ...enLegal,
  ...enPages,
  ...enPantry,
  ...enPay,
  ...enPeople,
  ...enPlan,
  ...enSharing,
  ...enShifts,
  ...enTasks,
  ...enTeams,
  ...enUtos,
};

export type Catalog = typeof en;

export const RESOURCES: Record<Locale, { translation: ResourceKey }> = {
  en: { translation: en },
  fil: {
    translation: {
      ...filAppointments,
      ...filAvailability,
      ...filCommon,
      ...filDashboard,
      ...filGroceries,
      ...filLanding,
      ...filLeave,
      ...filLedger,
      ...filLegal,
      ...filPages,
      ...filPantry,
      ...filPay,
      ...filPeople,
      ...filPlan,
      ...filSharing,
      ...filShifts,
      ...filTasks,
      ...filTeams,
      ...filUtos,
    },
  },
  es: {
    translation: {
      ...esAppointments,
      ...esAvailability,
      ...esCommon,
      ...esDashboard,
      ...esGroceries,
      ...esLanding,
      ...esLeave,
      ...esLedger,
      ...esLegal,
      ...esPages,
      ...esPantry,
      ...esPay,
      ...esPeople,
      ...esPlan,
      ...esSharing,
      ...esShifts,
      ...esTasks,
      ...esTeams,
      ...esUtos,
    },
  },
  "zh-CN": {
    translation: {
      ...zhAppointments,
      ...zhAvailability,
      ...zhCommon,
      ...zhDashboard,
      ...zhGroceries,
      ...zhLanding,
      ...zhLeave,
      ...zhLedger,
      ...zhLegal,
      ...zhPages,
      ...zhPantry,
      ...zhPay,
      ...zhPeople,
      ...zhPlan,
      ...zhSharing,
      ...zhShifts,
      ...zhTasks,
      ...zhTeams,
      ...zhUtos,
    },
  },
  ja: {
    translation: {
      ...jaAppointments,
      ...jaAvailability,
      ...jaCommon,
      ...jaDashboard,
      ...jaGroceries,
      ...jaLanding,
      ...jaLeave,
      ...jaLedger,
      ...jaLegal,
      ...jaPages,
      ...jaPantry,
      ...jaPay,
      ...jaPeople,
      ...jaPlan,
      ...jaSharing,
      ...jaShifts,
      ...jaTasks,
      ...jaTeams,
      ...jaUtos,
    },
  },
};
