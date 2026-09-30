import { test, expect } from "@playwright/test";
import { logIn, tabTo, unique } from "./helpers";

test("a guest books a stay with the keyboard only", async ({ page }) => {
  await logIn(page, `keyboard-${unique()}@example.com`, "/");
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.getByRole("button", { name: "Where" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Aspen" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Search", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/s\/Aspen/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.locator('a[href^="/rooms/"]').first());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.locator("#reserve").getByRole("button", { name: "Next month" }));
  await page.keyboard.press("Enter");
  const days = page.locator("#reserve [data-calendar-day]:not(:disabled)");
  await tabTo(page, days.nth(2));
  await page.keyboard.press("Enter");
  await tabTo(page, days.nth(4));
  await page.keyboard.press("Enter");
  await tabTo(page, page.locator("#reserve").getByRole("link", { name: "Reserve" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
});
