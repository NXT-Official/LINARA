// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GroceryContext } from "../grocery-context";
import type { GroceryContextValue, GroceryReceipt } from "../grocery.types";
import { ReceiptSlot } from "./receipt-slot";

const receipt = (over: Partial<GroceryReceipt>): GroceryReceipt => ({
  id: Math.random().toString(36),
  url: "https://example.test/r.jpg",
  thumbUrl: null,
  createdAt: "2026-10-07T03:00:00Z",
  byName: null,
  runId: null,
  ...over,
});

const show = (props: { runId?: string }) =>
  render(
    <GroceryContext.Provider
      value={
        {
          receipts: [
            receipt({ byName: "Kuya Marito" }),
            receipt({ byName: "Ate Marites", runId: "r1" }),
          ],
          receiptPhoto: null,
        } as unknown as GroceryContextValue
      }
    >
      <ReceiptSlot {...props} />
    </GroceryContext.Provider>,
  );

afterEach(cleanup);

describe("ReceiptSlot", () => {
  it("lists only receipts that belong to no run on the Needed list", () => {
    show({});
    expect(screen.getByText("From Marito")).toBeTruthy();
    expect(screen.queryByText("From Marites")).toBeNull();
  });

  it("lists a run's own receipts inside the run", () => {
    show({ runId: "r1" });
    expect(screen.getByText("From Marites")).toBeTruthy();
    expect(screen.queryByText("From Marito")).toBeNull();
  });
});
