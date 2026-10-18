// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listAllFaqsFn = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => vi.fn());

vi.mock("../faq.actions", () => ({
  listAllFaqsFn,
  saveFaqFn: vi.fn(),
  deleteFaqFn: vi.fn(),
}));
vi.mock("@/features/platform-admin/hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: session,
}));

import { PlatformAdminFaqsPage } from "./platform-admin-faqs-page";

afterEach(cleanup);
beforeEach(() => {
  listAllFaqsFn.mockReset();
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
