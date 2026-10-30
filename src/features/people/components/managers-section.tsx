import { Check, KeyRound, Link2, Loader2, LogOut, Plus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/shared/avatar";
import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { LimitNotice } from "@/features/plan/components/plan-gate";
import { useCanAdd } from "@/features/plan/hooks/use-can-add";
import { hasFeature } from "@/features/plan/plan.logic";
import { usePlan } from "@/features/plan/plan.store";

import {
  createManagerInviteFn,
  listManagerInvitesFn,
  revokeManagerInviteFn,
} from "../household.actions";
import { adminPermSummary, adminTypeLabel, managerRoleType } from "../people.constants";
import type { Admin, ManagerInvite, ManagerRole } from "../people.types";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

type InviteRole = Exclude<ManagerRole, "primary_manager">;
const MANAGER_ROLES: readonly InviteRole[] = ["co_manager", "remote_admin"] as const;

const roleBadge: Record<Admin["type"], string> = {
  primary: "bg-primary/10 text-primary",
  co: "bg-secondary text-pine-deep",
  remote: "bg-terracotta-soft/60 text-accent-foreground",
};

const whenExpires = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

/**
 * Who manages the household (KNOWN_GAPS O2). The primary manager invites
 * co-managers and remote admins with a code, changes roles, hands over
 * primary and removes people; anyone else can leave. The database enforces
 * all of it (add-household-managers.sql); this only offers what's allowed.
 */
export function ManagersSection() {
  const t = useT();
  const { session } = useAppStores();
  const { admins, currentAdmin, multiManager, token } = session;
  const isPrimary = session.adminType === "primary";
  const [invites, setInvites] = useState<ManagerInvite[]>([]);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: "remove" | "primary" | "leave";
    admin: Admin;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const managerCheck = useCanAdd("co_managers");

  const refreshInvites = useCallback(() => {
    if (!token || !isPrimary || !multiManager) return;
    listManagerInvitesFn({ data: { token } })
      .then(setInvites)
      .catch((err) => console.error("[ManagersSection] Couldn't load codes:", err));
  }, [token, isPrimary, multiManager]);
  useEffect(refreshInvites, [refreshInvites]);

  const run = (key: string, action: () => Promise<void>, done?: string) => {
    setBusy(key);
    action()
      .then(() => done && toast.success(done))
      .catch((err: Error) => toast.error(err.message))
      .finally(() => {
        setBusy(null);
        setConfirm(null);
      });
  };

  const changeRole = (a: Admin, role: InviteRole) =>
    run(
      `role-${a.id}`,
      () => session.setManagerRole(a.id, role),
      `${a.short} is now a ${adminTypeLabel[managerRoleType[role]].toLowerCase()}.`,
    );

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">{t("people.managers")}</h2>
          <p className="text-xs text-muted-foreground">{t("people.theGrownUpsWhoRun")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          <Users className="h-3 w-3" /> {admins.length}
        </span>
      </div>

      <div className="divide-y divide-border/70">
        {admins.map((a) => {
          const isYou = currentAdmin?.id === a.id;
          const confirming = confirm?.admin.id === a.id ? confirm.kind : null;
          return (
            <div
              key={a.id}
              className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <Avatar initials={a.initials} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{a.name}</span>
                  {isYou && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      {t("people.you")}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge[a.type]}`}
                  >
                    {adminTypeLabel[a.type]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{a.location}</div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {adminPermSummary[a.type]}
                </div>

                {multiManager && isPrimary && !isYou && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {confirming === "remove" ? (
                      <ConfirmInline
                        question={`Take ${a.short} off this household? Their account stays.`}
                        yes="Remove"
                        busy={busy === `remove-${a.id}`}
                        onYes={() =>
                          run(
                            `remove-${a.id}`,
                            () => session.removeManager(a.id),
                            `${a.short} was removed.`,
                          )
                        }
                        onNo={() => setConfirm(null)}
                      />
                    ) : confirming === "primary" ? (
                      <ConfirmInline
                        question={`Make ${a.short} the primary manager? You'll become a co-manager.`}
                        yes="Make primary"
                        busy={busy === `primary-${a.id}`}
                        onYes={() =>
                          run(`primary-${a.id}`, () =>
                            session.setManagerRole(a.id, "primary_manager"),
                          )
                        }
                        onNo={() => setConfirm(null)}
                      />
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`role-${a.id}`}>
                          {richText(t("people.sRole"), { name: a.name })}
                        </label>
                        <select
                          id={`role-${a.id}`}
                          value={a.type === "remote" ? "remote_admin" : "co_manager"}
                          disabled={busy === `role-${a.id}`}
                          onChange={(e) => changeRole(a, e.target.value as InviteRole)}
                          className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary"
                        >
                          <option value="co_manager">{t("people.coManager")}</option>
                          <option value="remote_admin">{t("people.remoteAdmin")}</option>
                        </select>
                        <button
                          onClick={() => setConfirm({ kind: "primary", admin: a })}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          {t("people.makePrimary")}
                        </button>
                        <button
                          onClick={() => setConfirm({ kind: "remove", admin: a })}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-destructive"
                        >
                          {t("people.remove")}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {multiManager && isYou && !isPrimary && (
                  <div className="mt-2.5">
                    {confirming === "leave" ? (
                      <ConfirmInline
                        question="Leave this household? You'll need a new code to come back."
                        yes="Leave"
                        busy={busy === "leave"}
                        onYes={() => run("leave", () => session.leaveHousehold())}
                        onNo={() => setConfirm(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setConfirm({ kind: "leave", admin: a })}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-destructive"
                      >
                        <LogOut className="h-3.5 w-3.5" /> {t("people.leaveHousehold")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {multiManager && isPrimary && (
        <div className="mt-4 border-t border-border/70 pt-4">
          {invites.length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("people.codesNotUsedYet")}
              </div>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-xs"
                >
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold tracking-widest text-foreground">
                    {inv.code}
                  </span>
                  <span className="text-muted-foreground">
                    {richText(t("people.until"), {
                      value: adminTypeLabel[managerRoleType[inv.role]],
                      value2: whenExpires(inv.expiresAt),
                    })}
                  </span>
                  <button
                    onClick={() =>
                      run(
                        `revoke-${inv.id}`,
                        async () => {
                          if (!token) return;
                          await revokeManagerInviteFn({ data: { token, inviteId: inv.id } });
                          refreshInvites();
                        },
                        "Code cancelled.",
                      )
                    }
                    disabled={busy === `revoke-${inv.id}`}
                    className="ml-auto rounded-lg px-2 py-0.5 font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {t("people.cancelCode")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setInviting(true)}
            disabled={!managerCheck.ok}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-soft hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t("people.inviteAManager")}
          </button>
          <LimitNotice check={managerCheck} className="mt-2" />
        </div>
      )}

      {inviting && (
        <InviteManagerModal
          token={token}
          onClose={() => {
            setInviting(false);
            refreshInvites();
          }}
        />
      )}
    </section>
  );
}

function ConfirmInline({
  question,
  yes,
  busy,
  onYes,
  onNo,
}: {
  question: string;
  yes: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const t = useT();
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-foreground">
      {question}
      <button
        onClick={onYes}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1 font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} {yes}
      </button>
      <button onClick={onNo} className="font-semibold text-muted-foreground hover:text-foreground">
        {t("people.keep")}
      </button>
    </span>
  );
}

function InviteManagerModal({ token, onClose }: { token: string | null; onClose: () => void }) {
  const t = useT();
  const [role, setRole] = useState<InviteRole>("co_manager");
  const { subscription } = usePlan();
  const remoteAllowed = hasFeature(subscription, "remote_admin");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<ManagerInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    if (!token) return;
    setBusy(true);
    createManagerInviteFn({ data: { token, role } })
      .then(setMade)
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused: the code is on screen to read out.
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">
          {made ? t("people.shareThisCode") : t("people.inviteAManager")}
        </h3>
        <button
          onClick={onClose}
          aria-label={t("people.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {made ? (
        <>
          <div className="mt-5 rounded-3xl border border-dashed border-primary/40 bg-primary/5 px-5 py-6 text-center">
            <div className="font-display text-4xl font-semibold tracking-[0.15em] text-primary">
              {made.code}
            </div>
            <button
              onClick={copy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> {t("people.copied")}
                </>
              ) : (
                <>
                  <Link2 className="h-3 w-3" /> {t("people.copyCode")}
                </>
              )}
            </button>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {richText(t("people.forAItWorksOnce"), {
              value: adminTypeLabel[managerRoleType[made.role]].toLowerCase(),
              value2: whenExpires(made.expiresAt),
              span: (
                <span className="font-semibold text-foreground">{t("people.joinWithACode")}</span>
              ),
            })}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
            >
              {t("people.done")}
            </button>
          </div>
        </>
      ) : (
        <>
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">{t("people.theirRole")}</legend>
            {MANAGER_ROLES.map((r) => {
              const type = managerRoleType[r];
              const locked = r === "remote_admin" && !remoteAllowed;
              return (
                <label
                  key={r}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                    role === r
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="manager-role"
                    value={r}
                    checked={role === r}
                    disabled={locked}
                    onChange={() => setRole(r)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {adminTypeLabel[type]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {locked ? t("people.notOnYourPlan") : adminPermSummary[type]}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {t("people.cancel")}
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
            >
              {richText(t("people.makeACode"), {
                value: busy && <Loader2 className="h-4 w-4 animate-spin" />,
              })}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
