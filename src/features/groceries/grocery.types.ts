export type GroceryItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pantryItemId?: string; // set when it was auto-suggested from pantry
  bought: boolean;
  costPHP?: number; // what it cost, entered by whoever bought it
  /** The run it's on; absent for the Needed pool (supabase/add-grocery-runs.sql). */
  runId?: string;
  /** When it was ticked bought, for the month it counts against. */
  boughtAt?: string;
};

/**
 * draft (a manager or pantry lead is putting it together) -> pending (a lead
 * asked for approval) -> ready (approved, cash handed over: shop) -> done,
 * or cancelled. See supabase/add-grocery-runs.sql.
 */
export type RunStatus = "draft" | "pending" | "ready" | "done" | "cancelled";

export type GroceryRun = {
  id: string;
  title: string;
  status: RunStatus;
  teamId: string | null;
  /** YYYY-MM-DD. */
  shopOn: string | null;
  /** The task that carries it (the trip to the market). */
  ticketId: string | null;
  templateId: string | null;
  /** Abono: cash handed to the shoppers. */
  cashGiven: number | null;
  /** Sukli: what came back. */
  changeReturned: number | null;
  note: string;
  shopperIds: string[];
  createdByName: string | null;
  approvedByName: string | null;
  closedByName: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type TemplateItem = {
  name: string;
  qty: number;
  unit: string;
  pantryItemId: string | null;
};

/** A repeat run: "Weekly palengke", with its usual people, cash and items. */
export type GroceryTemplate = {
  id: string;
  title: string;
  teamId: string | null;
  /** 0 = Sunday ... 6 = Saturday; null when it has no fixed day. */
  weekday: number | null;
  cashDefault: number | null;
  shopperIds: string[];
  items: TemplateItem[];
  /** When a run was last started from it. */
  lastStartedAt: string | null;
};

/** Monthly budgets: the whole house, and per team. Absent = none set. */
export type GroceryBudgets = { house: number | null; byTeam: Record<string, number> };

/** What was bought in a month, by the team of the run it was on. */
export type MonthSpend = {
  total: number;
  byTeam: Record<string, number>;
  /** Bought on a run with no team, or straight from the pool. */
  noTeam: number;
};

/** What the run form edits. */
export type RunDraft = {
  title: string;
  teamId: string | null;
  shopOn: string | null;
  ticketId: string | null;
  note: string;
  cashGiven: number | null;
  shopperIds: string[];
};

export type TemplateDraft = {
  title: string;
  teamId: string | null;
  weekday: number | null;
  cashDefault: number | null;
  shopperIds: string[];
  items: TemplateItem[];
};

export type GroceryReceipt = {
  id: string;
  /** Signed for 15 minutes; refetch rather than store it. */
  url: string;
  thumbUrl: string | null;
  createdAt: string;
  byName: string | null;
  runId: string | null;
};

/** One month of closed runs, for History. */
export type GroceryHistory = {
  runs: (GroceryRun & { items: GroceryItem[]; receipts: GroceryReceipt[] })[];
  /** Bought straight from the pool that month. */
  outside: GroceryItem[];
};

/**
 * The palengke: the Needed pool, the runs made from it, their money, and
 * the repeats, shared by the Pantry page, the Money tab's spend card and
 * the task cards. Staff shop and price lines in LINARA_MOBILE; a manager can
 * do everything here too.
 */
export type GroceryContextValue = {
  /** False until supabase/add-grocery-runs.sql is applied: one list, as before. */
  runsAvailable: boolean;
  /** The pool: not on any run. Unbought, plus anything ticked today (so a mis-tap can be undone), plus pantry-low suggestions. */
  needed: GroceryItem[];
  /** Pool lines still to buy, suggestions included. */
  toBuyCount: number;
  /** Drafts, waiting for approval, and ready to shop. */
  runs: GroceryRun[];
  itemsByRun: Map<string, GroceryItem[]>;
  runForTask: (taskId: string) => GroceryRun | undefined;
  templates: GroceryTemplate[];
  budgets: GroceryBudgets;
  /** This month so far. */
  month: MonthSpend;
  /** This month against the house budget, for the Money tab's card. */
  spent: number;
  budget: number;
  remaining: number;
  /** The active Palengke ticket's uploaded photo, if any (from the board's own tasks). */
  receiptPhoto: string | null;
  /** The latest receipts, any run or none, newest first. */
  receipts: GroceryReceipt[];
  refresh: () => Promise<void>;

  /** Shrinks and uploads a receipt the manager took; rejects on failure. */
  addReceipt: (file: File, runId?: string) => Promise<void>;
  addManual: (name: string, qty: number, unit: string, runId?: string) => void;
  /**
   * Puts a low-stock suggestion on the real list (or straight onto a run),
   * linked to its pantry item so buying it restocks. Rejects on failure.
   */
  addSuggestion: (item: GroceryItem, runId?: string) => Promise<void>;
  /** Fixes a not-yet-bought item's name or amount. */
  edit: (item: GroceryItem, patch: { name: string; qty: number; unit: string }) => void;
  /** Only for a not-yet-bought item: curating the plan, not erasing a purchase. */
  remove: (item: GroceryItem) => void;
  /** Ticks a listed item bought, or unticks it. Not for suggestions. */
  toggleBought: (item: GroceryItem) => void;
  setCost: (item: GroceryItem, cost: number | null) => void;
  /** Onto a run, or back to the pool (null). Rejects on failure. */
  moveItems: (itemIds: string[], runId: string | null) => Promise<void>;

  /** Makes a run (moving `itemIds` onto it) or saves one. Resolves to its id. */
  saveRun: (
    draft: RunDraft,
    opts: { id?: string; itemIds?: string[]; newItems?: TemplateItem[]; send?: boolean },
  ) => Promise<string>;
  /** Moves a run along: approve/send (ready), send back (draft), close (done), cancel. */
  setRunStatus: (
    run: GroceryRun,
    status: RunStatus,
    money?: { cashGiven?: number | null; changeReturned?: number | null },
  ) => Promise<void>;
  deleteRun: (run: GroceryRun) => Promise<void>;

  saveTemplate: (draft: TemplateDraft, id?: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  /** Starts a draft run from a repeat; resolves to the new run's id. */
  startTemplate: (id: string, shopOn: string | null) => Promise<string>;

  /** Sets (or clears, with null) the house's monthly budget or a team's. */
  setBudget: (teamId: string | null, amount: number | null) => Promise<void>;
};
