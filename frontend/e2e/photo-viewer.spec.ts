import { test, expect } from "@playwright/test";

test("a listing photo opens a viewer that pages through every photo and closes on Escape", async ({ page }) => {
  await page.goto("/rooms/l1");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /^Open photo 2 of/ }).click();
  const viewer = page.getByRole("dialog", { name: /^Photos of/ });
  await expect(viewer.getByText(/^2 \/ \d+$/)).toBeVisible();

  await viewer.getByRole("button", { name: "Next photo" }).click();
  await expect(viewer.getByText(/^3 \/ \d+$/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText(/^2 \/ \d+$/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("Show all photos opens the viewer on the first photo", async ({ page }) => {
  await page.goto("/rooms/l1");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Show all photos" }).click();

  await expect(page.getByRole("dialog", { name: /^Photos of/ }).getByText(/^1 \/ \d+$/)).toBeVisible();
});
