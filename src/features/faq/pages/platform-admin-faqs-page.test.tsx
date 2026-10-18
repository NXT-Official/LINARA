// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listAllFaqsFn = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => vi.fn());
const saveFaqFn = vi.hoisted(() => vi.fn());
const deleteFaqFn = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../faq.actions", () => ({
  listAllFaqsFn,
  saveFaqFn,
  deleteFaqFn,
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/platform-admin/hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: session,
}));

import { PlatformAdminFaqsPage } from "./platform-admin-faqs-page";

afterEach(cleanup);
beforeEach(() => {
  for (const m of [listAllFaqsFn, saveFaqFn, deleteFaqFn, toast.success, toast.error])
    m.mockReset();
  session.mockReturnValue({ status: "admin", token: "t", userId: "u", logOut: vi.fn() });
});

function renderPage() {
  return render(<PlatformAdminFaqsPage />);
}

describe("PlatformAdminFaqsPage", () => {
  it("says admin tools are not on yet when the table is missing", async () => {
    listAllFaqsFn.mockResolvedValue({ available: false, faqs: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Admin tools aren't switched on yet")).toBeTruthy(),
    );
  });

  it("shows the empty state", async () => {
    listAllFaqsFn.mockResolvedValue({ available: true, faqs: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("No FAQs yet")).toBeTruthy());
  });

  it("lists rows with a published pill", async () => {
    listAllFaqsFn.mockResolvedValue({
      available: true,
      faqs: [
        {
          id: "1",
          question: "Q one?",
          answer: "A",
          category: "Help",
          sortOrder: 0,
          published: true,
        },
        {
          id: "2",
          question: "Q two?",
          answer: "A",
          category: "Help",
          sortOrder: 1,
          published: false,
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Q one?")).toBeTruthy());
    expect(screen.getByText("Q two?")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("shows an error state with retry", async () => {
    listAllFaqsFn.mockRejectedValue(new Error("down"));
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

const ONE = {
  id: "1",
  question: "Q one?",
  answer: "A one.",
  category: "Help",
  sortOrder: 0,
  published: true,
};

async function openEditor() {
  listAllFaqsFn.mockResolvedValue({ available: true, faqs: [ONE] });
  renderPage();
  await waitFor(() => expect(screen.getByText("Q one?")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
}

describe("FAQ editor", () => {
  it("shows a field error and does not save an empty question", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Write the question")).toBeTruthy();
    expect(saveFaqFn).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("toasts success only after the save settles", async () => {
    let finish: (v: { available: boolean }) => void = () => {};
    saveFaqFn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveFaqFn).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
    finish({ available: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("FAQ updated"));
  });

  it("shows a thrown error in the alert with no success toast", async () => {
    saveFaqFn.mockRejectedValue(new Error("not allowed"));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("not allowed");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says admin tools are off when the save is unavailable", async () => {
    saveFaqFn.mockResolvedValue({ available: false });
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Admin tools aren't switched on yet.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("FAQ delete confirm", () => {
  async function openConfirm() {
    listAllFaqsFn.mockResolvedValue({ available: true, faqs: [ONE] });
    renderPage();
    await waitFor(() => expect(screen.getByText("Q one?")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  }

  it("toasts only after the delete resolves", async () => {
    deleteFaqFn.mockResolvedValue({ available: true });
    await openConfirm();
    expect(deleteFaqFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1) as HTMLElement);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("FAQ deleted"));
    expect(deleteFaqFn).toHaveBeenCalledWith({ data: { token: "t", id: "1" } });
  });

  it("shows a rejected delete in the alert with no success toast", async () => {
    deleteFaqFn.mockRejectedValue(new Error("not removed"));
    await openConfirm();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1) as HTMLElement);
    expect((await screen.findByRole("alert")).textContent).toBe("not removed");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
