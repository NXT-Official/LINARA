import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

// --------------------------------------------------------------------------
// Grocery list (`grocery_items`) -- closes the "spend dial reads real data"
// half of KNOWN_GAPS.md gap #2. Entering actual cost and attaching a receipt
// are LINARA_MOBILE's job (it writes grocery_items and
// tickets.photo_evidence_url for real). From the web a manager curates the
// list (add/fix/remove planned items) and can tick an item bought, for when
// she did the shopping herself: the palengke is shared work (client
// feedback, 2026-10-02), and QA found no way to tick one here.
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
 * Always inserts unbought/uncosted; only LINARA_MOBILE ever sets those.
 * `pantryItemId` links it to the low pantry item it restocks. */
export const insertGroceryItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; name: string; qty: number; unit: string; pantryItemId?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const { token, name, qty, unit, pantryItemId } = data;

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
      .insert({
        household_id: profile.household_id,
        name,
        qty,
        unit,
        pantry_item_id: pantryItemId ?? null,
        bought: false,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to add grocery item");
    }

    return { id: row.id as string };
  });

/** Fixes a planned item's name or amount. The UI only offers it before it's bought. */
export const updateGroceryItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; itemId: string; name: string; qty: number; unit: string }) => data,
  )
  .handler(async ({ data }) => {
    const { token, itemId, name, qty, unit } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("grocery_items")
      .update({ name, qty, unit })
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId };
  });

/**
 * Ticks an item bought, or unticks a mis-tap. Same write as LINARA_MOBILE's
 * setGroceryItemBought: unticking clears the cost, and the database's
 * grocery_restock_pantry trigger moves the linked pantry count either way.
 */
export const setGroceryItemBoughtFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; bought: boolean }) => data)
  .handler(async ({ data }) => {
    const { token, itemId, bought } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("grocery_items")
      .update(bought ? { bought } : { bought, actual_cost: null })
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId, bought };
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

    // A remote admin too: plan.md 1.2, "usually the funding source"
    // (supabase/add-household-managers.sql lets the database agree).
    if (!["primary_manager", "co_manager", "remote_admin"].includes(profile.user_type)) {
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

export type GroceryReceiptRow = {
  id: string;
  /** Signed for 15 minutes; refetch rather than store it. */
  url: string;
  createdAt: string;
  byName: string | null;
};

/**
 * The household's latest palengke receipts (supabase/add-grocery-receipts.sql),
 * each with a fresh signed URL. Empty before that migration is applied.
 */
export const listGroceryReceiptsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<GroceryReceiptRow[]> => {
    const authedClient = createAuthedClient(data.token);
    const { data: rows, error } = await authedClient
      .from("grocery_receipts")
      .select("id, storage_path, created_at, uploaded_by_profile:user_profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(6);

    // 42P01 / PGRST205: the table isn't there yet.
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) throw new Error(error.message);

    const signed = await Promise.all(
      (rows ?? []).map(async (row) => {
        const { data: link } = await authedClient.storage
          .from("household-evidence")
          .createSignedUrl(row.storage_path as string, 900);
        const profile = row.uploaded_by_profile as unknown as { full_name: string } | null;
        return link
          ? {
              id: row.id as string,
              url: link.signedUrl,
              createdAt: row.created_at as string,
              byName: profile?.full_name ?? null,
            }
          : null;
      }),
    );
    return signed.filter((r): r is GroceryReceiptRow => r !== null);
  });
