import { AlertCircle, X } from "lucide-react";
import { useState } from "react";

import { ReviewRow } from "@/components/shared/detail-row";

import type { Invite } from "../people.types";

export function ClaimAccountFlow({
  onClose,
  onFindInvite,
  onClaim,
  onFlag,
  onFinished,
}: {
  onClose: () => void;
  onFindInvite: (code: string) => Invite | null;
  onClaim: (id: string, claimedName: string) => void;
  onFlag: (id: string, field: string, note?: string) => void;
  onFinished: (inv: Invite) => void;
}) {
  const [step, setStep] = useState<"code" | "review" | "setup" | "flag">("code");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [flagField, setFlagField] = useState("Shift hours");
  const [flagNote, setFlagNote] = useState("");
  const [flagged, setFlagged] = useState(false);

  const submitCode = () => {
    const found = onFindInvite(codeInput);
    if (!found) {
      setCodeError("Hindi namin nakita 'yang code. Check the letters and numbers, tapos try ulit.");
      return;
    }
    setInvite(found);
    setDisplayName(found.name);
    setCodeError(null);
    setStep("review");
  };

  const submitClaim = () => {
    if (!invite) return;
    if (!displayName.trim()) return;
    if (pin.length < 4 || pin !== pin2) return;
    onClaim(invite.id, displayName.trim());
    onFinished({ ...invite, status: "active", claimedName: displayName.trim() });
  };

  const submitFlag = () => {
    if (!invite) return;
    onFlag(invite.id, flagField, flagNote.trim() || undefined);
    setFlagged(true);
    setStep("review");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {step === "code"
                ? "Step 1 of 3"
                : step === "review"
                  ? "Step 2 of 3"
                  : step === "setup"
                    ? "Step 3 of 3"
                    : "Flag a detail"}
            </div>
            <h3 className="mt-1 font-display text-2xl leading-tight text-foreground">
              {step === "code" && "Claim your account"}
              {step === "review" && "Tingnan mo muna — ito ba ang usapan?"}
              {step === "setup" && "This account is yours."}
              {step === "flag" && "Something's not right?"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "code" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              I-enter mo 'yung invite code galing sa employer mo. Mukhang{" "}
              <span className="font-mono font-semibold text-foreground">LINARA-1234</span>.
            </p>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="claim-code"
              >
                Invite code
              </label>
              <input
                id="claim-code"
                autoFocus
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
                placeholder="LINARA-1234"
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-4 text-center font-mono text-xl tracking-[0.2em] text-foreground outline-none focus:border-primary"
              />
              {codeError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[oklch(0.38_0.09_60)]">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {codeError}
                </p>
              )}
            </div>
            <button
              onClick={submitCode}
              disabled={!codeInput.trim()}
              className="w-full rounded-full bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === "review" && invite && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ito 'yung inilagay ng employer mo sa household record. Basahin muna — hindi ka
              pumapasok sa black box.
            </p>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-4 text-sm">
              <ReviewRow label="Pangalan" value={invite.name} />
              <ReviewRow label="Role / station" value={invite.station} />
              <ReviewRow
                label="Employment"
                value={invite.employment === "live-in" ? "Live-in" : "Live-out"}
              />
              <ReviewRow label="Shift" value={invite.shift} />
              <ReviewRow label="Rest day" value={invite.restDay} />
              <ReviewRow label="Monthly wage" value={`₱${invite.wagePHP.toLocaleString()}`} />
            </div>
            {flagged && (
              <div className="flex items-start gap-2 rounded-2xl border border-terracotta/50 bg-terracotta-soft/40 px-3 py-2.5 text-xs text-[oklch(0.38_0.09_60)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Salamat — sinabi na namin sa manager mo. Pwede ka pa ring mag-continue, o
                  mag-antay muna ng ayos.
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep("flag")}
              className="w-full text-left text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Something's not right? →
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("code")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={() => setStep("setup")}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
              >
                Looks right — continue
              </button>
            </div>
          </div>
        )}

        {step === "flag" && invite && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Alin ang mali? Sabihin mo lang — ipapaalam namin sa manager. Hindi mo pa kailangang
              pumirma.
            </p>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="flag-field"
              >
                Which detail?
              </label>
              <select
                id="flag-field"
                value={flagField}
                onChange={(e) => setFlagField(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary"
              >
                <option>Pangalan</option>
                <option>Role / station</option>
                <option>Employment</option>
                <option>Shift hours</option>
                <option>Rest day</option>
                <option>Monthly wage</option>
                <option>Iba pa</option>
              </select>
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="flag-note"
              >
                Note (optional)
              </label>
              <textarea
                id="flag-note"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                rows={3}
                placeholder="e.g. Ang usapan namin ay 7 AM – 6 PM, hindi 6 AM – 7 PM."
                className="mt-1.5 w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={submitFlag}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
              >
                Send flag to manager
              </button>
            </div>
          </div>
        )}

        {step === "setup" && invite && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
              This account is <span className="font-semibold text-primary">yours</span>. Your record
              stays with you, even if you change households.
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="claim-name"
              >
                Your name (paano mo gustong tawagin)
              </label>
              <input
                id="claim-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-pin"
                >
                  4-digit PIN
                </label>
                <input
                  id="claim-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                />
              </div>
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-pin2"
                >
                  Ulitin
                </label>
                <input
                  id="claim-pin2"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                />
              </div>
            </div>
            {pin.length >= 4 && pin !== pin2 && pin2.length >= pin.length && (
              <p className="text-xs text-[oklch(0.38_0.09_60)]">
                Hindi magkatugma 'yung PIN. Try again.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              PIN lang muna para sa prototype — hindi ito ipinapadala kahit kanino.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={submitClaim}
                disabled={!displayName.trim() || pin.length < 4 || pin !== pin2}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
              >
                Claim my account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
