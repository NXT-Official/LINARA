import type { RosaStatus } from "./availability.types";

// Chip styling for each availability state — shared by the manager chip and Rosa's control.

export function statusMeta(s: RosaStatus["status"]) {
  if (s === "on_shift")
    return {
      label: "On shift",
      dot: "bg-[oklch(0.68_0.14_150)]",
      cls: "bg-[oklch(0.95_0.05_150)] text-[oklch(0.32_0.1_150)]",
    };
  if (s === "available")
    return {
      label: "Available",
      dot: "bg-accent",
      cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]",
    };
  return { label: "Off", dot: "bg-muted-foreground/50", cls: "bg-secondary text-muted-foreground" };
}
