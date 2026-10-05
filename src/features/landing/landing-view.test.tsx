import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  LANDING_FALLBACK,
  type LandingContent,
  normalizeLandingContent,
} from "@/features/landing/landing-content";
import { LandingView } from "@/features/landing/landing-view";

async function render(content: LandingContent) {
  const root = createRootRoute({ component: () => <LandingView content={content} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const PRE_CMS = readFileSync(
  new URL("./__fixtures__/landing.pre-cms.html", import.meta.url),
  "utf8",
).trim();

/** Markup of the two-lenses section; "" when the page has none. */
function lensesSection(html: string) {
  return /<section[^>]*aria-labelledby="lenses-title".*?<\/section>/s.exec(html)?.[0] ?? "";
}

/** Heading levels in document order, e.g. [1, 2, 3, 3]. */
function headingLevels(html: string) {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

const TWO_COLUMNS = "lg:grid-cols-2";

/** Every on/off mix of the three sections an editor can hide. */
const HIDDEN_MIXES = [false, true].flatMap((kitchen) =>
  [false, true].flatMap((lenses) => [false, true].map((account) => ({ kitchen, lenses, account }))),
);

describe("LandingView", () => {
  it("renders the pre-CMS homepage byte-for-byte from the fallback copy", async () => {
    expect(await render(LANDING_FALLBACK)).toBe(PRE_CMS);
  });

  it("renders Studio text and escapes HTML-looking input", async () => {
    const html = await render(
      normalizeLandingContent({
        hero: { headlineLine1: "<img src=x onerror=alert(1)>", ctaLabel: "Try it" },
      }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain(">Try it</a>");
  });

  it("keeps link destinations code-owned whatever the labels say", async () => {
    const html = await render(
      normalizeLandingContent({
        header: { ctaLabel: "https://evil.example" },
        footer: { privacyLabel: "javascript:alert(1)" },
      }),
    );
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/manager/pass", "/manager/pass", "/privacy", "/terms"]);
  });

  it("hides sections the Studio switched off", async () => {
    const html = await render(normalizeLandingContent({ kitchen: { hidden: true } }));
    expect(html).not.toContain("kitchen-title");
    expect(html).toContain("lenses-title");
  });

  it("drops the two-lenses section only when both columns are hidden", async () => {
    const onlyAccount = await render(normalizeLandingContent({ lenses: { hidden: true } }));
    expect(onlyAccount).toContain(LANDING_FALLBACK.account.heading);
    // The account card names the section when it stands alone.
    expect(onlyAccount).toContain('id="lenses-title"');

    const neither = await render(
      normalizeLandingContent({ lenses: { hidden: true }, account: { hidden: true } }),
    );
    expect(neither).not.toContain("lenses-title");
    // No empty wrapper either: the footer follows the kitchen section directly.
    expect(lensesSection(neither)).toBe("");
    expect(neither.match(/<section/g)).toHaveLength(2);
    expect(neither).toContain("</section><footer");
    expect(neither).not.toMatch(/<(section|div)[^>]*><\/(section|div)>/);
  });

  it("sets the lenses and the account card side by side when both are shown", async () => {
    const section = lensesSection(await render(LANDING_FALLBACK));
    expect(section).toContain(`<div class="grid gap-12 ${TWO_COLUMNS} lg:items-center">`);
    expect(headingLevels(section)).toEqual([2, 3, 3, 3]);
  });

  it("gives the account card the row and the section's h2 when it stands alone", async () => {
    const section = lensesSection(
      await render(normalizeLandingContent({ lenses: { hidden: true } })),
    );
    // Half of a two-column grid would leave the other half of the row blank.
    expect(section).not.toContain(TWO_COLUMNS);
    expect(section).toContain('<div class="mx-auto max-w-2xl">');
    expect(section).toContain('<h2 id="lenses-title"');
    expect(section).toContain(`>${LANDING_FALLBACK.account.heading}</h2>`);
    expect(headingLevels(section)).toEqual([2]);
  });

  it("gives the lenses the row when the account card is hidden", async () => {
    const section = lensesSection(
      await render(normalizeLandingContent({ account: { hidden: true } })),
    );
    expect(section).not.toContain(TWO_COLUMNS);
    expect(section).toContain('<div class="mx-auto max-w-2xl">');
    expect(section).not.toContain(LANDING_FALLBACK.account.heading);
    expect(headingLevels(section)).toEqual([2, 3, 3]);
  });

  it.each(HIDDEN_MIXES)(
    "skips no heading level with hidden kitchen=$kitchen lenses=$lenses account=$account",
    async ({ kitchen, lenses, account }) => {
      const levels = headingLevels(
        await render(
          normalizeLandingContent({
            kitchen: { hidden: kitchen },
            lenses: { hidden: lenses },
            account: { hidden: account },
          }),
        ),
      );
      expect(levels[0]).toBe(1);
      const steps = levels.slice(1).map((level, i) => level - levels[i]);
      expect(Math.max(0, ...steps)).toBeLessThanOrEqual(1);
    },
  );

  it("numbers the lenses by position and renders the chosen icon", async () => {
    const html = await render(
      normalizeLandingContent({
        kitchen: { cards: [{ _key: "a", icon: "wallet", title: "Pay", body: "Clear pay." }] },
        lenses: {
          items: [
            { _key: "x", title: "A", body: "a" },
            { _key: "y", title: "B", body: "b" },
            { _key: "z", title: "C", body: "c" },
          ],
        },
      }),
    );
    expect(html).toContain("lucide-wallet");
    expect(html).toMatch(/text-xs font-bold">3<\/div>/);
  });
});
