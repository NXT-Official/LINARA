// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordLeaveModal } from "./record-leave-modal";

vi.mock("@/features/tasks/task.actions", () => ({
  countOpenTasksBetweenFn: vi.fn(async () => 0),
}));

const open = (silUnavailable: string | null) =>
  render(
    <RecordLeaveModal
      helperName="Marito"
      helperId="h1"
      token={null}
      defaultDate="2026-10-07"
      silUnavailable={silUnavailable}
      onClose={vi.fn()}
      onRecord={vi.fn(async () => true)}
    />,
  );

const kindSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
const recordButton = () => screen.getByRole("button", { name: "Record leave" });

afterEach(cleanup);

describe("RecordLeaveModal kind", () => {
  it("opens on service incentive leave when there is some", () => {
    open(null);
    expect(kindSelect().value).toBe("sil");
    expect((recordButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("picks nothing when there isn't, and says why", () => {
    open("starts August 15, 2027");
    expect(kindSelect().value).toBe("");
    expect((recordButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Service incentive leave starts August 15, 2027\./)).toBeTruthy();
    const sil = screen.getByRole("option", {
      name: /Service incentive leave/,
    }) as HTMLOptionElement;
    expect(sil.disabled).toBe(true);

    fireEvent.change(kindSelect(), { target: { value: "unpaid" } });
    expect((recordButton() as HTMLButtonElement).disabled).toBe(false);
  });
});
