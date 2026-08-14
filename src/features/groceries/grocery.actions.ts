import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

// --------------------------------------------------------------------------
// Grocery list (`grocery_items`) -- closes the "spend dial reads real data"
// half of KNOWN_GAPS.md gap #2. Execution actions (marking bought, entering
// actual cost, attaching a receipt) are deliberately NOT here -- that's
// LINARA_MOBILE's job (it already writes grocery_items for real, and
// receipts for real onto tickets.photo_evidence_url), not this app's. This
// file only supports what a manager legitimately does from the web app:
// curate the list (add/remove planned items) and read real state.
// --------------------------------------------------------------------------

export interface GroceryItemRow {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pantry_item_id: string | null;
  bought: boolean;
  actual_cost: number | null;
  created_at: string;
}

/** Lists every grocery item in the caller's household -- both planned
 * (bought: false) and what a mobile helper has actually purchased so far
 * (bought: true, actual_cost set). */
export const listGroceryItemsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("grocery_items")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as GroceryItemRow[];
  });

/** Adds a planned item to the list -- list curation, not shopping execution.
 * Always inserts unbought/uncosted; only LINARA_MOBILE ever sets those. */
export const insertGroceryItemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string; qty: number; unit: string }) => data)
  .handler(async ({ data }) => {
    const { token, name, qty, unit } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    const { data: row, error } = await authedClient
      .from("grocery_items")
      .insert({ household_id: profile.household_id, name, qty, unit, bought: false })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to add grocery item");
    }

    return { id: row.id as string };
  });

/** Removes a planned item. The web UI only ever calls this for `!bought`
 * items -- a manager curating the list, not erasing a helper's completed
 * purchase history. */
export const deleteGroceryItemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string }) => data)
  .handler(async ({ data }) => {
    const { token, itemId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("grocery_items").delete().eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId };
  });

// --------------------------------------------------------------------------
// Petty-cash budget (`households.petty_cash_budget`) -- the other half of
// gap #2. One household-level default, manager-writable from here, read by
// both apps. See supabase/add-household-petty-cash-budget.sql.
// --------------------------------------------------------------------------

/** Reads the caller's household's current petty-cash allocation. */
export const getHouseholdBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    const { data: household, error } = await authedClient
      .from("households")
      .select("petty_cash_budget")
      .eq("id", profile.household_id)
      .single();

    if (error || !household) {
      throw new Error(error?.message || "Failed to load household budget");
    }

    return { budget: Number(household.petty_cash_budget) };
  });

/** Sets the household's petty-cash allocation. Manager-only -- same role
 * check pattern as insertHouseSopFn/decideValeFn, since `households`' RLS
 * policy is household-scoped only (see the migration's comment for why a
 * plain policy is safe here, unlike household creation). */
export const updateHouseholdBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; budget: number }) => data)
  .handler(async ({ data }) => {
    const { token, budget } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id, user_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can set the petty-cash budget");
    }

    const { error } = await authedClient
      .from("households")
      .update({ petty_cash_budget: budget })
      .eq("id", profile.household_id);

    if (error) {
      throw new Error(error.message);
    }

    return { budget };
  });
