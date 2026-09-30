import { test, expect } from "@playwright/test";

test("navigates from the homepage to a listing detail and selects dates", async ({ page }) => {
  await page.goto("/");
  // Click the first property card link (title links carry /rooms/).
  await page.locator('a[href^="/rooms/"]').first().click();
  // First navigation to /rooms/[id] triggers the dev server's on-demand compile,
  // which can exceed the default assertion timeout under full-suite compile contention.
  await expect(page).toHaveURL(/\/rooms\//, { timeout: 30000 });

  // Detail content is present.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: /what this place offers/i })).toBeVisible();

  // Reserve starts disabled.
  const reserve = page.getByRole("button", { name: /^reserve$/i });
  await expect(reserve).toBeDisabled();

  // Next month first: late in a month, the current month has fewer than two future days.
  await page.getByRole("button", { name: "Next month" }).click();
  // Select two enabled day cells, then Reserve enables and a total appears.
  const dayButtons = page.getByRole('button').filter({ hasText: /^\d+$/ });
  const count = await dayButtons.count();
  // Click the last two day buttons (always within the displayed month and enabled if in the future).
  await dayButtons.nth(count - 2).click();
  await dayButtons.nth(count - 1).click();
  await expect(page.getByText(/total/i)).toBeVisible();
});

test("shows a not-found page for an unknown listing id", async ({ page }) => {
  await page.goto("/rooms/does-not-exist");
  await expect(page.getByText(/can.?t find that place/i)).toBeVisible();
});
