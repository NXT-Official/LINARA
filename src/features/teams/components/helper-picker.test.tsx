// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Helper } from "@/features/people/people.types";
import { UNKNOWN_HELPER } from "@/features/people/people.utils";

import { LARGE_STAFF } from "../teams.constants";
import { HelperPicker } from "./helper-picker";

afterEach(cleanup);

const helper = (i: number, name: string): Helper => ({
  ...UNKNOWN_HELPER,
  id: `h${i}`,
  name,
  short: name,
  station: "House",
});

describe("HelperPicker", () => {
  it("is the plain select for a small household", () => {
    const onChange = vi.fn();
    render(
      <HelperPicker
        helpers={[helper(1, "Rosa"), helper(2, "Lita")]}
        value=""
        onChange={onChange}
        ariaLabel="Assign to"
        before={[{ value: "", label: "Unassigned" }]}
      />,
    );
    const select = screen.getByLabelText("Assign to");
    expect(select.tagName).toBe("SELECT");
    fireEvent.change(select, { target: { value: "h2" } });
    expect(onChange).toHaveBeenCalledWith("h2");
  });

  it("past LARGE_STAFF, finds someone by typing and picks them", () => {
    const many = Array.from({ length: LARGE_STAFF + 5 }, (_, i) => helper(i, `Helper ${i}`));
    many.push(helper(99, "Marites Santos"));
    const onChange = vi.fn();
    render(
      <HelperPicker
        helpers={many}
        value=""
        onChange={onChange}
        ariaLabel="Assign to"
        before={[{ value: "", label: "Unassigned" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Assign to/ }));
    fireEvent.change(screen.getByLabelText("Search: Assign to"), { target: { value: "mari" } });
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Marites Santos · House"]);
    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenCalledWith("h99");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("chooses with the keyboard, and Escape closes the list without bubbling", () => {
    const many = Array.from({ length: LARGE_STAFF + 1 }, (_, i) => helper(i, `Helper ${i}`));
    const onChange = vi.fn();
    const onOuterKey = vi.fn();
    render(
      <div onKeyDown={onOuterKey}>
        <HelperPicker helpers={many} value="h0" onChange={onChange} ariaLabel="Send to" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));
    const search = screen.getByLabelText("Search: Send to");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    // Sorted by name: "Helper 0", "Helper 1", ... ; one down from Helper 0.
    expect(onChange).toHaveBeenCalledWith("h1");

    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));
    fireEvent.keyDown(screen.getByLabelText("Search: Send to"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onOuterKey.mock.calls.some(([e]) => e.key === "Escape")).toBe(false);
  });
});
