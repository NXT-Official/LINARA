import { ClipboardList, Package, Wallet } from "lucide-react";
import { useState } from "react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { RosaAvailControl } from "@/features/availability/components/rosa-avail-control";
import type { Availability } from "@/features/availability/hooks/use-availability";
import { GrocerySection } from "@/features/groceries/components/grocery-section";
import { PayRecord } from "@/features/ledger/components/pay-record";
import type { LedgerStore } from "@/features/ledger/hooks/use-ledger";
import type { ValeStore } from "@/features/ledger/hooks/use-vales";
import { MyNotes } from "@/features/notes/components/my-notes";
import { NoteToTaskModal } from "@/features/notes/components/note-to-task-modal";
import { PantrySection } from "@/features/pantry/components/pantry-section";
import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import { ClaimAccountFlow } from "@/features/people/components/claim-account-flow";
import { ClaimedWelcome } from "@/features/people/components/claimed-welcome";
import type { Helper, Invite } from "@/features/people/people.types";
import type { InviteStore } from "@/features/people/hooks/use-invites";
import { MyWeekCard } from "@/features/shifts/components/my-week-card";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { BlockReasonModal } from "@/features/tasks/components/block-reason-modal";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";
import { QuickUtosFeed } from "@/features/utos/components/quick-utos-feed";
import type { UtosStore } from "@/features/utos/hooks/use-utos";

import { EndOfDay } from "./end-of-day";
import { HelperTaskLists } from "./helper-task-lists";

export function HelperView({
  helper,
  board,
  ledgerStore,
  valeStore,
  pantry,
  schedules,
  availability,
  inviteStore,
  utos,
}: {
  helper: Helper;
  board: TaskBoard;
  ledgerStore: LedgerStore;
  valeStore: ValeStore;
  pantry: PantryStore;
  schedules: ScheduleStore;
  availability: Availability;
  inviteStore: InviteStore;
  utos: UtosStore;
}) {
  const {
    tasks,
    boardClosed,
    simDate,
    updateStatus: onUpdate,
    blockTask: onBlock,
    addTask: onAddTask,
  } = board;
  const {
    entries: ledger,
    resolutionDefault: ledgerDefault,
    updateEntry: onUpdateLedgerEntry,
  } = ledgerStore;
  const vales = valeStore.vales.filter((v) => v.helperId === helper.id);
  const onRequestVale = (amount: number, reason: string) =>
    valeStore.request(helper.id, amount, reason);
  const { list: utosList, wipedToday: utosWipedToday, ack: onAckUtos } = utos;
  const rosaStatus = availability.status;
  const weekSchedule = schedules.weekFor(helper.id);
  const {
    invites,
    findByCode: onFindInvite,
    claim: onClaimInvite,
    flag: onFlagInvite,
  } = inviteStore;

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimedInfo, setClaimedInfo] = useState<Invite | null>(null);
  const myClaimed = invites.find((i) => i.status === "active");
  const [tab, setTab] = useState<"today" | "pay" | "pantry">("today");
  const [noteToTask, setNoteToTask] = useState<string | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const mine = tasks.filter((t) => t.helperId === helper.id && !t.queued);
  const doneCount = mine.filter((t) => t.status === "done").length;
  const activeCount = mine.filter((t) => t.status !== "done" && t.status !== "blocked").length;
  const allDone = boardClosed || (activeCount === 0 && doneCount > 0);
  const next = mine.find((t) => t.status !== "done" && t.status !== "blocked");
  const upcoming = mine.filter(
    (t) => t.status !== "done" && t.status !== "blocked" && t.id !== next?.id,
  );
  const blocked = mine.filter((t) => t.status === "blocked");
  const completed = mine.filter((t) => t.status === "done");
  const blockingTask = mine.find((t) => t.id === blockingId) ?? null;

  return (
    <div className="space-y-5 pb-24">
      {/* Greeting */}
      <section className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift sm:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
          Ate Rosa's Station
        </div>
        <h1 className="mt-2 font-display text-[26px] leading-tight sm:text-3xl">
          Magandang umaga, Ate Rosa.
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
          status={rosaStatus}
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

      {tab === "today" ? (
        <>
          <MyWeekCard weekSchedule={weekSchedule} simDate={simDate} />
          {(utosList.length > 0 || utosWipedToday) && (
            <QuickUtosFeed
              utosList={utosList}
              onAck={onAckUtos}
              available={!boardClosed}
              wiped={utosWipedToday}
            />
          )}
          <MyNotes helperId={helper.id} onMakeTask={(txt) => setNoteToTask(txt)} />
          {allDone ? (
            <EndOfDay doneCount={doneCount} />
          ) : (
            <HelperTaskLists
              next={next}
              upcoming={upcoming}
              blocked={blocked}
              completed={completed}
              onUpdate={onUpdate}
              onAskBlock={setBlockingId}
            />
          )}
        </>
      ) : tab === "pantry" ? (
        <div className="space-y-5">
          <PantrySection pantry={pantry} />
          <GrocerySection />
        </div>
      ) : (
        <PayRecord
          vales={vales}
          onRequestVale={onRequestVale}
          ledger={ledger}
          ledgerDefault={ledgerDefault}
          onUpdateLedgerEntry={onUpdateLedgerEntry}
          helper={helper}
          myInvite={myClaimed ?? null}
        />
      )}

      {blockingTask && (
        <BlockReasonModal
          task={blockingTask}
          onClose={() => setBlockingId(null)}
          onSubmit={(reason) => {
            onBlock(blockingTask.id, reason);
            setBlockingId(null);
          }}
        />
      )}

      {noteToTask !== null && (
        <NoteToTaskModal
          initialTitle={noteToTask}
          helperId={helper.id}
          onClose={() => setNoteToTask(null)}
          onSubmit={(t) => {
            onAddTask(t);
            setNoteToTask(null);
          }}
        />
      )}

      {claimOpen && (
        <ClaimAccountFlow
          onClose={() => setClaimOpen(false)}
          onFindInvite={onFindInvite}
          onClaim={(id, name) => {
            onClaimInvite(id, name);
          }}
          onFlag={onFlagInvite}
          onFinished={(inv) => {
            setClaimOpen(false);
            setClaimedInfo(inv);
            setTab("today");
          }}
        />
      )}
      {claimedInfo && <ClaimedWelcome invite={claimedInfo} onClose={() => setClaimedInfo(null)} />}

      <BottomNav
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: "today", label: "Today", Icon: ClipboardList },
          { key: "pantry", label: "Pantry", Icon: Package },
          { key: "pay", label: "My Pay", Icon: Wallet },
        ]}
      />
    </div>
  );
}
