import { test, expect, type Page } from "@playwright/test";
import { logIn, unique } from "./helpers";

// Google, GitHub and SSO through mock mode's demo provider page (OAuth spec section 2). In api mode the providers are
// real (Keycloak for SSO, see README), so these skip.
test.beforeEach(async ({ page }) => {
  const probe = await page.request.get("/auth/mock-provider?provider=google&state=probe&redirect_uri=%2Fapi%2Fauth%2Fcallback%2Fgoogle");
  test.skip(probe.status() === 404, "needs DATA_SOURCE=mock"); // the demo provider page is a 404 in api mode
});

/** Plays the person at the demo provider: waits for its page to settle (next dev compiles it on first use), signs in. */
async function signInAtProvider(page: Page, provider: string, email?: string) {
  await expect(page.getByRole("heading", { name: `Sign in with ${provider}` })).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  if (email) await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
}

// Next's route announcer is a role="alert" too, so page messages are looked up inside <main>.
const alertIn = (page: Page) => page.getByRole("main").getByRole("alert");

test("Continue with Google signs in at the provider and comes back to next", async ({ page }) => {
  await page.goto("/login?next=%2Ftrips");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await signInAtProvider(page, "Google", `google-${unique()}@example.com`);

  await expect(page).toHaveURL("/trips", { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Trips", level: 1 })).toBeVisible();
});

test("cancelling at the provider comes back to log in and says so", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Sign in with GitHub" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/login\?error=cancelled&provider=github/, { timeout: 30000 });
  await expect(alertIn(page)).toHaveText("Signing in with GitHub was cancelled.");
});

test("Continue with SSO sends a work email to its company's identity provider", async ({ page }) => {
  await page.goto("/login?next=%2Fwishlists");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await expect(page).toHaveURL("/login/sso?next=%2Fwishlists", { timeout: 30000 });
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Work email").fill("alex@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(alertIn(page)).toHaveText("Single sign-on isn't set up for that email's domain.");

  await page.getByLabel("Work email").fill(`alex-${unique()}@acme.test`);
  await page.getByRole("button", { name: "Continue" }).click();
  // The provider already knows the email from the login hint.
  await signInAtProvider(page, "Acme Corp");

  await expect(page).toHaveURL("/wishlists", { timeout: 30000 });
});

test("Login & security connects and disconnects GitHub", async ({ page }) => {
  await logIn(page, `connect-${unique()}@example.com`, "/account/security");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Connect GitHub" }).click();
  await signInAtProvider(page, "GitHub", `gh-${unique()}@example.com`);

  await expect(page).toHaveURL("/account/security?connected=github", { timeout: 30000 });
  await expect(page.getByRole("main").getByRole("status")).toHaveText("GitHub is now connected.");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Disconnect GitHub" }).click();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
});
