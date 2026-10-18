// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listThreadsFn = vi.hoisted(() => vi.fn());
const channelHandlers = vi.hoisted(() => ({ list: [] as { table: string; cb: () => void }[] }));
const removeChannel = vi.hoisted(() => vi.fn());
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const setAuth = vi.hoisted(() => vi.fn());

vi.mock("../support.actions", () => ({ listThreadsFn }));
vi.mock("@/lib/supabase", () => {
  const channel = {
    on(_type: string, filter: { table: string }, cb: () => void) {
      channelHandlers.list.push({ table: filter.table, cb });
      return channel;
    },
    subscribe() {
      calls.order.push("subscribe");
      return channel;
    },
  };
  return {
    createAuthedClient: () => ({
      channel: () => {
        calls.order.push("channel");
        return channel;
      },
      removeChannel,
      realtime: {
        setAuth: (token: string) => {
          calls.order.push(`setAuth:${token}`);
          return setAuth(token);
        },
      },
    }),
  };
});

import { useSupportThreads } from "./use-support-threads";

const THREAD = {
  id: "t1",
  householdId: "h1",
  householdName: null,
  subject: "Billing",
  status: "open",
  createdAt: "2026-10-19T00:00:00Z",
  lastMessageAt: "2026-10-19T00:00:00Z",
  householdUnread: 0,
  platformAdminUnread: 0,
};

const ARGS = { token: "t", scope: "household" as const, householdId: "h1", ready: true };

afterEach(cleanup);
beforeEach(() => {
  listThreadsFn.mockReset();
  removeChannel.mockReset();
  setAuth.mockReset();
  setAuth.mockResolvedValue(undefined);
  channelHandlers.list = [];
  calls.order = [];
});

describe("useSupportThreads", () => {
  it("loads the threads", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [THREAD] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.threads).toHaveLength(1);
  });

  it("is unavailable when the SQL isn't applied", async () => {
    listThreadsFn.mockResolvedValue({ available: false, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("is an error when the load throws", async () => {
    listThreadsFn.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("refreshes on a realtime event from either table", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(channelHandlers.list.map((h) => h.table)).toEqual([
      "support_threads",
      "support_messages",
    ]);

    listThreadsFn.mockResolvedValue({ available: true, threads: [THREAD] });
    await act(async () => {
      channelHandlers.list[1].cb();
    });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(listThreadsFn).toHaveBeenCalledTimes(2);
  });

  it("ignores an older response that resolves after a newer one", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let resolveOld: (v: unknown) => void = () => {};
    listThreadsFn.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    listThreadsFn.mockResolvedValueOnce({
      available: true,
      threads: [{ ...THREAD, subject: "Newer" }],
    });
    await act(async () => {
      void result.current.refresh();
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.threads[0]?.subject).toBe("Newer"));
    await act(async () => {
      resolveOld({ available: true, threads: [{ ...THREAD, subject: "Older" }] });
    });
    expect(result.current.threads[0].subject).toBe("Newer");
  });

  it("collapses the two events of one message into one refetch", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      channelHandlers.list[0].cb();
      channelHandlers.list[1].cb();
    });
    await waitFor(() => expect(listThreadsFn).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 250));
    expect(listThreadsFn).toHaveBeenCalledTimes(2);
  });

  it("gives realtime the token before joining, so the tables' RLS lets events through", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(setAuth).toHaveBeenCalledWith("t");
    expect(calls.order).toEqual(["setAuth:t", "channel", "subscribe"]);
  });

  it("still loads when realtime refuses the token", async () => {
    setAuth.mockRejectedValue(new Error("socket down"));
    listThreadsFn.mockResolvedValue({ available: true, threads: [THREAD] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.threads).toHaveLength(1);
  });

  it("removes the channel on unmount", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result, unmount } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("does nothing until it is ready", () => {
    renderHook(() => useSupportThreads({ ...ARGS, ready: false }));
    expect(listThreadsFn).not.toHaveBeenCalled();
    expect(channelHandlers.list).toHaveLength(0);
  });
});
