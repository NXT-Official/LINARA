import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { useLedger } from "@/features/ledger/hooks/use-ledger";
import { useVales } from "@/features/ledger/hooks/use-vales";
import { usePantry } from "@/features/pantry/hooks/use-pantry";
import { useInvites } from "@/features/people/hooks/use-invites";
import { useSession } from "@/features/people/hooks/use-session";
import { helperById } from "@/features/people/people.utils";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";
import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";
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
  const currentHelperId = "rosa";
  const helper = helperById(currentHelperId);

  const session = useSession();
  const invites = useInvites();
  const pantry = usePantry();
  const schedules = useSchedules();
  const vales = useVales();
  const clock = useSimClock();
  const availability = useAvailability({ nowTs: clock.nowTs, schedules });
  const ledger = useLedger({ rosaStatus: availability.status, schedules });

  // Physical and simulated online/offline tracking
  const [isPhysicalOnline, setIsPhysicalOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isOfflineSimulated, setOfflineSimulated] = useState(false);

  const isOnline = isPhysicalOnline && !isOfflineSimulated;

  // A ref to keep track of whether we are currently receiving/applying an action
  // to prevent re-broadcasting it.
  const isSyncingBoardRef = useRef(false);
  const isSyncingUtosRef = useRef(false);

  const householdBoardChannelRef = useRef<any>(null);
  const quickUtosChannelRef = useRef<any>(null);

  const [boardChannelStatus, setBoardChannelStatus] = useState<string>("INITIALIZING");
  const [utosChannelStatus, setUtosChannelStatus] = useState<string>("INITIALIZING");

  const board = useTaskBoard({
    nowTs: clock.nowTs,
    onComplete: ledger.record,
    onAction: (action) => {
      if (isSyncingBoardRef.current) return;
      householdBoardChannelRef.current?.send({
        type: "broadcast",
        event: "board-action",
        payload: action,
      });
    },
    isOnline,
  });

  const appointments = useAppointments(board.setTasks);

  const utos = useUtos({
    toHelperId: currentHelperId,
    // A quick utos finished off-shift is worth a token five minutes.
    onDone: (u) =>
      ledger.record({
        sourceId: u.id,
        kind: "utos",
        title: u.content,
        helperId: currentHelperId,
        startTs: u.timestamp,
        doneTs: clock.nowTs,
        autoMinutes: 5,
        emergency: !!u.emergency,
      }),
    onAction: (action) => {
      if (isSyncingUtosRef.current) return;
      quickUtosChannelRef.current?.send({
        type: "broadcast",
        event: "utos-action",
        payload: action,
      });
    },
  });

  const boardRef = useRef(board);
  boardRef.current = board;

  const utosRef = useRef(utos);
  utosRef.current = utos;

  useEffect(() => {
    const householdId = "demo-household-id";

    // 1. household-board-channel
    const boardChannel = supabaseClient.channel("household-board-channel");
    householdBoardChannelRef.current = boardChannel;

    boardChannel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `household_id=eq.${householdId}`,
        },
        (payload: any) => {
          console.log("[Realtime] Received tickets table postgres change:", payload);
        }
      )
      .on("broadcast", { event: "board-action" }, ({ payload }) => {
        console.log("[Realtime] Received board broadcast action:", payload);
        isSyncingBoardRef.current = true;
        try {
          boardRef.current.receiveAction(payload);
        } catch (err) {
          console.error("[Realtime] Failed to sync board action:", err);
        } finally {
          isSyncingBoardRef.current = false;
        }
      })
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

    // 2. quick-utos-channel
    const utosChannel = supabaseClient.channel("quick-utos-channel");
    quickUtosChannelRef.current = utosChannel;

    utosChannel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "quick_utos",
        },
        (payload: any) => {
          console.log("[Realtime] Received quick_utos table postgres change:", payload);
          if (payload.new && payload.new.helper_id === currentHelperId) {
            isSyncingUtosRef.current = true;
            try {
              utosRef.current.receiveAction({
                type: "SEND_UTO",
                payload: {
                  uto: {
                    id: payload.new.id,
                    content: payload.new.content,
                    from: payload.new.from_name || "Manager",
                    to: helper.name,
                    timestamp: new Date(payload.new.created_at).getTime(),
                    ackState: payload.new.ack_state || "sent",
                    afterHours: payload.new.after_hours,
                    emergency: payload.new.emergency,
                    waiting: payload.new.waiting,
                  },
                },
              });
            } catch (err) {
              console.error("[Realtime] Failed to sync postgres quick_utos change:", err);
            } finally {
              isSyncingUtosRef.current = false;
            }
          }
        }
      )
      .on("broadcast", { event: "utos-action" }, ({ payload }) => {
        console.log("[Realtime] Received utos broadcast action:", payload);
        isSyncingUtosRef.current = true;
        try {
          utosRef.current.receiveAction(payload);
        } catch (err) {
          console.error("[Realtime] Failed to sync utos action:", err);
        } finally {
          isSyncingUtosRef.current = false;
        }
      })
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

    return () => {
      supabaseClient.removeChannel(boardChannel);
      supabaseClient.removeChannel(utosChannel);
    };
  }, [currentHelperId, helper.name]);

  // Background Sync Daemon
  const syncOfflineQueue = async () => {
    try {
      const items = await getQueue();
      if (items.length === 0) return;

      console.log(`[Offline Sync] Synchronizing ${items.length} queued offline actions...`);

      for (const item of items) {
        if (item.action === "update_status") {
          const { id, status } = item.payload;
          // Apply to local board state
          boardRef.current.receiveAction({
            type: "UPDATE_STATUS",
            payload: { id, status, photo: item.binaryPhoto },
          });
          // Broadcast to other devices/screens
          householdBoardChannelRef.current?.send({
            type: "broadcast",
            event: "board-action",
            payload: {
              type: "UPDATE_STATUS",
              payload: { id, status, photo: item.binaryPhoto },
            },
          });
          // Clear pendingSync status flag
          boardRef.current.setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, pendingSync: undefined } : t))
          );
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
      <GroceryProvider pantry={pantry}>{children}</GroceryProvider>
    </AppStoreContext.Provider>
  );
}
