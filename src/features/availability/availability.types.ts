// Rosa's live reachability, derived from her schedule, quiet hours, and manual opt-in.

export type RosaStatus = {
  status: "on_shift" | "available" | "off";
  until: number | null;
  quiet: boolean;
  restDay: boolean;
};

/** An active manual opt-in -- absence (null) means no override, not "off"
 * as a value, matching the DB's NULL/NULL default. */
export type ManualAvailability = {
  availableUntil: number;
};
