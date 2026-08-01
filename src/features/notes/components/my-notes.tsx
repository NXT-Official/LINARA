import { CalendarClock, Check, Mic, StickyNote, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { useMyNotes } from "../hooks/use-my-notes";

/** One-line text + hold-to-record voice notes, private to the helper. */
export function MyNotes({
  helperId,
  onMakeTask,
}: {
  helperId: string;
  onMakeTask: (text: string) => void;
}) {
  const { notes, add: addNote, addVoice, toggle, remove } = useMyNotes(helperId);
  const [text, setText] = useState("");
  const [holding, setHolding] = useState(false);
  const holdStart = useRef<number>(0);

  const add = () => {
    addNote(text);
    setText("");
  };

  const startHold = () => {
    holdStart.current = Date.now();
    setHolding(true);
  };
  const endHold = () => {
    if (!holding) return;
    const secs = Math.max(1, Math.round((Date.now() - holdStart.current) / 1000));
    setHolding(false);
    addVoice(secs || 4);
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-terracotta-soft/70 text-[oklch(0.55_0.13_55)]">
          <StickyNote className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-foreground">My Notes</h2>
          <p className="text-[11px] italic text-muted-foreground">Your notes — just for you.</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="e.g. Bumili ng suka mamaya"
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={add}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          Add
        </button>
      </div>
      <button
        type="button"
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={() => {
          if (holding) endHold();
        }}
        onTouchStart={startHold}
        onTouchEnd={endHold}
        className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold transition ${
          holding
            ? "border-terracotta bg-terracotta-soft/60 text-[oklch(0.45_0.12_55)]"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mic className="h-3.5 w-3.5" />
        {holding ? "Recording… release to save" : "🎙️ Hold to record"}
      </button>

      {notes.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-secondary/50 px-3 py-3 text-center text-xs italic text-muted-foreground">
          Wala pang notes. Capture anything you hear out loud.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => toggle(n.id)}
                  aria-label={n.done ? "Mark not done" : "Mark done"}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                    n.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary"
                  }`}
                >
                  {n.done && <Check className="h-3 w-3" />}
                </button>
                <div
                  className={`min-w-0 flex-1 text-sm ${n.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {n.text}
                </div>
                <button
                  onClick={() => remove(n.id)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {!n.done && !n.voice && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => onMakeTask(n.text)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-pine-deep hover:border-primary hover:text-primary"
                  >
                    <CalendarClock className="h-3 w-3" /> Make it a task
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
