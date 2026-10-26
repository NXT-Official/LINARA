import { canAdd, type AddCheck } from "../plan.logic";
import { usePlan } from "../plan.store";
import type { LimitKey } from "../plan.types";
import { usePlanUsage } from "./use-plan-usage";

/** Whether one more household, kasambahay or co-manager fits the plan. */
export function useCanAdd(key: LimitKey): AddCheck {
  const { subscription } = usePlan();
  const usage = usePlanUsage();
  return canAdd(subscription, usage, key);
}
