import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { usePlatformAdminSession } from "@/features/platform-admin/hooks/use-platform-admin-session";
import { Switch } from "@/components/ui/switch";

import { PlanFormModal } from "../components/plan-form-modal";
import {
  getPlatformSettingsFn,
  listAllPlansFn,
  savePlatformSettingsFn,
  setPlanStatusFn,
} from "../plan.actions";
import { describePlanPricing } from "../plan.pricing";
import type { Plan, PlanStatus, PlatformSettings } from "../plan.types";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; plans: Plan[] };

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};
const STATUS_PILL: Record<PlanStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground",
};

const actionCls =
  "rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";
const primaryCls =
  "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";

/** Linara admin: price the plans, publish them, and set the free tier. */
export function PlatformAdminPlansPage() {
  const { status, token } = usePlatformAdminSession();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoad({ kind: "loading" });
    try {
      const res = await listAllPlansFn({ data: { token } });
      setLoad(res.available ? { kind: "ready", plans: res.plans } : { kind: "unavailable" });
    } catch {
      setLoad({ kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function changeStatus(plan: Plan, next: PlanStatus, done: string) {
    if (!token) return;
    setBusyId(plan.id);
    try {
      const saved = await setPlanStatusFn({ data: { token, id: plan.id, status: next } });
      setLoad((l) =>
        l.kind === "ready"
          ? { kind: "ready", plans: l.plans.map((p) => (p.id === saved.id ? saved : p)) }
          : l,
      );
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the plan.");
    } finally {
      setBusyId(null);
    }
  }

  function onSaved(saved: Plan) {
    setLoad((l) => {
      if (l.kind !== "ready") return l;
      const exists = l.plans.some((p) => p.id === saved.id);
      const plans = exists
        ? l.plans.map((p) => (p.id === saved.id ? saved : p))
        : [...l.plans, saved];
      return { kind: "ready", plans: plans.sort((a, b) => a.sortOrder - b.sortOrder) };
    });
    setEditing(null);
  }

  if (status === "loading" || (token && load.kind === "loading")) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading plans…
      </p>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="plans-heading">
        <div className="flex items-center justify-between gap-3">
          <h1 id="plans-heading" className="font-display text-2xl text-foreground">
            Plans
          </h1>
          {load.kind === "ready" && load.plans.length > 0 && (
            <button type="button" className={primaryCls} onClick={() => setEditing("new")}>
              New plan
            </button>
          )}
        </div>

        <div className="mt-4 rounded-3xl border border-border/60 bg-card shadow-soft">
          {load.kind === "error" && (
            <div role="alert" className="p-6 text-sm">
              <p className="text-foreground">Couldn&rsquo;t load the plans.</p>
              <button type="button" className={`${actionCls} mt-3`} onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          )}
          {load.kind === "unavailable" && (
            <p className="p-6 text-sm text-muted-foreground">
              Plans aren&rsquo;t switched on yet. Apply supabase/add-plans.sql, then reload.
            </p>
          )}
          {load.kind === "ready" && load.plans.length === 0 && (
            <div className="p-6">
              <p className="font-display text-lg text-foreground">No plans yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Until you publish one, the pricing page tells people pricing is by conversation.
              </p>
              <button
                type="button"
                className={`${primaryCls} mt-4`}
                onClick={() => setEditing("new")}
              >
                New plan
              </button>
            </div>
          )}
          {load.kind === "ready" && load.plans.length > 0 && (
            <ul className="divide-y divide-border/60">
              {load.plans.map((plan) => (
                <PlanRowItem
                  key={plan.id}
                  plan={plan}
                  busy={busyId === plan.id}
                  onEdit={() => setEditing(plan)}
                  onStatus={(next, done) => void changeStatus(plan, next, done)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <FreeTierSection token={token} />

      {editing !== null && (
        <PlanFormModal
          token={token}
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function PlanRowItem({
  plan,
  busy,
  onEdit,
  onStatus,
}: {
  plan: Plan;
  busy: boolean;
  onEdit: () => void;
  onStatus: (next: PlanStatus, done: string) => void;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_PILL[plan.status]}`}
          >
            {STATUS_LABEL[plan.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{describePlanPricing(plan)}</p>
        {plan.status === "active" && !plan.isPublic && (
          <p className="mt-1 text-sm text-muted-foreground">Not shown on the pricing page.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={actionCls}
          aria-label={`Edit ${plan.name}`}
          onClick={onEdit}
        >
          Edit
        </button>
        {plan.status === "draft" && (
          <button
            type="button"
            className={actionCls}
            disabled={busy}
            aria-label={`Publish ${plan.name}`}
            onClick={() => onStatus("active", "Plan published.")}
          >
            Publish
          </button>
        )}
        {plan.status === "active" && (
          <button
            type="button"
            className={actionCls}
            disabled={busy}
            aria-label={`Unpublish ${plan.name}`}
            onClick={() => onStatus("draft", "Plan unpublished.")}
          >
            Unpublish
          </button>
        )}
        {plan.status !== "archived" ? (
          <button
            type="button"
            className={actionCls}
            disabled={busy}
            aria-label={`Archive ${plan.name}`}
            onClick={() => onStatus("archived", "Plan archived.")}
          >
            Archive
          </button>
        ) : (
          <button
            type="button"
            className={actionCls}
            disabled={busy}
            aria-label={`Restore ${plan.name}`}
            onClick={() => onStatus("draft", "Plan restored as a draft.")}
          >
            Restore
          </button>
        )}
      </div>
    </li>
  );
}

type SettingsLoad =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; settings: PlatformSettings };

function FreeTierSection({ token }: { token: string }) {
  const [load, setLoad] = useState<SettingsLoad>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const res = await getPlatformSettingsFn({ data: { token } });
      setLoad(
        res.available && res.settings
          ? { kind: "ready", settings: res.settings }
          : { kind: "unavailable" },
      );
    } catch {
      setLoad({ kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-labelledby="free-tier-heading">
      <h2 id="free-tier-heading" className="font-display text-2xl text-foreground">
        Free tier
      </h2>
      <div className="mt-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-6">
        {load.kind === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading the free tier…
          </p>
        )}
        {load.kind === "error" && (
          <div role="alert" className="text-sm">
            <p className="text-foreground">Couldn&rsquo;t load the free tier.</p>
            <button type="button" className={`${actionCls} mt-3`} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {load.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            The free tier isn&rsquo;t switched on yet. Apply supabase/add-plans.sql, then reload.
          </p>
        )}
        {load.kind === "ready" && <FreeTierForm token={token} initial={load.settings} />}
      </div>
    </section>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function FreeTierForm({ token, initial }: { token: string; initial: PlatformSettings }) {
  const [enabled, setEnabled] = useState(initial.freeTierEnabled);
  const [helperUnlimited, setHelperUnlimited] = useState(initial.freeHelperSeats === null);
  const [helperSeats, setHelperSeats] = useState(String(initial.freeHelperSeats ?? ""));
  const [managerUnlimited, setManagerUnlimited] = useState(initial.freeManagerSeats === null);
  const [managerSeats, setManagerSeats] = useState(String(initial.freeManagerSeats ?? ""));
  const [email, setEmail] = useState(initial.supportEmail ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const seatsOf = (unlimited: boolean, text: string): number | null | "bad" => {
    if (unlimited) return null;
    const n = Number(text);
    return text.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : "bad";
  };

  async function save() {
    const helpers = seatsOf(helperUnlimited, helperSeats);
    const managers = seatsOf(managerUnlimited, managerSeats);
    const found: Record<string, string> = {};
    if (helpers === "bad") found.helpers = "Whole seats, zero or more.";
    if (managers === "bad") found.managers = "Whole seats, zero or more.";
    setErrors(found);
    if (helpers === "bad" || managers === "bad") return;
    setSaving(true);
    try {
      await savePlatformSettingsFn({
        data: {
          token,
          settings: {
            freeTierEnabled: enabled,
            freeHelperSeats: helpers,
            freeManagerSeats: managers,
            supportEmail: email.trim() === "" ? null : email.trim(),
          },
        },
      });
      toast.success("Free tier saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the free tier.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="free-tier-enabled" className="text-sm font-semibold text-foreground">
          Households without a plan can use Linara free
        </label>
        <Switch id="free-tier-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Field label="Free helper seats" error={errors.helpers}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={helperSeats}
              disabled={helperUnlimited}
              aria-invalid={Boolean(errors.helpers)}
              onChange={(e) => setHelperSeats(e.target.value)}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={helperUnlimited}
              onChange={(e) => setHelperUnlimited(e.target.checked)}
            />
            Unlimited helpers
          </label>
        </div>
        <div className="space-y-2">
          <Field label="Free manager seats" error={errors.managers}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={managerSeats}
              disabled={managerUnlimited}
              aria-invalid={Boolean(errors.managers)}
              onChange={(e) => setManagerSeats(e.target.value)}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={managerUnlimited}
              onChange={(e) => setManagerUnlimited(e.target.checked)}
            />
            Unlimited managers
          </label>
        </div>
      </div>
      <Field label="Support email">
        <input
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <button type="button" className={primaryCls} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save free tier"}
        </button>
      </div>
    </div>
  );
}
