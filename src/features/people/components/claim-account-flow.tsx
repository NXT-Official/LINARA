import { AlertCircle, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ReviewRow } from "@/components/shared/detail-row";
import { verifyClaimFn, flagInviteFn, claimInviteFn } from "@/features/people/people.actions";

import type { Invite, Station } from "../people.types";

export function ClaimAccountFlow({
  onClose,
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [flagField, setFlagField] = useState("Shift hours");
  const [flagNote, setFlagNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitCode = async () => {
    if (!codeInput.trim()) return;
    setLoading(true);
    setCodeError(null);
    try {
      const terms = await verifyClaimFn({ data: { inviteCode: codeInput.trim() } });
      const mappedInvite: Invite = {
        id: terms.inviteCode,
        code: terms.inviteCode,
        name: terms.name,
        station: terms.station as Station,
        employment: "live-in", // fallback default
        shift: `${terms.shiftStart} - ${terms.shiftEnd}`,
        restDay:
          ["Linggo", "Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado"][
            terms.weeklyRestDay
          ] || "Sunday",
        wagePHP: terms.monthlyRate,
        phone: "",
        createdAt: Date.now(),
        createdBy: "Manager",
        status: "pending",
        flags: [],
      };
      setInvite(mappedInvite);
      setDisplayName(terms.name);
      setCodeError(null);
      setStep("review");
      toast.success("Nahanap ang iyong invite record!");
    } catch (err) {
      console.error(err);
      setCodeError(
        "Hindi namin nakita 'yang code o may server issue. Paki-check ang code at subukan ulit.",
      );
      toast.error("Hindi nakita ang invite code.");
    } finally {
      setLoading(false);
    }
  };

  const submitFlag = async () => {
    if (!invite) return;
    setLoading(true);
    try {
      await flagInviteFn({
        data: {
          inviteCode: invite.code,
          field: flagField,
          note: flagNote.trim(),
        },
      });
      // Update local mock store as fallback/synergy
      onFlag(invite.id, flagField, flagNote.trim() || undefined);
      setFlagged(true);
      setStep("review");
      toast.success("Dispute sent! Sinabi na namin sa manager mo ang tungkol sa issue.");
    } catch (err) {
      console.error(err);
      toast.error("May error sa pagpapadala ng flag.");
    } finally {
      setLoading(false);
    }
  };

  const submitClaim = async () => {
    if (!invite) return;
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      toast.error("Kumpletuhin muna ang lahat ng detalye.");
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- False positive. Client-side double-entry verification check.
    if (password !== confirmPassword) {
      toast.error("Hindi magkatugma ang passwords.");
      return;
    }
    if (password.length < 6) {
      toast.error("Dapat may kahit anim (6) na characters ang password.");
      return;
    }

    setLoading(true);
    try {
      const result = await claimInviteFn({
        data: {
          inviteCode: invite.code,
          email: email.trim(),
          password,
        },
      });

      // Persist credentials locally
      window.localStorage.setItem("linara_helper_token", result.accessToken);
      window.localStorage.setItem("linara_helper_refresh_token", result.refreshToken);
      window.localStorage.setItem("linara_helper_id", result.helperId);
      window.localStorage.setItem("linara_user_id", result.userId);

      // Trigger client callbacks to sync state
      onClaim(invite.id, displayName.trim());
      onFinished({ ...invite, status: "active", claimedName: displayName.trim() });
      toast.success("Tagumpay! Claimed na ang account mo.");
    } catch (err) {
      console.error(err);
      const errorMessage =
        err instanceof Error ? err.message : "Hindi nagtagumpay ang pag-claim ng account.";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
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
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "code" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              I-enter mo 'yung invite code galing sa employer mo. Halimbawa:{" "}
              <span className="font-mono font-semibold text-foreground">LN98A2</span>.
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
                disabled={loading}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
                placeholder="LN98A2"
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-4 text-center font-mono text-xl tracking-[0.2em] text-foreground outline-none focus:border-primary disabled:opacity-60"
              />
              {codeError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[oklch(0.38_0.09_60)]">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {codeError}
                </p>
              )}
            </div>
            <button
              onClick={submitCode}
              disabled={loading || !codeInput.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                </>
              ) : (
                "Continue"
              )}
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
              <ReviewRow label="Shift hours" value={invite.shift} />
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
              disabled={loading}
              onClick={() => setStep("flag")}
              className="w-full text-left text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-60"
            >
              Something's not right? →
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("code")}
                disabled={loading}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Back
              </button>
              <button
                onClick={() => setStep("setup")}
                disabled={loading}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
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
                disabled={loading}
                value={flagField}
                onChange={(e) => setFlagField(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option>Pangalan</option>
                <option>Role / station</option>
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
                disabled={loading}
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                rows={3}
                placeholder="Hal. Ang usapan namin ay ₱8,500 monthly rate, hindi ₱8,000."
                className="mt-1.5 w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                disabled={loading}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitFlag}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  "Send flag to manager"
                )}
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
                disabled={loading}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="claim-email"
              >
                Your Email Address
              </label>
              <input
                id="claim-email"
                disabled={loading}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hal. rosa@gmail.com"
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-password"
                >
                  Password
                </label>
                <input
                  id="claim-password"
                  disabled={loading}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center text-lg outline-none focus:border-primary disabled:opacity-60"
                />
              </div>
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-password-confirm"
                >
                  Confirm
                </label>
                <input
                  id="claim-password-confirm"
                  disabled={loading}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center text-lg outline-none focus:border-primary disabled:opacity-60"
                />
              </div>
            </div>
            {password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-xs text-[oklch(0.38_0.09_60)]">
                Hindi magkatugma ang password. Paki-check at ulitin.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Ito ay ise-save nang ligtas sa system. Iyong-iyo lang ang password na ito at hindi ito
              nakikita ng manager mo.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                disabled={loading}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Back
              </button>
              <button
                onClick={submitClaim}
                disabled={
                  loading ||
                  !displayName.trim() ||
                  !email.trim() ||
                  password.length < 6 ||
                  password !== confirmPassword
                }
                className="flex-1 flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Locking...
                  </>
                ) : (
                  "Lock & claim account"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
