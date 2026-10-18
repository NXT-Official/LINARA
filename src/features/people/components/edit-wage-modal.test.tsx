// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PayPeriod } from "@/features/pay/pay.types";

import { EditWageModal } from "./edit-wage-modal";

afterEach(cleanup);

const october = (paid = false): PayPeriod => ({
  fullStart: "2026-10-01",
  fullEnd: "2026-10-15",
  workedStart: "2026-10-01",
  workedEnd: "2026-10-15",
  isCurrent: true,
  isFinal: false,
  payslipId: paid ? "slip-1" : null,
  payslipStatus: paid ? "succeeded" : null,
  payslipProvider: null,
  payslipAck: null,
  monthlyRate: 8000,
});

const save = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save wage" }));
  });

describe("EditWageModal (KNOWN_GAPS O50)", () => {
  it("starts a new wage at this cutoff unless told the next one", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EditWageModal
        name="Rosa"
        initialWagePHP={8000}
        currentPeriod={october()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText("Oct 1 – Oct 15")).toBeTruthy();
    expect(screen.getByText("From Oct 16")).toBeTruthy();
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith(8000, "2026-10-01");

    fireEvent.click(screen.getByRole("radio", { name: /Next cutoff/ }));
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith(8000, "2026-10-16");
  });

  it("offers only the next cutoff once this one is paid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EditWageModal
        name="Rosa"
        initialWagePHP={8000}
        currentPeriod={october(true)}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const thisOne = screen.getByRole("radio", { name: /This cutoff/ }) as HTMLInputElement;
    expect(thisOne.disabled).toBe(true);
    expect(screen.getByText("Already paid")).toBeTruthy();
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith(8000, "2026-10-16");
  });

  it("asks nothing for an invite with no pay period yet", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EditWageModal name="Rosa" initialWagePHP={8000} onClose={() => {}} onSubmit={onSubmit} />,
    );
    expect(screen.queryByText("Starts from")).toBeNull();
    await save();
    expect(onSubmit).toHaveBeenLastCalledWith(8000, undefined);
  });
});
