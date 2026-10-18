// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listMessagesFn = vi.hoisted(() => vi.fn());
const postMessageFn = vi.hoisted(() => vi.fn());
const markReadFn = vi.hoisted(() => vi.fn());
const setThreadStatusFn = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../support.actions", () => ({
  listMessagesFn,
  postMessageFn,
  markReadFn,
  setThreadStatusFn,
}));
vi.mock("sonner", () => ({ toast }));

import type { SupportThread } from "../support.types";
import { ThreadView } from "./thread-view";

const THREAD: SupportThread = {
  id: "t1",
  householdId: "h1",
  householdName: "Cruz home",
  subject: "Billing question",
  status: "open",
  createdAt: "2026-10-19T00:00:00Z",
  lastMessageAt: "2026-10-19T00:00:00Z",
  householdUnread: 1,
  platformAdminUnread: 0,
};

const MESSAGES = [
  {
    id: "m1",
    threadId: "t1",
    authorId: "u1",
    fromPlatformAdmin: false,
    body: "Hello there",
    createdAt: "2026-10-19T01:00:00Z",
  },
  {
    id: "m2",
    threadId: "t1",
    authorId: "a1",
    fromPlatformAdmin: true,
    body: "How can we help",
    createdAt: "2026-10-19T02:00:00Z",
  },
];

afterEach(cleanup);
beforeEach(() => {
  for (const m of [listMessagesFn, postMessageFn, markReadFn, setThreadStatusFn]) m.mockReset();
  toast.error.mockReset();
  listMessagesFn.mockResolvedValue({ available: true, messages: MESSAGES });
  postMessageFn.mockResolvedValue({ available: true });
  markReadFn.mockResolvedValue({ available: true });
  setThreadStatusFn.mockResolvedValue({ available: true });
});

function renderView(me: "household" | "platform_admin" = "household", thread = THREAD) {
  const onChanged = vi.fn();
  render(<ThreadView token="tok" thread={thread} me={me} onChanged={onChanged} />);
  return onChanged;
}

describe("ThreadView", () => {
  it("shows the messages and marks the thread read on open", async () => {
    renderView();
    expect(await screen.findByText("Hello there")).toBeTruthy();
    expect(screen.getByText("How can we help")).toBeTruthy();
    await waitFor(() =>
      expect(markReadFn).toHaveBeenCalledWith({ data: { token: "tok", threadId: "t1" } }),
    );
  });

  it("sends on Enter, clears the composer and calls onChanged", async () => {
    const onChanged = renderView();
    await screen.findByText("Hello there");
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Thanks" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(postMessageFn).toHaveBeenCalledWith({
        data: { token: "tok", threadId: "t1", body: "Thanks" },
      }),
    );
    await waitFor(() => expect(box.value).toBe(""));
    expect(onChanged).toHaveBeenCalled();
  });

  it("does not send on Shift+Enter", async () => {
    renderView();
    await screen.findByText("Hello there");
    const box = screen.getByLabelText("Message");
    fireEvent.change(box, { target: { value: "line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(postMessageFn).not.toHaveBeenCalled();
  });

  it("does not send an empty message", async () => {
    renderView();
    await screen.findByText("Hello there");
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    expect(postMessageFn).not.toHaveBeenCalled();
  });

  it("keeps the text and says so when sending fails", async () => {
    postMessageFn.mockRejectedValue(new Error("nope"));
    renderView();
    await screen.findByText("Hello there");
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Thanks" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(box.value).toBe("Thanks");
  });

  it("offers Close to a platform admin and Reopen on a closed thread", async () => {
    const onChanged = renderView("platform_admin");
    await screen.findByText("Hello there");
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
    await waitFor(() =>
      expect(setThreadStatusFn).toHaveBeenCalledWith({
        data: { token: "tok", threadId: "t1", status: "closed" },
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    cleanup();
    renderView("platform_admin", { ...THREAD, status: "closed" });
    expect(await screen.findByRole("button", { name: "Reopen conversation" })).toBeTruthy();
  });

  it("drops a late response for the previous thread", async () => {
    let resolveA: (v: unknown) => void = () => {};
    listMessagesFn.mockReturnValueOnce(new Promise((r) => (resolveA = r)));
    const other = { ...THREAD, id: "t2", subject: "Other", householdUnread: 0 };
    const { rerender } = render(
      <ThreadView token="tok" thread={THREAD} me="household" onChanged={vi.fn()} />,
    );
    listMessagesFn.mockResolvedValueOnce({
      available: true,
      messages: [{ ...MESSAGES[0], id: "mb", threadId: "t2", body: "From B" }],
    });
    rerender(<ThreadView token="tok" thread={other} me="household" onChanged={vi.fn()} />);
    expect(await screen.findByText("From B")).toBeTruthy();
    resolveA({ available: true, messages: MESSAGES });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Hello there")).toBeNull();
    expect(screen.getByText("From B")).toBeTruthy();
  });

  it("starts a keyed switch with an empty composer", async () => {
    const other = { ...THREAD, id: "t2", subject: "Other", householdUnread: 0 };
    const { rerender } = render(
      <ThreadView key="t1" token="tok" thread={THREAD} me="household" onChanged={vi.fn()} />,
    );
    await screen.findByText("Hello there");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "for A" } });
    rerender(<ThreadView key="t2" token="tok" thread={other} me="household" onChanged={vi.fn()} />);
    await screen.findByText("Hello there");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
  });

  it("toasts and does not refresh when the status change is unavailable", async () => {
    setThreadStatusFn.mockResolvedValue({ available: false });
    const onChanged = renderView("platform_admin");
    await screen.findByText("Hello there");
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("gives a household no Close button", async () => {
    renderView("household");
    await screen.findByText("Hello there");
    expect(screen.queryByRole("button", { name: "Close conversation" })).toBeNull();
  });
});
