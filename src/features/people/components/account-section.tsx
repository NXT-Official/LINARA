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
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

/**
 * The manager's own account: where the privacy policy lives, and the
 * in-app deletion request both app stores require (KNOWN_GAPS.md O8). A
 * request is carried out by hand within 30 days
 * (supabase/add-account-deletion.sql), so this records it and shows it can
 * still be withdrawn.
 *
 * Kept out of the way on purpose (client feedback, 2026-10-02): the button
 * sits behind "Account settings", and the request needs the manager's full
 * name typed out.
 */
export function AccountSection({
  token,
  activeHelperCount,
  confirmName,
}: {
  token: string | null;
  activeHelperCount: number;
  /** What they type to confirm. Empty falls back to "delete my account". */
  confirmName: string;
}) {
  const t = useT();
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
      <h2 className="font-display text-xl text-foreground">{t("people.yourAccount")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {richText(t("people.howLinaraHandlesYourHousehold"), {
          el1: (
            <Link to="/privacy" className="font-semibold text-primary underline">
              {t("people.privacyPolicy")}
            </Link>
          ),
          el2: (
            <Link to="/terms" className="font-semibold text-primary underline">
              {t("people.terms")}
            </Link>
          ),
        })}
      </p>

      {request ? (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-4 py-3 text-sm">
          <p className="text-foreground">
            {richText(t("people.youAskedForThisAccount"), {
              value: longDate(request.requestedAt),
              deletionWindowDays: DELETION_WINDOW_DAYS,
            })}
          </p>
          <button
            onClick={cancel}
            disabled={cancelling}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {richText(t("people.keepMyAccount"), {
              value: cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />,
            })}
          </button>
        </div>
      ) : (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            {richText(t("people.accountSettings"), {
              span: <span className="ml-1 inline-block transition group-open:rotate-90">›</span>,
            })}
          </summary>
          <div className="mt-3 rounded-2xl border border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t("people.deletingYourAccountRemovesYour")}
            </p>
            <button
              onClick={() => setAsking(true)}
              disabled={!token}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-destructive/40 px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60"
            >
              {t("people.deleteMyAccount")}
            </button>
          </div>
        </details>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {asking && token && (
        <DeleteAccountModal
          token={token}
          activeHelperCount={activeHelperCount}
          confirmName={confirmName}
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

/** Case and spacing don't count, so "maria  santos" matches "Maria Santos". */
const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function DeleteAccountModal({
  token,
  activeHelperCount,
  confirmName,
  onClose,
  onRequested,
}: {
  token: string;
  activeHelperCount: number;
  confirmName: string;
  onClose: () => void;
  onRequested: (request: AccountDeletionRequest) => void;
}) {
  const t = useT();
  const phrase = confirmName.trim() || "delete my account";
  const [typed, setTyped] = useState("");
  const confirmed = normalize(typed) === normalize(phrase);
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
        <h3 className="font-display text-xl text-foreground">{t("people.deleteYourAccount")}</h3>
        <button
          onClick={onClose}
          aria-label={t("people.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3 text-sm text-foreground">
        <p>
          {richText(t("people.weLlDeleteItWithin"), { deletionWindowDays: DELETION_WINDOW_DAYS })}
        </p>
        <p className="text-muted-foreground">{t("people.theHouseholdSEmploymentRecords")}</p>
        {activeHelperCount > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            <span>{t("people.stillWorksForHousehold", { count: activeHelperCount })}</span>
          </p>
        )}
        <Field
          label={
            confirmName.trim()
              ? t("people.typeFullNameToConfirm", { phrase })
              : t("people.typeThisToConfirm", { phrase })
          }
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={typed.length > 0 && !confirmed}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label={t("people.anythingWeShouldKnowOptional")}>
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
          {t("people.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={submitting || !confirmed}
          className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50"
        >
          {richText(t("people.askToDeleteMyAccount"), {
            value: submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          })}
        </button>
      </div>
    </Modal>
  );
}
