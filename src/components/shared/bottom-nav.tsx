import type { ClipboardList } from "lucide-react";

export function BottomNav({
  items,
  active,
  onChange,
}: {
  items: Array<{ key: string; label: string; Icon: typeof ClipboardList }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-around px-2 sm:px-6">
        {items.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
