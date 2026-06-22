import { test, expect } from "@playwright/test";

test("user can log in via the mock form and lands on the homepage", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("a@b.com");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/");
});

test("login page links to register", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/register");
});
