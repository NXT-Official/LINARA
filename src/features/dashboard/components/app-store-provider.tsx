import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { useLedger } from "@/features/ledger/hooks/use-ledger";
import { useVales } from "@/features/ledger/hooks/use-vales";
import { usePantry } from "@/features/pantry/hooks/use-pantry";
import { useInvites } from "@/features/people/hooks/use-invites";
import { useSession } from "@/features/people/hooks/use-session";
import { toHelper } from "@/features/people/people.utils";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";
import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";
import type { Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";
import { useUtos } from "@/features/utos/hooks/use-utos";
import { supabaseClient } from "@/lib/supabase";
import { getQueue, removeFromQueue } from "@/lib/offline-queue";
import { toast } from "sonner";

import { AppStoreContext, type AppStores } from "../app-store-context";
import { useSimClock } from "../hooks/use-sim-clock";

/**
 * The composition root: every feature store is created here and shared with the
 * routed pages below it. Lives on the `_app` layout route so a page change never
 * remounts the day's state.
 */
export function AppStoreProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const invites = useInvites({ token: session.token, ready: session.status === "authed" });

  // All real helper_profiles rows, any status, for id -> Helper lookups; and the
  // ACTIVE subset for assignment dropdowns / lane rendering. "helper" stands in for
  // "the one with a first-class device" -- the first ACTIVE helper -- since there is
  // no real per-helper auth session yet (see KNOWN_GAPS.md); null until someone has
  // claimed their account.
  const helpers = useMemo(() => invites.helperProfiles.map(toHelper), [invites.helperProfiles]);
  const activeHelpers = useMemo(
    () => invites.helperProfiles.filter((p) => p.status === "ACTIVE").map(toHelper),
    [invites.helperProfiles],
  );
  const helper = activeHelpers[0] ?? null;
  const currentHelperId = helper?.id ?? null;

  const pantry = usePantry();
  const schedules = useSchedules({
    helperProfiles: invites.helperProfiles,
    token: session.token,
    refresh: invites.refresh,
  });
  const vales = useVales({ token: session.token, ready: session.status === "authed" });
  const clock = useSimClock();
  const availability = useAvailability({ nowTs: clock.nowTs, schedules, currentHelperId });
  const ledger = useLedger({
    rosaStatus: availability.status,
    schedules,
    currentHelperId,
    token: session.token,
    ready: session.status === "authed",
  });

  // Physical and simulated online/offline tracking
  const [isPhysicalOnline, setIsPhysicalOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isOfflineSimulated, setOfflineSimulated] = useState(false);

  const isOnline = isPhysicalOnline && !isOfflineSimulated;

  const [_boardChannelStatus, setBoardChannelStatus] = useState<string>("INITIALIZING");
  const [_utosChannelStatus, setUtosChannelStatus] = useState<string>("INITIALIZING");

  const board = useTaskBoard({
    nowTs: clock.nowTs,
    helpers,
    onComplete: ledger.record,
    isOnline,
    token: session.token,
    ready: session.status === "authed",
  });

  const appointments = useAppointments({
    token: session.token,
    ready: session.status === "authed",
    refreshTasks: board.refresh,
  });

  const utos = useUtos({
    toHelperId: currentHelperId,
    toHelperName: helper?.name ?? "your helper",
    token: session.token,
    ready: session.status === "authed",
    // A quick utos finished off-shift is worth a token five minutes.
    onDone: (u) => {
      if (!currentHelperId) return;
      ledger.record({
        sourceId: u.id,
        kind: "utos",
        title: u.content,
        helperId: currentHelperId,
        startTs: u.timestamp,
        doneTs: clock.nowTs,
        autoMinutes: 5,
        emergency: !!u.emergency,
      });
    },
  });

  const boardRef = useRef(board);
  boardRef.current = board;

  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  const utosRef = useRef(utos);
  utosRef.current = utos;

  useEffect(() => {
    // 1. household-board-channel -- as of Closed Gap C12, tickets is real, so
    // any change (INSERT/UPDATE/DELETE, from this device or another) just
    // triggers a refetch, same "refetch on any change" pattern as
    // quick-utos-channel below rather than hand-applying the payload. This
    // also replaced the old broadcast-based `board-action` tab-sync channel --
    // now that writes are real, Postgres Realtime alone covers every case
    // that broadcast used to (including tab-to-tab), so keeping both would
    // risk the same edit being applied twice under two different local copies.
    const boardChannel = supabaseClient.channel("household-board-channel");

    // Only the signed-in manager's session carries a real household_id
    // (see use-session.ts -- a helper's own session isn't tracked here).
    // Without one there's no real household to filter Postgres changes by.
    if (session.householdId) {
      boardChannel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `household_id=eq.${session.householdId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            console.log("[Realtime] Received tickets table postgres change:", payload);
            boardRef.current.refresh().catch((err) => {
              console.error("[Realtime] Failed to refresh board:", err);
            });
          },
        )
        // Appointments themselves (Closed Gap C14) -- same "any change ->
        // refetch" treatment, on the same channel as tickets since both are
        // filtered by the same household_id.
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "appointments",
            filter: `household_id=eq.${session.householdId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            console.log("[Realtime] Received appointments table postgres change:", payload);
            appointmentsRef.current.refresh().catch((err) => {
              console.error("[Realtime] Failed to refresh appointments:", err);
            });
          },
        )
        .subscribe((status, err) => {
          console.log(`[Realtime] household-board-channel status: ${status}`, err || "");
          setBoardChannelStatus(status);
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            setTimeout(() => {
              console.log("[Realtime] Attempting to reconnect household-board-channel...");
              boardChannel.subscribe();
            }, 5000);
          }
        });
    }

    // 2. quick-utos-channel -- unlike the board channel, this listener is the
    // *only* sync path for quick utos (no broadcast fallback, see useUtos's
    // doc comment), so it covers every change (INSERT/UPDATE/DELETE) and
    // just triggers a refetch rather than hand-reconstructing the row --
    // simpler, and avoids the sender's own optimistic copy and the
    // realtime-delivered copy ever coexisting under different ids.
    const utosChannel = supabaseClient.channel("quick-utos-channel");

    if (currentHelperId) {
      utosChannel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "quick_utos",
            filter: `recipient_id=eq.${currentHelperId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            console.log("[Realtime] Received quick_utos table postgres change:", payload);
            utosRef.current.refresh().catch((err) => {
              console.error("[Realtime] Failed to refresh quick utos:", err);
            });
          },
        )
        .subscribe((status, err) => {
          console.log(`[Realtime] quick-utos-channel status: ${status}`, err || "");
          setUtosChannelStatus(status);
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            setTimeout(() => {
              console.log("[Realtime] Attempting to reconnect quick-utos-channel...");
              utosChannel.subscribe();
            }, 5000);
          }
        });
    }

    return () => {
      supabaseClient.removeChannel(boardChannel);
      supabaseClient.removeChannel(utosChannel);
    };
  }, [currentHelperId, session.householdId]);

  // Background Sync Daemon
  const syncOfflineQueue = async () => {
    try {
      const items = await getQueue();
      if (items.length === 0) return;

      console.log(`[Offline Sync] Synchronizing ${items.length} queued offline actions...`);

      for (const item of items) {
        if (item.action === "update_status") {
          const { id, status } = item.payload as { id: string; status: Task["status"] };
          // Now that we're back online, replay as a real write -- updateStatus's
          // online branch writes to `tickets` and refetches, which naturally
          // clears the local pendingSync flag (the refetched row has no such
          // field) without needing a manual clear step.
          boardRef.current.updateStatus(id, status, item.binaryPhoto ?? undefined);
        }
        await removeFromQueue(item.id);
      }

      toast.success("Naka-connect na ulit! Na-sync na ang iyong mga ginawa. 📶");
    } catch (err) {
      console.error("[Offline Sync] Sync failed:", err);
    }
  };

  // Sync when transitioning back to online
  useEffect(() => {
    if (isOnline) {
      syncOfflineQueue();
    }
  }, [isOnline]);

  // Network connection status listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsPhysicalOnline(true);
    };
    const handleOffline = () => {
      setIsPhysicalOnline(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  const value: AppStores = {
    helper,
    helpers,
    activeHelpers,
    session,
    invites,
    pantry,
    schedules,
    vales,
    clock,
    availability,
    ledger,
    board,
    appointments,
    utos,
    isOnline,
    isOfflineSimulated,
    setOfflineSimulated,
    startNewDay: () => {
      utos.clearForNewDay();
      board.startNewDay();
    },
  };

  return (
    <AppStoreContext.Provider value={value}>
      <GroceryProvider
        pantry={pantry}
        token={session.token}
        ready={session.status === "authed"}
        receiptPhoto={board.tasks.find(isPalengke)?.photo ?? null}
      >
        {children}
      </GroceryProvider>
    </AppStoreContext.Provider>
  );
}
