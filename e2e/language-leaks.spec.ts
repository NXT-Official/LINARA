import { expect, test } from "@playwright/test";

// Every manager screen, in the two languages that share no letters with English,
// must show no English UI text. Plan names and descriptions come from the
// database (marketing's words), so they are allowed.
const ROUTES = [
  "/manager/pass",
  "/manager/schedule",
  "/manager/pantry",
  "/manager/money",
  "/manager/people",
  "/manager/plan",
];
const ALLOWED = [
  /^(Linara|GCash|Maya|Xendit|PHP|QR Ph|SSS|PhilHealth|Pag-IBIG)$/i,
  /^Everything in (Normal|Free)/,
  /^RA \d+/,
  // Language names are shown in their own language on purpose.
  /^(English|Filipino)$/,
  // Plan names and descriptions are the catalog's (marketing's words).
  /^(Free|Normal|Premium|Extra household|Extra kasambahay)$/,
  // Household and people names in the dev project are data, not UI.
  /^(QA |Test )/,
];

for (const loc of ["zh-CN", "ja"]) {
  test(`no English UI text in ${loc}`, async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    await context.addCookies([{ name: "linara_locale", value: loc, url: baseURL! }]);
    const found = new Set<string>();
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const tabs = page.getByRole("tab");
      const n = await tabs.count();
      for (let i = -1; i < n; i++) {
        if (i >= 0) {
          await tabs
            .nth(i)
            .click()
            .catch(() => {});
          await page.waitForTimeout(400);
        }
        const text = await page.evaluate(() => document.body.innerText);
        for (const line of text.split("\n")) {
          const l = line.trim();
          if (l.length < 4 || !/^[\x20-\x7e…·–—’“”₱]+$/.test(l)) continue;
          if (/^[\d\s:.,₱%/+\-–—·()]+$/.test(l) || ALLOWED.some((re) => re.test(l))) continue;
          found.add(`${route} | ${l.slice(0, 120)}`);
        }
      }
    }
    expect([...found]).toEqual([]);
  });
}
