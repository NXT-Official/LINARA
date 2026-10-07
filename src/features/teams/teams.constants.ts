import type { LabelTone, StaffScope } from "./teams.types";

/** The team filter's value for helpers on no team. */
export const NO_TEAM = "__none__";

export const EMPTY_SCOPE: StaffScope = { query: "", teamId: null, labelIds: [], groupBy: "team" };

/**
 * Past this many active helpers, staff views offer search, filters and
 * grouping, and long lists start collapsed. Below it a household keeps the
 * simple views it has always had, unless it has made teams.
 */
export const LARGE_STAFF = 8;

/** The order tones are handed out in for a new label, and offered in. */
export const LABEL_TONES: LabelTone[] = ["sand", "pine", "clay", "sky", "sage", "plum"];

/** Tailwind pairs for a label chip. Text is held to 4.5:1 on its own tint. */
export const labelToneClass: Record<LabelTone, string> = {
  sand: "bg-secondary text-pine-deep",
  pine: "bg-primary/10 text-primary",
  clay: "bg-terracotta-soft/70 text-terracotta-ink",
  sky: "bg-[oklch(0.92_0.04_240)] text-[oklch(0.35_0.08_240)]",
  sage: "bg-[oklch(0.92_0.05_140)] text-[oklch(0.35_0.08_140)]",
  plum: "bg-[oklch(0.92_0.04_330)] text-[oklch(0.38_0.09_330)]",
};

/** The swatch shown in the tone picker. */
export const labelToneSwatch: Record<LabelTone, string> = {
  sand: "#E9E1D3",
  pine: "#1F5A54",
  clay: "#E6A98F",
  sky: "#8098B4",
  sage: "#7FA98C",
  plum: "#A57C9C",
};
