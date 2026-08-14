import { BookmarkPlus, Check, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import type { Helper } from "@/features/people/people.types";
import { WEEKDAYS, type Weekday } from "@/lib/time";
import { generateSopFn, insertHouseSopFn, type HouseStandardSOP } from "../task.actions";

import type { Recurrence, Routine } from "../task.types";

export function NewRoutineModal({
  token,
  activeHelpers,
  onClose,
  onAdd,
}: {
  token: string | null;
  activeHelpers: Helper[];
  onClose: () => void;
  onAdd: (r: Omit<Routine, "id" | "station">) => void;
}) {
  const [title, setTitle] = useState("");
  const [helperId, setHelperId] = useState(activeHelpers[0]?.id ?? "");
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"daily" | "weekdays">("daily");
  const [days, setDays] = useState<Weekday[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSop, setGeneratedSop] = useState<HouseStandardSOP | null>(null);
  const [isSavingSop, setIsSavingSop] = useState(false);
  const [savedSopId, setSavedSopId] = useState<string | null>(null);

  const handleAIGenerate = async () => {
    if (!title.trim()) {
      toast.error("Mangyaring maglagay muna ng title para maging batayan ng AI SOP.");
      return;
    }

    setIsGenerating(true);
    const assignedHelper = activeHelpers.find((h) => h.id === helperId);

    try {
      const result = await generateSopFn({
        data: {
          prompt: title.trim(),
          station: assignedHelper?.station,
        },
      });

      if (result) {
        setTitle(result.title);
        setGeneratedSop(result);
        setSavedSopId(null);

        const formattedNote = [
          result.description,
          "\n📋 SEKWENSIYAL NA HAKBANG:",
          ...result.steps.map((step, idx) => `${idx + 1}. ${step}`),
          "\n🛠️ MGA KASANGKAPAN (TOOLS REQUIRED):",
          ...result.toolsRequired.map((tool) => `- ${tool}`),
          `\n⚠️ SAFETY PROTOCOL & PAG-IINGAT:\n${result.safetyProtocol}`,
        ].join("\n");

        setNote(formattedNote);
        toast.success("Standard SOP successfully generated & populated!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Hindi nagtagumpay ang pag-generate ng SOP gamit ang AI.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!generatedSop || !token) return;

    setIsSavingSop(true);
    try {
      const { id } = await insertHouseSopFn({
        data: {
          token,
          title: generatedSop.title,
          description: generatedSop.description,
          steps: generatedSop.steps,
          toolsRequired: generatedSop.toolsRequired,
          safetyProtocol: generatedSop.safetyProtocol,
        },
      });
      setSavedSopId(id);
      toast.success("Saved to the House Standards Library!");
    } catch (err) {
      console.error(err);
      toast.error("Hindi na-save ang SOP sa House Standards Library.");
    } finally {
      setIsSavingSop(false);
    }
  };

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const canSubmit =
    title.trim().length > 0 && !!helperId && (repeatKind === "daily" || days.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const recurrence: Exclude<Recurrence, "none"> =
      repeatKind === "daily" ? "daily" : WEEKDAYS.filter((d) => days.includes(d));
    onAdd({
      title: title.trim(),
      helperId,
      time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
      note: note.trim() || undefined,
      recurrence,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">New routine</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Set it once. It'll appear on the Pass on matching days.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setGeneratedSop(null);
                setSavedSopId(null);
              }}
              placeholder="e.g. Water the plants"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <select
                value={helperId}
                onChange={(e) => setHelperId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {activeHelpers.length === 0 && <option value="">No active helpers yet</option>}
                {activeHelpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.station}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                House-standard note (optional)
              </label>
              <button
                type="button"
                disabled={!title.trim() || isGenerating}
                onClick={handleAIGenerate}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition hover:text-pine-deep disabled:opacity-45"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate SOP with AI
                  </>
                )}
              </button>
            </div>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setGeneratedSop(null);
                setSavedSopId(null);
              }}
              rows={5}
              placeholder="e.g. Deep-water the fiddle leaf; light mist for the ferns."
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            {generatedSop && (
              <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-secondary/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {savedSopId
                    ? "Saved to the House Standards Library."
                    : token
                      ? "Structured steps, tools & safety protocol ready to save."
                      : "Sign in as a manager to save this to the House Standards Library."}
                </p>
                <button
                  type="button"
                  disabled={!token || isSavingSop || !!savedSopId}
                  onClick={handleSaveToLibrary}
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary transition hover:text-pine-deep disabled:opacity-45"
                >
                  {isSavingSop ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : savedSopId ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Saved
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Save to Library
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          <Field label="Repeat">
            <div className="inline-flex w-full rounded-xl border border-input bg-background p-1">
              {(
                [
                  { key: "daily", label: "Every day" },
                  { key: "weekdays", label: "Specific days" },
                ] as const
              ).map((opt) => {
                const active = repeatKind === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => setRepeatKind(opt.key)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {repeatKind === "weekdays" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = days.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Save routine
          </button>
        </div>
      </div>
    </div>
  );
}
