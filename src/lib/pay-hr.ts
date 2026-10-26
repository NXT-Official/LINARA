/**
 * Staff pay & HR (payslips, paying staff, vale, wage changes, SSS /
 * PhilHealth / Pag-IBIG) is switched off for now while it's brought in line
 * with the law. Records are kept; nothing is deleted. The screens show
 * PAY_HR_DISABLED_MESSAGE instead, the server functions that write pay data
 * refuse, and supabase/add-pay-hr-switch.sql refuses the writes the helper
 * app makes directly. Same switch as ../LINARA_MOBILE/lib/pay-hr.ts; flip both
 * (and the SQL switch) to turn it back on.
 */
export const PAY_HR_ENABLED = false;

export const PAY_HR_DISABLED_MESSAGE =
  "Pay and HR features are temporarily disabled while we make sure they follow the law. Your records are kept.";

/** Called first in every server function that writes pay or HR data. */
export function assertPayHrEnabled(): void {
  if (!PAY_HR_ENABLED) throw new Error(PAY_HR_DISABLED_MESSAGE);
}
