import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { manualFromRow, statusFor } from "@/features/availability/availability.utils";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { useLedger } from "@/features/ledger/hooks/use-ledger";
import { useVales } from "@/features/ledger/hooks/use-vales";
import { usePantry } from "@/features/pantry/hooks/use-pantry";
import { usePayslips } from "@/features/pay/hooks/use-payslips";
import { useInvites } from "@/features/people/hooks/use-invites";
import { useSession } from "@/features/people/hooks/use-session";
import { toHelper } from "@/features/people/people.utils";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";
import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";
import { getServerNowFn } from "@/features/tasks/task.actions";
import type { Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";
import { useUtos } from "@/features/utos/hooks/use-utos";
import { clearAllUtosForHelpersFn, listUtosForHelpersFn } from "@/features/utos/utos.actions";
import { supabaseClient } from "@/lib/supabase";
import { getQueue, removeFromQueue } from "@/lib/offline-queue";
import { toISODate } from "@/lib/time";
import { toast } from "sonner";

import { AppStoreContext, type AppStores } from "../app-store-context";
import { useSimClock } from "../hooks/use-sim-clock";

// A device clock that's wildly wrong (stuck, epoch-adjacent, set years off)
// shouldn't be treated the same as a normal one-day catch-up --
// KNOWN_GAPS.md O2's sanity bound on auto-rollover. Anything larger falls
// back to the manual "Start new day" button (C30), which has no such cap.
const MAX_PLAUSIBLE_ROLLOVER_DAYS = 14;

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

  const pantry = usePantry({ token: session.token, ready: session.status === "authed" });
  const schedules = useSchedules({
    helperProfiles: invites.helperProfiles,
    token: session.token,
    refresh: invites.refresh,
  });
  const vales = useVales({ token: session.token, ready: session.status === "authed" });
  const payslips = usePayslips({ token: session.token, ready: session.status === "authed" });
  const clock = useSimClock();
  const availability = useAvailability({
    nowTs: clock.nowTs,
    schedules,
    currentHelperId,
    helperProfiles: invites.helperProfiles,
  });
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

  // Who the next Quick Utos goes to -- defaults to whichever active helper is
  // actually reachable right now (statusFor() != "off"), falling back to
  // currentHelperId (most-recently-invited) only when nobody is, until a
  // manager explicitly picks someone else via the launcher (see
  // MULTI_HELPER_HANDLING.md). Kept as "explicit pick, or null" rather than
  // resolved eagerly, so a not-yet-loaded currentHelperId doesn't get baked
  // in as a stale default.
  const [pickedUtosHelperId, setPickedUtosHelperId] = useState<string | null>(null);
  const defaultUtosRecipientId = useMemo(() => {
    const reachable = activeHelpers.find((h) => {
      const row = invites.helperProfiles.find((p) => p.id === h.id);
      return statusFor(h.id, schedules, clock.nowTs, manualFromRow(row)).status !== "off";
    });
    return reachable?.id ?? currentHelperId;
  }, [activeHelpers, invites.helperProfiles, schedules, clock.nowTs, currentHelperId]);
  const utosRecipientId = pickedUtosHelperId ?? defaultUtosRecipientId;
  const utosRecipientName =
    activeHelpers.find((h) => h.id === utosRecipientId)?.name ?? "your helper";

  const utos = useUtos({
    toHelperId: utosRecipientId,
    toHelperName: utosRecipientName,
    token: session.token,
    ready: session.status === "authed",
    // A quick utos finished off-shift is worth a token five minutes. Credited
    // to the utos's own real recipient, not whichever helper is "current" --
    // those can differ once a recipient has been explicitly picked.
    onDone: (u) => {
      ledger.record({
        sourceId: u.id,
        kind: "utos",
        title: u.content,
        helperId: u.toHelperId,
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

  const pantryRef = useRef(pantry);
  pantryRef.current = pantry;

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
        // Pantry stock (Closed Gap C23) -- same "any change -> refetch"
        // treatment, on the same channel/filter as tickets/appointments.
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pantry_items",
            filter: `household_id=eq.${session.householdId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            console.log("[Realtime] Received pantry_items table postgres change:", payload);
            pantryRef.current.refresh().catch((err) => {
              console.error("[Realtime] Failed to refresh pantry:", err);
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

    if (utosRecipientId) {
      utosChannel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "quick_utos",
            filter: `recipient_id=eq.${utosRecipientId}`,
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
  }, [utosRecipientId, session.householdId]);

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

  // "Start new day," manual or automatic: clears every active helper's
  // pending Quick Utos household-wide -- not just utosRecipientId's, which
  // is all clearUtosForHelperFn used to cover (KNOWN_GAPS.md C30) -- and
  // rolls the board to targetDate, then refreshes utos so the current
  // recipient's list reflects the clear. Shared by the manual `startNewDay`
  // composite below and the auto-rollover effect further down.
  const runDayRollover = async (
    targetDate: Date,
  ): Promise<{ routinesRespawned: number; utosCleared: boolean }> => {
    const helperIds = activeHelpers.map((h) => h.id);
    const [utosResult, boardResult] = await Promise.all([
      helperIds.length > 0 && session.token
        ? clearAllUtosForHelpersFn({ data: { token: session.token, helperIds } })
        : Promise.resolve(null),
      board.startNewDay(targetDate),
    ]);
    utos.refresh();
    return { routinesRespawned: boardResult.routinesRespawned, utosCleared: !!utosResult };
  };

  // Auto-rollover (KNOWN_GAPS.md C31): a board nobody manually advanced past
  // a real day boundary self-corrects on load/tick via
  // board.rolloverNeededFor, silently, with a passive notice -- not the same
  // blocking confirmation as the manual button, since the day has already
  // moved on by the time anyone's looking. Gated the same way
  // canStartNewDay is on the Pass page (only primary/co managers can
  // actually persist the rollover; a remote-only session leaves the flag set
  // for a real manager session to pick up instead of a guaranteed-403 call).
  //
  // KNOWN_GAPS.md O2: board.rolloverNeededFor is set purely off the device's
  // own Date.now() (see use-task-board.ts), which a manager can't be trusted
  // not to have wrong (bad clock, misconfigured timezone). Rather than poll
  // a server clock continuously (touching use-sim-clock.ts's nowTs, which
  // several other non-destructive features also read), this does one fresh
  // round trip to getServerNowFn right before actually firing the one action
  // that's destructive -- if the server's own day disagrees, the flag is
  // cleared without rolling over, same as a manual dismiss.
  const rollingOverRef = useRef(false);
  // Throttles retries to once per distinct device-perceived day, so a device
  // stuck on a permanently wrong clock doesn't hammer getServerNowFn on
  // every 30s nowTs tick -- cleared once the device's perceived day changes.
  const rejectedRolloverDayRef = useRef<string | null>(null);
  useEffect(() => {
    if (!board.rolloverNeededFor || rollingOverRef.current) return;
    const canAutoRollover =
      session.status === "authed" &&
      (session.adminType === "primary" || session.adminType === "co") &&
      !!session.token;
    if (!canAutoRollover) return;

    const targetDay = toISODate(board.rolloverNeededFor);
    if (rejectedRolloverDayRef.current === targetDay) return;

    rollingOverRef.current = true;
    getServerNowFn({ data: { token: session.token! } })
      .then((res) => {
        const serverToday = new Date(res.serverNowIso);

        if (toISODate(serverToday) <= toISODate(board.simDate)) {
          // Server disagrees the day has moved -- the device's clock was
          // wrong. Expected false-positive path, not an error.
          console.warn(
            `[AppStoreProvider] Auto rollover skipped: device thinks it's ${targetDay}, server says ${toISODate(serverToday)}.`,
          );
          rejectedRolloverDayRef.current = targetDay;
          board.dismissRollover();
          return;
        }

        const daysDiff = Math.round(
          (serverToday.getTime() - board.simDate.getTime()) / 86_400_000,
        );
        if (daysDiff > MAX_PLAUSIBLE_ROLLOVER_DAYS) {
          // Server-confirmed, but an implausibly large jump -- leave
          // rolloverNeededFor set (not cleared) so this doesn't retry every
          // tick; a manager can still catch up manually via "Start new day,"
          // which has no such bound.
          console.warn(
            `[AppStoreProvider] Auto rollover skipped: ${daysDiff}-day jump exceeds the plausible bound -- use "Start new day" manually.`,
          );
          return;
        }

        rejectedRolloverDayRef.current = null;
        return runDayRollover(serverToday).then(({ routinesRespawned, utosCleared }) => {
          toast.info(
            `Bumagong araw habang wala ka — ${routinesRespawned} routine${routinesRespawned === 1 ? "" : "s"} respawned` +
              (utosCleared ? ", mga Quick Utos na-clear." : "."),
          );
        });
      })
      .catch((err) => {
        console.error("[AppStoreProvider] Auto rollover failed:", err);
      })
      .finally(() => {
        rollingOverRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.rolloverNeededFor, board.simDate, session.status, session.adminType, session.token]);

  const value: AppStores = {
    helper,
    helpers,
    activeHelpers,
    session,
    invites,
    pantry,
    schedules,
    vales,
    payslips,
    clock,
    availability,
    ledger,
    board,
    appointments,
    utos,
    utosRecipientId,
    setUtosRecipientId: setPickedUtosHelperId,
    isOnline,
    isOfflineSimulated,
    setOfflineSimulated,
    startNewDay: async () => {
      const target = new Date(board.simDate);
      target.setDate(target.getDate() + 1);
      const { routinesRespawned, utosCleared } = await runDayRollover(target);
      toast.success(
        `Bagong araw! ${routinesRespawned} routine${routinesRespawned === 1 ? "" : "s"} na-respawn` +
          (utosCleared ? ", Quick Utos na-clear." : "."),
      );
    },
    previewNewDay: async () => {
      const target = new Date(board.simDate);
      target.setDate(target.getDate() + 1);
      const helperIds = activeHelpers.map((h) => h.id);
      const pendingUtos =
        helperIds.length > 0 && session.token
          ? (await listUtosForHelpersFn({ data: { token: session.token, helperIds } })).length
          : 0;
      return { pendingUtos, routinesRespawning: board.previewRespawnCount(target) };
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
