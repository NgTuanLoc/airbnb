import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import MockProviderPage from "./page";

const params = { provider: "google", state: "st", redirect_uri: "/api/auth/callback/google", login_hint: "ana@example.com" };
const page = (query: Record<string, string>) => MockProviderPage({ searchParams: Promise.resolve(query) });

afterEach(() => vi.unstubAllEnvs());

test("plays the provider's sign-in page, with the hint filled in and a cancel back to the callback", async () => {
  render(await page(params));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in with Google");
  expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
  expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/api/auth/callback/google?error=access_denied&state=st");
  expect(screen.getByRole("button", { name: "Continue" }).closest("form")).toHaveAttribute("action", "/auth/mock-provider/authorize");
});

test("shows the authorize route's invalid email error", async () => {
  render(await page({ ...params, error: "invalid_email" }));
  expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
});

test("is not found for a foreign callback or an unknown provider", async () => {
  await expect(page({ ...params, redirect_uri: "https://evil.example/cb" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  await expect(page({ ...params, provider: "facebook", redirect_uri: "/api/auth/callback/facebook" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test("does not exist in api mode", async () => {
  vi.stubEnv("DATA_SOURCE", "api");
  vi.stubEnv("API_HTTP", "http://api.test");
  await expect(page(params)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});
