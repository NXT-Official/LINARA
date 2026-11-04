// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
// The Supabase client is the network boundary; nothing here reaches it.
vi.mock("@/lib/supabase", () => ({ supabaseClient: {}, createAuthedClient: vi.fn() }));
vi.mock("@/features/dashboard/app-store-context", async (orig) => ({
  ...(await orig<typeof import("@/features/dashboard/app-store-context")>()),
  useAppStores: () => ({
    teams: { available: false, locked: false, teams: [], labels: [], labelIdsByHelper: new Map() },
    session: { adminType: "primary", households: [] },
  }),
}));

import type { Helper } from "@/features/people/people.types";

import { ManagerPassTab, type ManagerPassTabProps } from "./manager-pass-tab";

afterEach(cleanup);

const noop = () => {};
function props(change: Partial<ManagerPassTabProps> = {}): ManagerPassTabProps {
  return {
    active: [],
    upcoming: [],
    suggestions: [],
    blocked: [],
    pastDue: [],
    nowTs: Date.parse("2026-10-29T01:00:00Z"),
    pendingVales: [],
    flaggedInvites: [],
    owedPay: [],
    disputedPayments: [],
    notices: [],
    pendingLeave: [],
    helpers: [],
    activeHelpers: [],
    shownDate: new Date(2026, 9, 29),
    isToday: true,
    dayLoading: false,
    onShiftDay: noop,
    onToday: noop,
    boardClosed: false,
    rosaStatus: { kind: "off" } as unknown as ManagerPassTabProps["rosaStatus"],
    helperName: "your helper",
    authorName: "Test Aira",
    isRemote: false,
    canEndDay: true,
    onEndDay: noop,
    onReopenDay: noop,
    onReschedule: noop,
    onEditTask: noop,
    onCancelTask: noop,
    onDecideVale: noop,
    onResolveFlag: noop,
    onApproveSuggestion: noop,
    onDismissSuggestion: noop,
    onNewTask: noop,
    quickUtos: <div>Quick utos box</div>,
    view: "line",
    onViewChange: noop,
    ...change,
  };
}

describe("a household with no helpers yet", () => {
  it("leads with one next step: invite a helper", () => {
    render(<ManagerPassTab {...props()} />);
    expect(screen.getByText("No helpers yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite a helper" }).getAttribute("href")).toBe(
      "/manager/people",
    );
  });

  it("shows no availability chip for a helper who doesn't exist", () => {
    render(<ManagerPassTab {...props()} />);
    expect(screen.queryByText(/your helper/)).toBeNull();
  });

  it("a remote admin isn't sent to invite (they can't)", () => {
    render(<ManagerPassTab {...props({ isRemote: true })} />);
    expect(screen.getByText("No helpers yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Invite a helper" })).toBeNull();
  });

  it("never uses an em dash in what it says", () => {
    const { container } = render(<ManagerPassTab {...props()} />);
    expect(container.textContent).not.toMatch(/—/);
  });
});

describe("with a helper", () => {
  const rosa: Helper = {
    id: "h1",
    name: "Rosa Santos",
    short: "Rosa",
    initials: "RS",
    station: "Yaya",
    shift: "7:00-16:00",
    restDay: "Sun",
    monthlyRate: 8000,
    paydayInterval: "monthly",
    phone: "",
    defaultResolution: null,
    effectiveResolution: "rest",
    teamId: null,
  } as Helper;

  it("no invite prompt", () => {
    render(<ManagerPassTab {...props({ helpers: [rosa], activeHelpers: [rosa] })} />);
    expect(screen.queryByText("No helpers yet")).toBeNull();
  });
});
