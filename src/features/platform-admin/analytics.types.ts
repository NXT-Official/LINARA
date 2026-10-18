export type AnalyticsSeriesPoint = {
  /** `YYYY-MM` */
  month: string;
  revenueCentavos: number;
  cogsCentavos: number;
  profitCentavos: number;
  aiCalls: number;
};

export type AiByFunction = {
  fn: string;
  calls: number;
  costCentavos: number;
  inputTokens: number;
  outputTokens: number;
};

/** The `platform_analytics(p_from, p_to)` answer, camelCased. All money is integer centavos. */
export type Analytics = {
  revenueCentavos: number;
  cogsCentavos: number;
  costEntriesCentavos: number;
  aiCostCentavos: number;
  aiCalls: number;
  costPerCallCentavos: number | null;
  profitCentavos: number;
  payingHouseholds: number;
  users: number;
  profitPerUserCentavos: number | null;
  series: AnalyticsSeriesPoint[];
  aiByFn: AiByFunction[];
};

export const COST_CATEGORIES = ["infra", "ai", "payments", "support", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  infra: "Infra",
  ai: "AI",
  payments: "Payments",
  support: "Support",
  other: "Other",
};

export type CostEntry = {
  id: string;
  /** `YYYY-MM-DD`, always the first of the month */
  month: string;
  category: CostCategory;
  label: string;
  amountCentavos: number;
  note: string | null;
};

export type CostEntryInput = {
  id?: string;
  month: string;
  category: CostCategory;
  label: string;
  amountCentavos: number;
  note: string | null;
};

export type ModelPrice = {
  model: string;
  inputCentavosPer1m: number;
  outputCentavosPer1m: number;
  audioCentavosPerMinute: number;
  note: string | null;
};

export type RangePreset = "this_month" | "last_3_months" | "this_year";
