import { test, expect } from "@playwright/test";

test("design-system gallery renders core atoms", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "Design System" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve" })).toBeVisible();
  await expect(page.getByText("4.81")).toBeVisible();
});
