import { Check, ChevronDown, Home, KeyRound, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { lookupManagerInviteFn } from "../household.actions";
import { adminTypeLabel, managerRoleType } from "../people.constants";
import { clearPendingCode, readPendingCode } from "../pending-invite";

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50";
const quietButton =
  "rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground";

/**
 * Which household you're in, and the others you manage (KNOWN_GAPS O2). One
 * active household per account: picking another moves the account there,
 * and the dashboard reloads for it. Hidden until add-household-managers.sql
 * is applied.
 */
export function HouseholdSwitcher() {
  const { session } = useAppStores();
  const [dialog, setDialog] = useState<"new" | "join" | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  // A code from sign-up, on an account the email already had: join with it
  // here. Joining or cancelling forgets it.
  const [pending, setPending] = useState("");
  useEffect(() => {
    const code = readPendingCode();
    if (!code) return;
    setPending(code);
    setDialog("join");
  }, []);
  const closeJoin = () => {
    clearPendingCode();
    setPending("");
    setDialog(null);
  };
  const join = async (code: string) => {
    await session.joinHousehold(code);
    clearPendingCode();
  };

  if (!session.multiManager || session.households.length === 0) return null;
  const current = session.households.find((h) => h.isCurrent);

  const pick = (id: string) => {
    if (id === current?.id) return;
    setSwitching(id);
    session.switchHousehold(id).catch((err: Error) => {
      setSwitching(null);
      toast.error(err.message);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-9 max-w-[9rem] items-center sm:max-w-[14rem] gap-1.5 rounded-lg border border-border/60 bg-card/80 px-2.5 text-xs font-semibold text-foreground shadow-soft transition hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Household: ${current?.name ?? "choose one"}. Switch household`}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Home className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span className="truncate">{current?.name ?? "Household"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Your households
          </DropdownMenuLabel>
          {session.households.map((h) => (
            <DropdownMenuItem
              key={h.id}
              onSelect={() => pick(h.id)}
              className="flex items-start gap-2"
            >
              <span className="mt-0.5 h-4 w-4 shrink-0">
                {h.isCurrent && <Check className="h-4 w-4 text-primary" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{h.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {adminTypeLabel[managerRoleType[h.role]]}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("new")} className="gap-2">
            <Plus className="h-4 w-4" /> New household
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("join")} className="gap-2">
            <KeyRound className="h-4 w-4" /> Join with a code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "new" && <NewHouseholdModal onClose={() => setDialog(null)} />}
      {dialog === "join" && (
        <Modal onClose={closeJoin}>
          <DialogHeader title="Join a household" onClose={closeJoin} />
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the code its primary manager gave you. You&apos;ll keep your other households.
          </p>
          <JoinHouseholdForm
            token={session.token}
            onJoin={join}
            initialCode={pending}
            onCancel={closeJoin}
          />
        </Modal>
      )}
    </>
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-display text-xl text-foreground">{title}</h3>
      <button
        onClick={onClose}
        aria-label="Close"
        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function NewHouseholdModal({ onClose }: { onClose: () => void }) {
  const { session } = useAppStores();
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = tried && !name.trim() ? "Give it a name." : null;

  const create = () => {
    setTried(true);
    if (!name.trim()) return;
    setBusy(true);
    session.createHousehold(name.trim()).catch((err: Error) => {
      setBusy(false);
      toast.error(err.message);
    });
  };

  return (
    <Modal onClose={onClose}>
      <DialogHeader title="New household" onClose={onClose} />
      <p className="mt-1 text-sm text-muted-foreground">
        A second home, or your parents&apos;. You&apos;ll be its primary manager, and you can switch
        back any time.
      </p>
      <div className="mt-4">
        <Field label="Household name" error={error}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Lola's house"
            aria-invalid={!!error}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={quietButton}>
          Cancel
        </button>
        <button onClick={create} disabled={busy} className={primaryButton}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create household
        </button>
      </div>
    </Modal>
  );
}

/**
 * Join a household with a manager invite code. `askName`: a new account,
 * which has no profile yet, says what to call it. Used inside the dashboard
 * and on the sign-in page's setup screen, which has its own session.
 */
export function JoinHouseholdForm({
  token,
  onJoin,
  askName = false,
  initialCode = "",
  onCancel,
}: {
  token: string | null;
  /** Joins, then reloads into that household. */
  onJoin: (code: string, fullName?: string) => Promise<void>;
  askName?: boolean;
  initialCode?: string;
  onCancel?: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [fullName, setFullName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<
    { householdName: string; role: string; invitedBy: string | null } | "invalid" | null
  >(null);

  const cleaned = code.replace(/\s/g, "").toUpperCase();
  // Look the code up once it's whole, to say where it leads before joining.
  useEffect(() => {
    setPreview(null);
    if (cleaned.length !== 8 || !token) return;
    let cancelled = false;
    lookupManagerInviteFn({ data: { token, code: cleaned } })
      .then((found) => {
        if (cancelled) return;
        setPreview(
          found
            ? {
                householdName: found.householdName,
                role: adminTypeLabel[managerRoleType[found.role]],
                invitedBy: found.invitedBy,
              }
            : "invalid",
        );
      })
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [cleaned, token]);

  const errors = {
    code: tried && cleaned.length !== 8 ? "The code is 8 letters and numbers." : null,
    name: tried && askName && !fullName.trim() ? "Tell us your name." : null,
  };

  const join = () => {
    setTried(true);
    if (cleaned.length !== 8 || (askName && !fullName.trim())) return;
    setBusy(true);
    onJoin(cleaned, askName ? fullName.trim() : undefined).catch((err: Error) => {
      setBusy(false);
      toast.error(err.message);
    });
  };

  return (
    <div className="mt-4 space-y-3">
      {askName && (
        <Field label="Your name" error={errors.name}>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Tina Reyes"
            aria-invalid={!!errors.name}
            className={inputClass}
          />
        </Field>
      )}
      <Field label="Invite code" error={errors.code}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="8 letters and numbers"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!errors.code}
          className={`${inputClass} font-mono uppercase tracking-widest`}
        />
      </Field>
      {preview === "invalid" && (
        <p role="status" className="text-xs font-semibold text-destructive">
          That code isn&apos;t valid any more. Ask for a new one.
        </p>
      )}
      {preview && preview !== "invalid" && (
        <p role="status" className="rounded-xl bg-secondary/60 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold">{preview.householdName}</span>, as {preview.role}
          {preview.invitedBy ? `, from ${preview.invitedBy}` : ""}.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button onClick={onCancel} className={quietButton}>
            Cancel
          </button>
        )}
        <button onClick={join} disabled={busy} className={primaryButton}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Join household
        </button>
      </div>
    </div>
  );
}
