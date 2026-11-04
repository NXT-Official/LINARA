import { test, expect } from "@playwright/test";

// Phrases the plan page shows in English; none may appear outside English.
const ENGLISH = [
  /\ba year\b/,
  /\ba month\b/,
  /\bRenews\b/,
  /\bEnds [A-Z][a-z]{2} \d/,
  /\bYour plan\b/,
  /\bChange plan\b/,
];

for (const loc of ["fil", "es", "zh-CN", "ja"]) {
  test(`plan page has no English UI text in ${loc}`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "linara_locale", value: loc, url: baseURL! }]);
    await page.goto("/manager/plan");
    await page.waitForLoadState("networkidle");
    const text = await page.locator("main").innerText();
    for (const re of ENGLISH) expect(text, String(re)).not.toMatch(re);
  });
}
