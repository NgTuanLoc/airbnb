import { test, expect, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, unique } from "./helpers";

async function createListing(page: Page, title: string) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Property type").selectOption("Entire cabin");
  await page.getByLabel("Category").selectOption("Cabins");
  await page.getByLabel("Description").fill("A bright cabin with a deck, a fireplace and a lake view.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("City").selectOption("aspen");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("checkbox", { name: "Wifi" }).check();
  await page.getByRole("button", { name: "Photo 1", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Price per night").fill("150");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Your listing is live")).toBeVisible({ timeout: 30000 });
}

test("the hamburger sheet closes on Escape and navigates", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByRole("link", { name: /experiences/i }).click();
  await expect(page).toHaveURL(/\/experiences$/, { timeout: 30000 });
});

test("mobile search lands on filtered results", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /start your search/i }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("button", { name: "Aspen" }).click();
  await dialog.getByRole("button", { name: "Next month" }).click();
  const days = dialog.locator("[data-calendar-day]:not(:disabled)");
  await days.nth(3).click();
  await days.nth(5).click();
  await dialog.getByRole("button", { name: /^who/i }).click();
  await dialog.getByRole("button", { name: "Increase adults" }).click();
  await dialog.getByRole("button", { name: "Increase adults" }).click();
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/Aspen\?guests=2&checkIn=\d{4}-\d{2}-\d{2}&checkOut=\d{4}-\d{2}-\d{2}/, { timeout: 30000 });
  await expect(page.locator('a[href^="/rooms/"]').first()).toBeVisible({ timeout: 30000 });
});

test("the sticky bar checks availability and reserves", async ({ page }) => {
  await logIn(page, `mobile-${unique()}@example.com`, "/rooms/l1");
  await page.waitForLoadState("networkidle");
  const bar = page.getByRole("region", { name: "Reservation summary" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Check availability" }).click();
  await expect(page.locator("#reserve [data-calendar-day]:not(:disabled)").first()).toBeFocused();

  await page.locator("#reserve").getByRole("button", { name: "Next month" }).click();
  const days = page.locator("#reserve [data-calendar-day]:not(:disabled)");
  await days.nth(2).click();
  await days.nth(4).click();
  await bar.getByRole("link", { name: "Reserve" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
});

for (const path of ["/", "/s/Aspen", "/rooms/l1", "/experiences", "/services", "/host", "/login"]) {
  test(`${path} has no horizontal scroll on a phone`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
  });
}

test("/host/listings has no horizontal scroll on a phone with a listing row", async ({ page }) => {
  await logIn(page, `mobile-host-${unique()}@example.com`, "/host/listings/new");
  await createListing(page, `Mobile row ${unique()}`);
  await page.goto("/host/listings");
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalScroll(page);
});
