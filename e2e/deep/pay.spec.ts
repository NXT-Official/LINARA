import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { AUTH_FILE } from "../../playwright.config";
import {
  HAS_MANAGER,
  HAS_STAFF,
  STAFF_EMAIL,
  STAFF_PASSWORD,
  settle,
  watchErrors,
} from "../helpers";

/**
 * Paying her GCash directly, end to end (KNOWN_GAPS O35): the test helper
 * saves a GCash number (as herself, through the API, as her app does), the
 * test manager opens Pay, sees that number and the payslip's own amount,
 * and records "I've sent it". The payslip is checked, then withdrawn, and
 * her number is deleted again, so nothing is left on either side. Skips if
 * nothing is unpaid for her. Linara moves no money.
 */
test.skip(!HAS_MANAGER || !HAS_STAFF, "Needs the test manager and test staff accounts (.env.e2e).");

const NUMBER = "09170000001";
const NAME = "QA deep test (delete me)";
const REF = "0000000000000";

function env() {
  if (!process.env.SUPABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY aren't set (.env).");
  return { url, key };
}

async function staffSession() {
  const { url, key } = env();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!body.access_token || !body.user) throw new Error("Couldn't sign in the test staff account");
  return { token: body.access_token, userId: body.user.id };
}

function managerToken() {
  const state = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  return state.origins.flatMap((o) => o.localStorage).find((i) => i.name === "linara_manager_token")
    ?.value;
}

async function rest(token: string, path: string, init: RequestInit = {}) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Withdraws this test's payments and deletes her test number. */
async function cleanUp() {
  const staff = await staffSession();
  const manager = managerToken();
  if (manager) {
    const left = (await rest(
      manager,
      `payslips?select=id&payout_provider=eq.manual&helper_ack=eq.pending&manual_note=like.${encodeURIComponent(`*${REF}*`)}`,
    )) as { id: string }[];
    for (const p of left) {
      await rest(manager, "rpc/withdraw_offapp_payslip", {
        method: "POST",
        body: JSON.stringify({ p_payslip_id: p.id }),
      });
    }
  }
  await rest(
    staff.token,
    `helper_payout_accounts?user_id=eq.${staff.userId}&account_name=eq.${encodeURIComponent(NAME)}`,
    {
      method: "DELETE",
    },
  );
}

test.beforeAll(async () => {
  await cleanUp();
  const staff = await staffSession();
  const existing = (await rest(
    staff.token,
    `helper_payout_accounts?select=user_id&user_id=eq.${staff.userId}`,
  )) as unknown[];
  test.skip(existing.length > 0, "The test helper has saved a real number; not overwriting it.");
  await rest(staff.token, "helper_payout_accounts", {
    method: "POST",
    body: JSON.stringify({
      user_id: staff.userId,
      method: "PH_GCASH",
      account_name: NAME,
      account_number: NUMBER,
    }),
  });
});

test.afterAll(async () => {
  await cleanUp();
});

test("the manager pays her saved GCash, and it's recorded for her to confirm", async ({ page }) => {
  const watch = watchErrors(page);
  const staff = await staffSession();
  const helper = (
    (await rest(
      staff.token,
      `helper_profiles?select=id,name&user_id=eq.${staff.userId}&status=eq.ACTIVE`,
    )) as {
      id: string;
      name: string;
    }[]
  )[0];
  test.skip(!helper, "The test staff account has no active employment.");

  await page.goto("/manager/money");
  await settle(page);
  const picker = page.getByLabel("Whose money to show");
  // Several helpers: show hers (the options read "<name> · <station>").
  if (await picker.count()) {
    const value = await picker
      .locator("option")
      .filter({ hasText: `${helper.name} · ` })
      .first()
      .getAttribute("value");
    if (value) await picker.selectOption(value);
    await settle(page);
  }
  // This cutoff ("Pay by GCash or Maya"), or else a missed period ("Pay Sep 16 – Sep 30 by ...").
  const pay = page.getByRole("button", { name: /by GCash or Maya$/ });
  test.skip((await pay.count()) === 0, "Nothing unpaid for her right now.");
  await pay.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(NUMBER)).toBeVisible();
  await expect(dialog.getByText(NAME)).toBeVisible();
  const shown = (
    await dialog
      .getByText(/^₱[\d,]+\.\d\d$/)
      .first()
      .innerText()
  ).trim();
  await dialog.getByLabel(/reference number/).fill(REF);
  await dialog.getByRole("button", { name: "I've sent it" }).click();
  await expect(dialog).toBeHidden();

  const manager = managerToken() as string;
  const recorded = (await rest(
    manager,
    `payslips?select=net_pay,payout_provider,payout_channel_code,helper_ack,manual_note&helper_id=eq.${helper.id}&manual_note=like.${encodeURIComponent(`*${REF}*`)}`,
  )) as {
    net_pay: number;
    payout_provider: string;
    payout_channel_code: string;
    helper_ack: string;
    manual_note: string;
  }[];
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({
    payout_provider: "manual",
    payout_channel_code: "PH_GCASH",
    helper_ack: "pending",
    manual_note: `GCash ref ${REF}`,
  });
  // The amount on screen is the payslip's, to the centavo.
  expect(Number(shown.replace(/[₱,]/g, ""))).toBeCloseTo(Number(recorded[0].net_pay), 2);
  expect(watch.errors).toEqual([]);
});
