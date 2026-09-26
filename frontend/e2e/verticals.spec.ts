import { test, expect } from "@playwright/test";

test("browses experiences, filters a category, and opens a detail", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page.getByRole("heading", { level: 1, name: /experiences/i })).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "Nature" }).click();
  await page.locator('a[href^="/experiences/"]').first().click();
  await expect(page).toHaveURL(/\/experiences\/e\d+/, { timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
});

test("browses services and opens a detail", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1, name: /services/i })).toBeVisible({ timeout: 30000 });

  await page.locator('a[href^="/services/"]').first().click();
  await expect(page).toHaveURL(/\/services\/s\d+/, { timeout: 30000 });
  await expect(page.getByText(/about this service/i)).toBeVisible({ timeout: 30000 });
});

test("top-nav tab routes to experiences", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /experiences/i }).first().click();
  await expect(page).toHaveURL(/\/experiences/, { timeout: 30000 });
});
