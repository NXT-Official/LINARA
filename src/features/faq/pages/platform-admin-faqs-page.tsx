import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { Switch } from "@/components/ui/switch";
import { usePlatformAdminSession } from "@/features/platform-admin/hooks/use-platform-admin-session";

import { deleteFaqFn, listAllFaqsFn, saveFaqFn } from "../faq.actions";
import type { Faq, FaqDraft } from "../faq.types";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "unavailable" }
  | { state: "ready"; faqs: Faq[] };

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5";
const DANGER =
  "inline-flex items-center justify-center rounded-xl bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50";

const BLANK: FaqDraft = {
  question: "",
  answer: "",
  category: "General",
  sortOrder: 0,
  published: false,
};

export function PlatformAdminFaqsPage() {
  const { token } = usePlatformAdminSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [editing, setEditing] = useState<FaqDraft | null>(null);
  const [deleting, setDeleting] = useState<Faq | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoad({ state: "loading" });
    try {
      const reply = await listAllFaqsFn({ data: { token } });
      setLoad(reply.available ? { state: "ready", faqs: reply.faqs } : { state: "unavailable" });
    } catch {
      setLoad({ state: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">FAQs</h1>
        {load.state === "ready" && (
          <button className={PRIMARY} onClick={() => setEditing({ ...BLANK })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add FAQ
          </button>
        )}
      </div>

      {load.state === "loading" && (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Loading FAQs
        </p>
      )}

      {load.state === "error" && (
        <section
          role="alert"
          className="rounded-3xl border border-border/40 bg-card p-6 text-center"
        >
          <p className="text-sm text-muted-foreground">The FAQs didn't load.</p>
          <button className={`${PRIMARY} mt-4`} onClick={() => void refresh()}>
            Try again
          </button>
        </section>
      )}

      {load.state === "unavailable" && (
        <section className="rounded-3xl border border-border/40 bg-card p-6 text-center">
          <h2 className="font-display text-lg text-foreground">
            Admin tools aren't switched on yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The FAQ table hasn't been set up. Until it is, the public page shows the built-in
            answers.
          </p>
        </section>
      )}

      {load.state === "ready" && load.faqs.length === 0 && (
        <section className="rounded-3xl border border-border/40 bg-card p-6 text-center">
          <h2 className="font-display text-lg text-foreground">No FAQs yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Until you publish one, the public page shows the built-in answers.
          </p>
        </section>
      )}

      {load.state === "ready" && load.faqs.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-3xl border border-border/40 bg-card px-5 shadow-soft">
          {load.faqs.map((faq) => (
            <li key={faq.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{faq.question}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {faq.category} · order {faq.sortOrder}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                  faq.published
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {faq.published ? "Published" : "Draft"}
              </span>
              <div className="flex gap-2">
                <button className={SECONDARY} onClick={() => setEditing(faq)}>
                  Edit
                </button>
                <button className={SECONDARY} onClick={() => setDeleting(faq)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && token && (
        <FaqEditor
          draft={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {deleting && token && (
        <DeleteConfirm
          faq={deleting}
          token={token}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function FaqEditor({
  draft,
  token,
  onClose,
  onSaved,
}: {
  draft: FaqDraft;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FaqDraft>(draft);
  const [order, setOrder] = useState(String(draft.sortOrder));
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionError = tried && !form.question.trim() ? "Write the question" : null;
  const answerError = tried && !form.answer.trim() ? "Write the answer" : null;
  const categoryError = tried && !form.category.trim() ? "Give it a category" : null;

  async function save() {
    setTried(true);
    setError(null);
    if (!form.question.trim() || !form.answer.trim() || !form.category.trim()) return;
    setSaving(true);
    try {
      const reply = await saveFaqFn({
        data: { token, faq: { ...form, sortOrder: Number(order) || 0 } },
      });
      if (!reply.available) {
        setError("Admin tools aren't switched on yet.");
        return;
      }
      toast.success(form.id ? "FAQ updated" : "FAQ added");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the FAQ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">{form.id ? "Edit FAQ" : "Add FAQ"}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Question" error={questionError}>
          <input
            value={form.question}
            maxLength={200}
            aria-invalid={questionError ? true : undefined}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            className={INPUT}
          />
        </Field>
        <Field label="Answer" error={answerError}>
          <textarea
            value={form.answer}
            maxLength={4000}
            rows={5}
            aria-invalid={answerError ? true : undefined}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            className={INPUT}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" error={categoryError}>
            <input
              value={form.category}
              maxLength={40}
              aria-invalid={categoryError ? true : undefined}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={INPUT}
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={order}
              onChange={(e) => setOrder(e.target.value.replace(/[^\d-]/g, ""))}
              className={INPUT}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-3 py-2.5">
          <span id="faq-published" className="text-sm text-foreground">
            Published on the public page
          </span>
          <Switch
            aria-labelledby="faq-published"
            checked={form.published}
            onCheckedChange={(published) => setForm({ ...form, published })}
          />
        </div>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={SECONDARY} onClick={onClose}>
          Cancel
        </button>
        <button className={PRIMARY} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteConfirm({
  faq,
  token,
  onClose,
  onDeleted,
}: {
  faq: Faq;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const reply = await deleteFaqFn({ data: { token, id: faq.id } });
      if (!reply.available) {
        setError("Admin tools aren't switched on yet.");
        return;
      }
      toast.success("FAQ deleted");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the FAQ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl text-foreground">Delete this FAQ?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        &ldquo;{faq.question}&rdquo; will be removed from the public page. This can't be undone.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className={SECONDARY} onClick={onClose}>
          Keep it
        </button>
        <button className={DANGER} disabled={busy} onClick={() => void remove()}>
          {busy ? "Deleting" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
