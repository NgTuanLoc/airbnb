import { test, expect } from "@playwright/test";

test("homepage shows the search bar, property cards, and city grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  // at least one property card heading is rendered from /api/listings
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(page.getByText("Inspiration for future getaways")).toBeVisible();
});

test("category filter updates the grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Cabins" })).toBeVisible();
  await page.getByRole("button", { name: "Cabins" }).click();
  // grid still renders cards after filtering
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
});
