import type { Plan } from "./plan.types";

export type PublicPlans = { available: boolean; plans: Plan[] };

/**
 * The /pricing loader. A visitor must always get a page: any failure (network,
 * RLS, a 5xx) reads as "no plans published", which renders "Pricing is by
 * conversation for now." instead of the error screen.
 */
export async function loadPublicPlans(
  fetchPlans: () => Promise<PublicPlans>,
): Promise<PublicPlans> {
  try {
    const res = await fetchPlans();
    return Array.isArray(res?.plans) ? res : { available: false, plans: [] };
  } catch {
    return { available: false, plans: [] };
  }
}
