import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";

import { openThreadFn } from "../support.actions";

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

export function NewThreadModal({
  token,
  householdId,
  onClose,
  onOpened,
}: {
  token: string;
  householdId: string;
  onClose: () => void;
  onOpened: (threadId: string | null) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim() === "" || body.trim() === "") {
      setError("Add a subject and a message.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await openThreadFn({
        data: { token, householdId, subject: subject.trim(), body: body.trim() },
      });
      if (!reply.available) {
        setError("Support chat isn't switched on yet.");
        return;
      }
      toast.success("Message sent");
      onOpened(reply.threadId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your message");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">New message</h2>
        <Field label="Subject">
          <input
            className={INPUT}
            value={subject}
            maxLength={120}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={error !== null && subject.trim() === ""}
          />
        </Field>
        <Field label="Message" error={error}>
          <textarea
            className={`${INPUT} min-h-28 resize-y`}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={error !== null && body.trim() === ""}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </Modal>
  );
}
