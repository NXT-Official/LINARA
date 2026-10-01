// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CappedList } from "./capped-list";

afterEach(cleanup);

const rows = (n: number) => Array.from({ length: n }, (_, i) => <p key={i}>row {i + 1}</p>);

describe("CappedList", () => {
  it("shows everything, with no toggle, at or under the limit", () => {
    render(<CappedList noun={["task", "tasks"]}>{rows(3)}</CappedList>);
    expect(screen.getAllByText(/^row /)).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the first three and opens the rest on request", () => {
    render(<CappedList noun={["period", "periods"]}>{rows(24)}</CappedList>);
    expect(screen.getAllByText(/^row /)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show 21 more periods" }));
    expect(screen.getAllByText(/^row /)).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByText(/^row /)).toHaveLength(3);
  });

  it("counts one hidden item in the singular, across separate .map() groups", () => {
    render(
      <CappedList noun={["item", "items"]}>
        {rows(2)}
        {[<p key="a">row a</p>, <p key="b">row b</p>]}
      </CappedList>,
    );
    expect(screen.getByRole("button", { name: "Show 1 more item" })).toBeTruthy();
  });
});
