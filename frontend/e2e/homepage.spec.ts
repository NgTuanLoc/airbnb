import { test, expect } from "@playwright/test";
import { unique } from "./helpers";

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

test("the open account menu sits above the sticky search bar", async ({ page }) => {
  // Signs up rather than logging in, so it also passes against an api-mode frontend (real accounts).
  await page.goto(`/register?next=${encodeURIComponent("/")}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Menu Tester");
  await page.getByLabel("Email").fill(`menu-${unique()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("supersecret");
  await page.getByLabel("Confirm password").fill("supersecret");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Account menu" }).click();

  // Playwright refuses to click an element that another one covers, so this fails if the search bar is on top.
  await page.getByRole("link", { name: "Trips" }).click();
  await expect(page).toHaveURL(/\/trips$/, { timeout: 30000 });
});
