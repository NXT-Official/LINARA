import { Link } from "@tanstack/react-router";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { DELETION_WINDOW_DAYS } from "@/features/legal/legal.constants";

import {
  cancelAccountDeletionFn,
  getAccountDeletionFn,
  requestAccountDeletionFn,
  type AccountDeletionRequest,
} from "../people.actions";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

/**
 * The manager's own account: where the privacy policy lives, and the
 * in-app deletion request both app stores require (KNOWN_GAPS.md O8). A
 * request is carried out by hand within 30 days
 * (supabase/add-account-deletion.sql), so this records it and shows it can
 * still be withdrawn.
 */
export function AccountSection({
  token,
  activeHelperCount,
}: {
  token: string | null;
  activeHelperCount: number;
}) {
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getAccountDeletionFn({ data: { token } })
      .then((r) => !cancelled && setRequest(r))
      .catch((err) => console.error("[AccountSection] Failed to load deletion status:", err));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cancel = async () => {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelAccountDeletionFn({ data: { token } });
      setRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't withdraw the request.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6">
      <h2 className="font-display text-xl text-foreground">Your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How Linara handles your household&rsquo;s data is in the{" "}
        <Link to="/privacy" className="font-semibold text-primary underline">
          privacy policy
        </Link>{" "}
        and{" "}
        <Link to="/terms" className="font-semibold text-primary underline">
          terms
        </Link>
        .
      </p>

      {request ? (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-4 py-3 text-sm">
          <p className="text-foreground">
            You asked for this account to be deleted on {longDate(request.requestedAt)}. It will be
            done within {DELETION_WINDOW_DAYS} days of that. Until then everything works as usual.
          </p>
          <button
            onClick={cancel}
            disabled={cancelling}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Keep my account
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAsking(true)}
          disabled={!token}
          className="mt-4 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60"
        >
          Delete my account
        </button>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {asking && token && (
        <DeleteAccountModal
          token={token}
          activeHelperCount={activeHelperCount}
          onClose={() => setAsking(false)}
          onRequested={(r) => {
            setRequest(r);
            setAsking(false);
          }}
        />
      )}
    </section>
  );
}

function DeleteAccountModal({
  token,
  activeHelperCount,
  onClose,
  onRequested,
}: {
  token: string;
  activeHelperCount: number;
  onClose: () => void;
  onRequested: (request: AccountDeletionRequest) => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onRequested(
        await requestAccountDeletionFn({ data: { token, note: note.trim() || undefined } }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the request.");
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">Delete your account?</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3 text-sm text-foreground">
        <p>
          We&rsquo;ll delete it within {DELETION_WINDOW_DAYS} days, and you can change your mind
          until then. If you&rsquo;re the household&rsquo;s only manager, its appointments,
          procedures, pantry and grocery lists go too.
        </p>
        <p className="text-muted-foreground">
          The household&rsquo;s employment records (payslips, hours, leave and vales) stay for at
          least three years, as labor law requires. Your helpers can still see and download theirs.
        </p>
        {activeHelperCount > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            <span>
              {activeHelperCount === 1
                ? "Someone still works for this household."
                : `${activeHelperCount} people still work for this household.`}{" "}
              End each employment on People first, with final pay, or the deletion will wait until
              you do.
            </span>
          </p>
        )}
        <Field label="Anything we should know? (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        {error && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Ask to delete my account
        </button>
      </div>
    </Modal>
  );
}
