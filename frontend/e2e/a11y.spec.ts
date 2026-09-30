import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { isoDaysAhead, logIn, unique } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude(".maplibregl-map").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main#main")).toBeVisible({ timeout: 30000 });
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 744;

for (const path of ["/", "/s/Aspen", "/rooms/l1", "/experiences", "/experiences/e1", "/services", "/services/s1", "/login", "/register", "/host"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await visit(page, path);
    await expectNoSeriousViolations(page);
  });
}

test.describe("logged-in pages", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, `a11y-${unique()}@example.com`, "/trips");
  });

  const book = `/book/l1?checkIn=${isoDaysAhead(40)}&checkOut=${isoDaysAhead(43)}&adults=1&children=0`;
  for (const path of ["/wishlists", "/trips", book, "/host/listings", "/host/listings/new", "/host/reservations"]) {
    test(`${path.split("?")[0]} has no serious accessibility violations`, async ({ page }) => {
      await visit(page, path);
      await expectNoSeriousViolations(page);
    });
  }

  test("the save-to-wishlist dialog has no serious accessibility violations", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Save to wishlist" }).first().click();
    await expect(page.getByRole("dialog", { name: "Save to wishlist" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

test("the open account menu has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(isMobile(page), "desktop-only control");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expectNoSeriousViolations(page);
});

test("the mobile nav sheet has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(!isMobile(page), "mobile-only control");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("the mobile search overlay has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(!isMobile(page), "mobile-only control");
  await page.getByRole("button", { name: /start your search/i }).click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
