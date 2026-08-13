import { useState } from "react";

import { MyNotes } from "@/features/notes/components/my-notes";
import { NoteToTaskModal } from "@/features/notes/components/note-to-task-modal";
import { MyWeekCard } from "@/features/shifts/components/my-week-card";
import { BlockReasonModal } from "@/features/tasks/components/block-reason-modal";
import { QuickUtosFeed } from "@/features/utos/components/quick-utos-feed";

import { useAppStores } from "../app-store-context";
import { EndOfDay } from "../components/end-of-day";
import { HelperTaskLists } from "../components/helper-task-lists";

/** The helper's day: their week, the quick asks, their notes, and their task lists. */
export function HelperTodayPage() {
  const { helper, board, schedules, utos } = useAppStores();
  const { tasks, boardClosed, simDate, updateStatus, blockTask, addTask } = board;

  const [noteToTask, setNoteToTask] = useState<string | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);

  if (!helper) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
        No active helper account yet — claim an invite to see your day.
      </div>
    );
  }

  const mine = tasks.filter((t) => t.helperId === helper.id && !t.queued);
  const doneCount = mine.filter((t) => t.status === "done").length;
  const activeCount = mine.filter((t) => t.status !== "done" && t.status !== "blocked").length;
  const allDone = boardClosed || (activeCount === 0 && doneCount > 0);
  const next = mine.find((t) => t.status !== "done" && t.status !== "blocked");
  const blockingTask = mine.find((t) => t.id === blockingId) ?? null;

  return (
    <>
      <MyWeekCard schedule={schedules.scheduleFor(helper.id)} simDate={simDate} />
      {(utos.list.length > 0 || utos.wipedToday) && (
        <QuickUtosFeed
          utosList={utos.list}
          onAck={utos.ack}
          available={!boardClosed}
          wiped={utos.wipedToday}
          helperName={helper.name}
        />
      )}
      <MyNotes helperId={helper.id} onMakeTask={(txt) => setNoteToTask(txt)} />
      {allDone ? (
        <EndOfDay doneCount={doneCount} helperName={helper.name} />
      ) : (
        <HelperTaskLists
          next={next}
          upcoming={mine.filter(
            (t) => t.status !== "done" && t.status !== "blocked" && t.id !== next?.id,
          )}
          blocked={mine.filter((t) => t.status === "blocked")}
          completed={mine.filter((t) => t.status === "done")}
          onUpdate={updateStatus}
          onAskBlock={setBlockingId}
        />
      )}

      {blockingTask && (
        <BlockReasonModal
          task={blockingTask}
          onClose={() => setBlockingId(null)}
          onSubmit={(reason) => {
            blockTask(blockingTask.id, reason);
            setBlockingId(null);
          }}
        />
      )}

      {noteToTask !== null && (
        <NoteToTaskModal
          initialTitle={noteToTask}
          helperId={helper.id}
          createdBy={helper.name}
          onClose={() => setNoteToTask(null)}
          onSubmit={(t) => {
            addTask(t);
            setNoteToTask(null);
          }}
        />
      )}
    </>
  );
}
