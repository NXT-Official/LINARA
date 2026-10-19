// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listThreadsFn = vi.hoisted(() => vi.fn());

vi.mock("../support.actions", () => ({ listThreadsFn }));

import { SUPPORT_POLL_MS, useSupportThreads } from "./use-support-threads";

const THREAD = {
  id: "t1",
  ref: 7,
  subject: "Billing",
  status: "open",
  createdAt: "2026-10-19T00:00:00Z",
  lastMessageAt: "2026-10-19T00:00:00Z",
  householdUnread: 0,
};

const ARGS = { token: "t", householdId: "h1", ready: true };

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility("visible");
});
beforeEach(() => {
  listThreadsFn.mockReset();
  setVisibility("visible");
});

describe("useSupportThreads", () => {
  it("loads the threads for the household", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [THREAD] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.threads).toHaveLength(1);
    expect(listThreadsFn).toHaveBeenCalledWith({ data: { token: "t", householdId: "h1" } });
  });

  it("is unavailable when the SQL is not applied", async () => {
    listThreadsFn.mockResolvedValue({ available: false, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("is an error when the load throws", async () => {
    listThreadsFn.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("refetches on every 10 s tick", async () => {
    vi.useFakeTimers();
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    renderHook(() => useSupportThreads(ARGS));
    await act(async () => {});
    expect(listThreadsFn).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS);
    });
    expect(listThreadsFn).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS);
    });
    expect(listThreadsFn).toHaveBeenCalledTimes(3);
  });

  it("does not refetch while the tab is hidden", async () => {
    vi.useFakeTimers();
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    renderHook(() => useSupportThreads(ARGS));
    await act(async () => {});
    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS * 3);
      window.dispatchEvent(new Event("focus"));
    });
    expect(listThreadsFn).toHaveBeenCalledTimes(1);
  });

  it("refetches when the window regains focus", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { result } = renderHook(() => useSupportThreads(ARGS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(listThreadsFn).toHaveBeenCalledTimes(2);
  });

  it("stops polling on unmount", async () => {
    vi.useFakeTimers();
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    const { unmount } = renderHook(() => useSupportThreads(ARGS));
    await act(async () => {});
    unmount();
    await vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS * 2);
    expect(listThreadsFn).toHaveBeenCalledTimes(1);
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

  it("does nothing until it is ready", () => {
    renderHook(() => useSupportThreads({ ...ARGS, ready: false }));
    expect(listThreadsFn).not.toHaveBeenCalled();
  });
});
