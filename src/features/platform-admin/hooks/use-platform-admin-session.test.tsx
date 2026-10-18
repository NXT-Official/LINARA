// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

import { usePlatformAdminFlag, usePlatformAdminSession } from "./use-platform-admin-session";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  readToken: vi.fn<() => string | null>(),
  readUserId: vi.fn<() => string | null>(),
  renew: vi.fn(),
  clear: vi.fn(),
  isDue: vi.fn<(jwt: string) => boolean>(),
  ask: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/features/people/hooks/use-session", () => ({
  readStoredManagerToken: mocks.readToken,
  readStoredManagerUserId: mocks.readUserId,
  renewStoredSession: mocks.renew,
  clearStoredManagerSession: mocks.clear,
}));
vi.mock("@/features/people/people.utils", () => ({ isDueForRenewal: mocks.isDue }));
vi.mock("../platform-admin.actions", () => ({ amIPlatformAdminFn: mocks.ask }));

// The answer cache is module-scope per token, so each test uses its own token.
let n = 0;
const freshToken = () => `tok-${(n += 1)}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.readUserId.mockReturnValue("user-1");
  mocks.isDue.mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("usePlatformAdminSession", () => {
  it("is anon with no stored token", async () => {
    mocks.readToken.mockReturnValue(null);
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("anon"));
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("renews a due token first and asks with the new one", async () => {
    const token = freshToken();
    mocks.readToken.mockReturnValue(token);
    mocks.isDue.mockReturnValue(true);
    mocks.renew.mockResolvedValue({ status: "ok", token: `renewed-${token}` });
    mocks.ask.mockResolvedValue({ available: true, isPlatformAdmin: true });
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("admin"));
    expect(mocks.ask).toHaveBeenCalledWith({ data: { token: `renewed-${token}` } });
    expect(result.current.token).toBe(`renewed-${token}`);
    expect(result.current.userId).toBe("user-1");
  });

  it("clears the session and is anon when the renewal has expired", async () => {
    mocks.readToken.mockReturnValue(freshToken());
    mocks.isDue.mockReturnValue(true);
    mocks.renew.mockResolvedValue({ status: "expired" });
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("anon"));
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("is unavailable when the RPC is missing", async () => {
    mocks.readToken.mockReturnValue(freshToken());
    mocks.ask.mockResolvedValue({ available: false, isPlatformAdmin: false });
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("is error when the RPC throws, and retry asks again", async () => {
    mocks.readToken.mockReturnValue(freshToken());
    mocks.ask.mockRejectedValueOnce(new Error("network"));
    mocks.ask.mockResolvedValueOnce({ available: true, isPlatformAdmin: true });
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("admin"));
    expect(mocks.ask).toHaveBeenCalledTimes(2);
  });

  it("is admin or not_admin by the answer", async () => {
    mocks.readToken.mockReturnValue(freshToken());
    mocks.ask.mockResolvedValue({ available: true, isPlatformAdmin: true });
    const yes = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(yes.result.current.status).toBe("admin"));

    mocks.readToken.mockReturnValue(freshToken());
    mocks.ask.mockResolvedValue({ available: true, isPlatformAdmin: false });
    const no = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(no.result.current.status).toBe("not_admin"));
  });

  it("asks once per token across two mounts", async () => {
    mocks.readToken.mockReturnValue(freshToken());
    mocks.ask.mockResolvedValue({ available: true, isPlatformAdmin: true });
    const a = renderHook(() => usePlatformAdminSession());
    const b = renderHook(() => usePlatformAdminFlag());
    await waitFor(() => expect(a.result.current.status).toBe("admin"));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(mocks.ask).toHaveBeenCalledTimes(1);
  });

  it("logOut clears the stored session and the cookie, then goes to /login", async () => {
    mocks.readToken.mockReturnValue(null);
    document.cookie = `${SIGNED_IN_COOKIE}=1; Path=/`;
    mocks.clear.mockImplementation(() => {
      document.cookie = `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0`;
    });
    const { result } = renderHook(() => usePlatformAdminSession());
    await waitFor(() => expect(result.current.status).toBe("anon"));
    act(() => result.current.logOut());
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(document.cookie).not.toContain(`${SIGNED_IN_COOKIE}=1`);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
  });
});

describe("usePlatformAdminFlag", () => {
  it("renews a due token before asking, and is false for a non-admin", async () => {
    const token = freshToken();
    mocks.readToken.mockReturnValue(token);
    mocks.isDue.mockReturnValue(true);
    mocks.renew.mockResolvedValue({ status: "ok", token: `r-${token}` });
    mocks.ask.mockResolvedValue({ available: true, isPlatformAdmin: false });
    const { result } = renderHook(() => usePlatformAdminFlag());
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith({ data: { token: `r-${token}` } }));
    expect(result.current).toBe(false);
  });
});
