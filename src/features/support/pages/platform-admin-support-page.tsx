import { useState } from "react";

import { usePlatformAdminSession } from "@/features/platform-admin/hooks/use-platform-admin-session";

import { ThreadList } from "../components/thread-list";
import { ThreadView } from "../components/thread-view";
import { useSupportThreads } from "../hooks/use-support-threads";

const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECTION = "rounded-3xl border border-border/40 bg-card p-5 shadow-soft sm:p-7";

export function PlatformAdminSupportPage() {
  const { token } = usePlatformAdminSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { status, threads, refresh, retry } = useSupportThreads({
    token,
    scope: "platform_admin",
    ready: Boolean(token),
  });
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">Support</h1>

      <section className={SECTION}>
        {status === "loading" && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Loading the inbox
          </p>
        )}
        {status === "error" && (
          <div role="alert" className="py-6 text-center">
            <p className="text-sm text-muted-foreground">The inbox didn't load.</p>
            <button className={`${PRIMARY} mt-3`} onClick={() => void retry()}>
              Try again
            </button>
          </div>
        )}
        {status === "unavailable" && (
          <div className="py-6 text-center">
            <h2 className="font-display text-lg text-foreground">
              Support chat isn't switched on yet
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Apply supabase/add-support-chat.sql, then reload.
            </p>
          </div>
        )}
        {status === "ready" && threads.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-display text-base font-semibold text-foreground">
              The inbox is empty
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Messages from households show up here as they arrive.
            </p>
          </div>
        )}
        {status === "ready" && threads.length > 0 && (
          <ThreadList
            threads={threads}
            me="platform_admin"
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </section>

      {selected && token && (
        <ThreadView
          key={selected.id}
          token={token}
          thread={selected}
          me="platform_admin"
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
