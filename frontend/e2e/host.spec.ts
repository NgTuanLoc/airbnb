import { test, expect, type Browser, type Page } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function logIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(next, { timeout: 30000 });
}

async function createListing(page: Page, title: string) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Property type").selectOption("Entire cabin");
  await page.getByLabel("Category").selectOption("Cabins");
  await page.getByLabel("Description").fill("A bright cabin with a deck, a fireplace and a lake view.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("City").selectOption("aspen");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("checkbox", { name: "Wifi" }).check();
  await page.getByRole("button", { name: "Photo 1", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Price per night").fill("150");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Your listing is live")).toBeVisible({ timeout: 30000 });
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test("a host lists a place, a guest books it, and the host sees the reservation", async ({ browser }) => {
  const host = await newPage(browser);
  const hostEmail = `host-${unique()}@example.com`;
  const title = `E2E cabin ${unique()}`;
  await logIn(host, hostEmail, "/host/listings/new");
  await createListing(host, title);

  const guest = await newPage(browser);
  const guestEmail = `guest-${unique()}@example.com`;
  await logIn(guest, guestEmail, "/s/Aspen");
  await guest.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30000 });

  const monthsAhead = 1 + Math.floor(Math.random() * 10);
  for (let i = 0; i < monthsAhead; i++) await guest.getByRole("button", { name: "Next month" }).click();
  const days = guest.getByRole("button").filter({ hasText: /^\d+$/ });
  const start = Math.floor(Math.random() * ((await days.count()) - 1));
  await days.nth(start).click();
  await days.nth(start + 1).click();
  await guest.getByRole("link", { name: /^reserve$/i }).click();
  await expect(guest.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
  await guest.getByRole("button", { name: "Confirm and pay" }).click();
  await expect(guest.getByText("You're going to Aspen!")).toBeVisible({ timeout: 30000 });

  await host.goto("/host/reservations");
  const reservationRow = host.getByRole("listitem").filter({ hasText: title });
  await expect(reservationRow).toBeVisible({ timeout: 30000 });
  await expect(reservationRow).toContainText(guestEmail);
});

test("unlisting hides a listing from search and relisting brings it back", async ({ browser }) => {
  const host = await newPage(browser);
  const title = `E2E hideaway ${unique()}`;
  await logIn(host, `host-${unique()}@example.com`, "/host/listings/new");
  await createListing(host, title);

  await host.getByRole("button", { name: "Unlist" }).click();
  await expect(host.getByText("Unlisted")).toBeVisible({ timeout: 30000 });
  await host.goto("/s/Aspen");
  await expect(host.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  await expect(host.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  await host.goto("/host/listings");
  await host.getByRole("button", { name: "Relist" }).click();
  await expect(host.getByText("Listed", { exact: true })).toBeVisible({ timeout: 30000 });
  await host.goto("/s/Aspen");
  await expect(host.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible({ timeout: 30000 });
});
