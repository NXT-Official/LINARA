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
  });

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
