import { test, expect, type Page } from "@playwright/test";
import { logIn, unique } from "./helpers";

async function openMonth(page: Page, monthsAhead: number) {
  await page.goto("/rooms/l3");
  await page.waitForLoadState("networkidle");
  const reserve = page.locator("#reserve");
  for (let i = 0; i < monthsAhead; i++) await reserve.getByRole("button", { name: "Next month" }).click();
  return reserve;
}

test("a booked night is blocked for other guests until the trip is cancelled", async ({ browser }) => {
  const monthsAhead = 2 + Math.floor(Math.random() * 10);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await logIn(pageA, `avail-a-${unique()}@example.com`, "/rooms/l3");
    const reserveA = await openMonth(pageA, monthsAhead);
    const days = reserveA.locator("[data-calendar-day]:not(:disabled)");
    const firstNight = ((await days.nth(2).textContent()) ?? "").trim();
    await days.nth(2).click();
    await days.nth(3).click();
    await reserveA.getByRole("link", { name: "Reserve" }).click();
    await pageA.getByRole("button", { name: "Confirm and pay" }).click();
    await expect(pageA).toHaveURL(/\/trips\/[^/?]+\?confirmed=1/, { timeout: 30000 });

    const night = (reserve: ReturnType<Page["locator"]>) =>
      reserve.locator("[data-calendar-day]").filter({ hasText: new RegExp(`^${firstNight}$`) }).first();

    await logIn(pageB, `avail-b-${unique()}@example.com`, "/");
    const reserveB = await openMonth(pageB, monthsAhead);
    await expect(night(reserveB)).toBeDisabled();

    await pageA.getByRole("button", { name: "Cancel trip" }).click();
    const dialog = pageA.getByRole("dialog", { name: "Cancel this trip?" });
    await dialog.getByRole("button", { name: "Cancel trip" }).click();
    await expect(pageA.getByText("Cancelled").first()).toBeVisible({ timeout: 30000 });

    const reserveB2 = await openMonth(pageB, monthsAhead);
    await expect(night(reserveB2)).toBeEnabled();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
