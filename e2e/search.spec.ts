import { test, expect } from "@playwright/test";

test("navigates from a city card to its search results with map", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href^="/s/"]').first().click();
  // First navigation to /s/[location] triggers the dev server's on-demand compile,
  // which can exceed the default 5s assertion timeout.
  await expect(page).toHaveURL(/\/s\//, { timeout: 30000 });

  // Results heading + the map panel container are present.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("map-panel")).toBeAttached();
});

test("applies a price filter and updates the URL", async ({ page }) => {
  await page.goto("/s/Aspen");
  await expect(page.getByRole("heading", { level: 1, name: /stays in aspen/i })).toBeVisible();

  await page.getByRole("button", { name: /filters/i }).click();
  await page.getByLabel(/minimum price/i).fill("250");
  await page.getByRole("button", { name: /show results/i }).click();

  await expect(page).toHaveURL(/minPrice=250/);
});

test("search orb routes to the search page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/s\/anywhere/);
});
