import { test, expect, type Page } from "@playwright/test";

// The mock store is shared by everyone using the dev server, so every run logs in as a new guest.
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function logIn(page: Page) {
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a logged-out heart asks to log in, then saves to a new wishlist and unsaves", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save to wishlist" }).first().click();

  await expect(page).toHaveURL(/\/login\?next=%2F/);
  await logIn(page);
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Save to wishlist" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Save to wishlist" });
  await dialog.getByLabel("Name").fill("Summer trip");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "Remove from wishlist" }).first()).toBeVisible();

  await page.goto("/wishlists");
  await page.getByRole("link", { name: /Summer trip/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Summer trip" })).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "Remove from wishlist" }).first().click();
  await expect(page.getByRole("button", { name: "Save to wishlist" }).first()).toBeVisible();
});
