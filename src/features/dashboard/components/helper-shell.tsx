import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { RosaAvailControl } from "@/features/availability/components/rosa-avail-control";
import { ClaimAccountFlow } from "@/features/people/components/claim-account-flow";
import { ClaimedWelcome } from "@/features/people/components/claimed-welcome";
import type { Invite } from "@/features/people/people.types";

import { useAppStores } from "../app-store-context";
import { HELPER_NAV } from "../nav.constants";

/**
 * The helper's station: her greeting, availability control, and the claim-your-
 * account banner sit above every one of her pages.
 */
export function HelperShell({ children }: { children: ReactNode }) {
  const { helper, availability, invites } = useAppStores();
  const navigate = useNavigate();
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimedInfo, setClaimedInfo] = useState<Invite | null>(null);
  const myClaimed = invites.invites.find((i) => i.status === "active");

  if (!helper) {
    return (
      <div className="space-y-5 pb-24">
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          No active helper account yet — claim an invite to see your station.
        </div>
        {children}
        <BottomNav items={HELPER_NAV} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <section className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift sm:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
          {helper.name}&apos;s Station
        </div>
        <h1 className="mt-2 font-display text-[26px] leading-tight sm:text-3xl">
          Magandang umaga, {helper.name}.
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-primary-foreground/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Today's shift
            </div>
            <div className="mt-0.5 font-semibold">{helper.shift}</div>
          </div>
          <div className="rounded-2xl bg-primary-foreground/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Rest day
            </div>
            <div className="mt-0.5 font-semibold">{helper.restDay}</div>
          </div>
        </div>
        <RosaAvailControl
          status={availability.status}
          onAvailable={availability.setAvailable}
          onOff={availability.setOff}
        />
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-terracotta/50 bg-terracotta-soft/25 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {myClaimed
              ? `Account claimed — welcome, ${myClaimed.claimedName}`
              : "New here? Claim your account."}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {myClaimed
              ? "Your record stays with you, even if you change households."
              : "Enter the invite code your employer gave you. Your account will be yours."}
          </p>
        </div>
        {!myClaimed && (
          <button
            onClick={() => setClaimOpen(true)}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Enter code
          </button>
        )}
      </div>

      {children}

      {claimOpen && (
        <ClaimAccountFlow
          onClose={() => setClaimOpen(false)}
          onFindInvite={invites.findByCode}
          onClaim={invites.claim}
          onFlag={invites.flag}
          onFinished={(inv) => {
            setClaimOpen(false);
            setClaimedInfo(inv);
            navigate({ to: "/helper/today" });
          }}
        />
      )}
      {claimedInfo && <ClaimedWelcome invite={claimedInfo} onClose={() => setClaimedInfo(null)} />}

      <BottomNav items={HELPER_NAV} />
    </div>
  );
}
