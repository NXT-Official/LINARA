// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadFaqsFn = vi.hoisted(() => vi.fn());
const listThreadsFn = vi.hoisted(() => vi.fn());
const listMessagesFn = vi.hoisted(() => vi.fn());
const openThreadFn = vi.hoisted(() => vi.fn());
const getPlatformSettingsFn = vi.hoisted(() => vi.fn());
const useAppStores = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/features/faq/faq.actions", () => ({ loadFaqsFn }));
vi.mock("../support.actions", () => ({
  listThreadsFn,
  listMessagesFn,
  openThreadFn,
  postMessageFn: vi.fn(),
  markReadFn: vi.fn(),
  setThreadStatusFn: vi.fn(),
}));
vi.mock("@/features/billing/plan.actions", () => ({ getPlatformSettingsFn }));
vi.mock("@/features/dashboard/app-store-context", () => ({ useAppStores }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase", () => {
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };
  return { createAuthedClient: () => ({ channel: () => channel, removeChannel: vi.fn() }) };
});

import { ManagerHelpPage } from "./manager-help-page";

const FAQ = {
  id: "f1",
  question: "Who sees my notes?",
  answer: "Only you.",
  category: "Privacy",
  sortOrder: 1,
  published: true,
};

afterEach(cleanup);
beforeEach(() => {
  for (const m of [loadFaqsFn, listThreadsFn, listMessagesFn, openThreadFn, getPlatformSettingsFn])
    m.mockReset();
  useAppStores.mockReturnValue({ session: { token: "tok", householdId: "h1" } });
  loadFaqsFn.mockResolvedValue({ faqs: [FAQ], source: "fallback" });
  listMessagesFn.mockResolvedValue({ available: true, messages: [] });
  getPlatformSettingsFn.mockResolvedValue({
    available: true,
    settings: { supportEmail: "help@linara.test" },
  });
});

describe("ManagerHelpPage", () => {
  it("shows the answers and the empty state", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    render(<ManagerHelpPage />);
    expect(await screen.findByText("Who sees my notes?")).toBeTruthy();
    expect(await screen.findByText("No messages yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New message" })).toBeTruthy();
  });

  it("points the FAQ's contact link at the message section", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    render(<ManagerHelpPage />);
    const link = await screen.findByText("Still stuck? Message us");
    expect(link.getAttribute("href")).toBe("#message-us");
  });

  it("says chat is off and gives the support email when the SQL isn't applied", async () => {
    listThreadsFn.mockResolvedValue({ available: false, threads: [] });
    render(<ManagerHelpPage />);
    expect(
      await screen.findByText("Support chat isn't switched on yet; email help@linara.test"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New message" })).toBeNull();
  });

  it("falls back to 'us' when there is no support email", async () => {
    listThreadsFn.mockResolvedValue({ available: false, threads: [] });
    getPlatformSettingsFn.mockResolvedValue({ available: true, settings: { supportEmail: null } });
    render(<ManagerHelpPage />);
    expect(await screen.findByText("Support chat isn't switched on yet; email us")).toBeTruthy();
  });

  it("offers a retry when the threads fail to load", async () => {
    listThreadsFn.mockRejectedValue(new Error("boom"));
    render(<ManagerHelpPage />);
    expect(await screen.findByText("Your messages didn't load.")).toBeTruthy();
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No messages yet")).toBeTruthy();
  });

  it("opens a thread with a subject and message", async () => {
    listThreadsFn.mockResolvedValue({ available: true, threads: [] });
    openThreadFn.mockResolvedValue({ available: true, threadId: "t9" });
    render(<ManagerHelpPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Pay run" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "It is stuck" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(openThreadFn).toHaveBeenCalledWith({
        data: { token: "tok", householdId: "h1", subject: "Pay run", body: "It is stuck" },
      }),
    );
  });
});
