// Rosa's live reachability, derived from her schedule, quiet hours, and manual opt-in.

export type RosaStatus = {
  status: "on_shift" | "available" | "off";
  until: number | null;
  quiet: boolean;
  restDay: boolean;
};
