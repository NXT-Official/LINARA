// Teams and labels: how a household with many staff is organised
// (supabase/add-teams-and-labels.sql, KNOWN_GAPS.md O36).
//
// A team is a department (Kitchen, Grounds, Security). A helper is on at most
// one, and it's what the views group by. A label is anything else worth
// filtering by (Night shift, Trainee); a helper can have any number.

export type LabelTone = "sand" | "pine" | "clay" | "sky" | "sage" | "plum";

export type Team = { id: string; name: string };

export type Label = { id: string; name: string; tone: LabelTone };

/** Which staff to show, and how to arrange them. Shared by every staff view. */
export type StaffScope = {
  query: string;
  /** A team id, NO_TEAM, or null for every team. */
  teamId: string | null;
  /** Show helpers with ALL of these labels. */
  labelIds: string[];
  /** Group by team (when the household has teams), or one flat list. */
  groupBy: "team" | "none";
};
