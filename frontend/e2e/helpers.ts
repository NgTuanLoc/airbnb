import { expect, type Locator, type Page } from "@playwright/test";

export const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function logIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(next, { timeout: 30000 });
}

/** A local YYYY-MM-DD `days` from today. */
export function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Presses Tab until `target` has focus, so a test can drive the page by keyboard only. */
export async function tabTo(page: Page, target: Locator, maxPresses = 120) {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab never reached ${target}`);
}
