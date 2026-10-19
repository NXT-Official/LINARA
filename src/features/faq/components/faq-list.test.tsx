// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Faq } from "../faq.types";
import { FaqList } from "./faq-list";

afterEach(cleanup);

const faq = (over: Partial<Faq>): Faq => ({
  id: "1",
  question: "What is Linara?",
  answer: "A home.",
  category: "General",
  sortOrder: 0,
  ...over,
});

describe("FaqList", () => {
  const faqs = [
    faq({ id: "1" }),
    faq({ id: "2", question: "Who sees my notes?", category: "Privacy" }),
    faq({ id: "3", question: "Is pay shown?", category: "Pay" }),
    faq({ id: "4", question: "Second general?", sortOrder: 1 }),
  ];

  it("renders one group per category", () => {
    render(<FaqList faqs={faqs} contactHref="/manager/help" />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "General",
      "Privacy",
      "Pay",
    ]);
  });

  it("gives every question an anchor id from its text", () => {
    const { container } = render(<FaqList faqs={faqs} contactHref="/manager/help" />);
    expect(container.querySelector("#what-is-linara")).not.toBeNull();
    expect(container.querySelector("#who-sees-my-notes")).not.toBeNull();
  });

  it("links to the contact page", () => {
    render(<FaqList faqs={faqs} contactHref="/manager/help" />);
    expect(screen.getByRole("link", { name: "Still stuck? Message us" }).getAttribute("href")).toBe(
      "/manager/help",
    );
  });
});
