import { test, expect, type Page } from "@playwright/test";

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function logIn(page: Page) {
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a guest books a stay and finds it under Trips", async ({ page }) => {
  await page.goto("/login?next=%2Frooms%2Fl1");
  await logIn(page);
  await expect(page).toHaveURL("/rooms/l1", { timeout: 30000 });

  // A random future month and night, so repeated runs against one dev server don't collide on dates.
  const monthsAhead = 1 + Math.floor(Math.random() * 10);
  for (let i = 0; i < monthsAhead; i++) await page.getByRole("button", { name: "Next month" }).click();
  const days = page.getByRole("button").filter({ hasText: /^\d+$/ });
  const start = Math.floor(Math.random() * ((await days.count()) - 1));
  await days.nth(start).click();
  await days.nth(start + 1).click();

  await page.getByRole("link", { name: /^reserve$/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Confirm and pay" }).click();

  await expect(page.getByText("You're going to Aspen!")).toBeVisible({ timeout: 30000 });
  await page.goto("/trips");
  await expect(page.getByRole("link", { name: /Aspen/ }).first()).toBeVisible();
});

test("Trips asks a logged-out visitor to log in and comes back", async ({ page }) => {
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/login\?next=%2Ftrips/);
  await logIn(page);
  await expect(page).toHaveURL("/trips", { timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1, name: "Trips" })).toBeVisible();
});
