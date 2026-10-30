// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider, useT } from "@/lib/i18n/locale-context";

import { LanguageMenu } from "./language-menu";

afterEach(() => {
  cleanup();
  document.cookie = "linara_locale=; Max-Age=0; Path=/";
});

function Heading() {
  const t = useT();
  return <h1>{t("common.language.label")}</h1>;
}

function show(initial: "en" | "ja" = "en") {
  return render(
    <LocaleProvider initial={initial}>
      <Heading />
      <LanguageMenu />
    </LocaleProvider>,
  );
}

describe("the language menu", () => {
  it("offers all five languages, each in its own language", () => {
    show();
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["English", "Filipino", "Español", "简体中文", "日本語"]);
  });

  it("switches the page in place and keeps the choice in the cookie", () => {
    show();
    expect(screen.getByRole("heading").textContent).toBe("Language");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ja" } });
    expect(screen.getByRole("heading").textContent).toBe("言語");
    expect(document.cookie).toContain("linara_locale=ja");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("starts from the language the server read", () => {
    show("ja");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("ja");
    expect(screen.getByRole("heading").textContent).toBe("言語");
  });

  it("ignores a value it doesn't know, falling back to English", () => {
    show("ja");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "xx" } });
    expect(screen.getByRole("heading").textContent).toBe("Language");
  });
});
