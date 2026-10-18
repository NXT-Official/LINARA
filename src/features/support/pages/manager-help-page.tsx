import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { getPlatformSettingsFn } from "@/features/billing/plan.actions";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { FAQ_FALLBACK } from "@/features/faq/faq-fallback";
import { loadFaqsFn } from "@/features/faq/faq.actions";
import { FaqList } from "@/features/faq/components/faq-list";
import type { Faq } from "@/features/faq/faq.types";

import { NewThreadModal } from "../components/new-thread-modal";
import { ThreadList } from "../components/thread-list";
import { ThreadView } from "../components/thread-view";
import { useSupportThreads } from "../hooks/use-support-threads";

const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECTION = "rounded-3xl border border-border/40 bg-card p-5 shadow-soft sm:p-7";

export function ManagerHelpPage() {
  const { session } = useAppStores();
  const token = session.token;
  const householdId = session.householdId;
  const ready = Boolean(token && householdId);

  const [faqs, setFaqs] = useState<Faq[]>(FAQ_FALLBACK);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const { status, threads, refresh, retry } = useSupportThreads({
    token,
    scope: "household",
    householdId,
    ready,
  });

  useEffect(() => {
    let live = true;
    loadFaqsFn({ data: {} })
      .then((reply) => {
        if (live) setFaqs(reply.faqs);
      })
      .catch(() => {
        // The checked-in answers are already showing.
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "unavailable" || !token) return;
    let live = true;
    getPlatformSettingsFn({ data: { token } })
      .then((reply) => {
        if (live) setSupportEmail(reply.settings?.supportEmail ?? null);
      })
      .catch(() => {
        // Without the address the copy says "email us".
      });
    return () => {
      live = false;
    };
  }, [status, token]);

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">Help</h1>

      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-foreground">Answers</h2>
        <FaqList faqs={faqs} contactHref="#message-us" />
      </div>

      <section id="message-us" className={SECTION} aria-labelledby="message-us-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="message-us-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Message us
          </h2>
          {status === "ready" && ready && (
            <button className={PRIMARY} onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New message
            </button>
          )}
        </div>

        {!ready && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Loading your messages
          </p>
        )}
        {ready && status === "loading" && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Loading your messages
          </p>
        )}
        {status === "error" && (
          <div role="alert" className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Your messages didn't load.</p>
            <button className={`${PRIMARY} mt-3`} onClick={() => void retry()}>
              Try again
            </button>
          </div>
        )}
        {status === "unavailable" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {`Support chat isn't switched on yet; email ${supportEmail ?? "us"}`}
          </p>
        )}
        {status === "ready" && threads.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-display text-base font-semibold text-foreground">No messages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask us anything about Linara and we'll reply here.
            </p>
          </div>
        )}
        {status === "ready" && threads.length > 0 && (
          <div className="mt-2">
            <ThreadList
              threads={threads}
              me="household"
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        )}
      </section>

      {selected && token && (
        <ThreadView
          key={selected.id}
          token={token}
          thread={selected}
          me="household"
          onChanged={() => void refresh()}
        />
      )}

      {composing && token && householdId && (
        <NewThreadModal
          token={token}
          householdId={householdId}
          onClose={() => setComposing(false)}
          onOpened={(id) => {
            if (id) setSelectedId(id);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
