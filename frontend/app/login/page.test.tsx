import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import LoginPage from "./page";

const page = (query: Record<string, string> = {}) => LoginPage({ searchParams: Promise.resolve(query) });

describe("LoginPage", () => {
  test("offers the password form, then the providers mock mode turns on", async () => {
    render(await page());
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with SSO" })).toHaveAttribute("href", "/login/sso");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("keeps the next path on the sign-up and SSO links", async () => {
    render(await page({ next: "/trips" }));
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register?next=%2Ftrips");
    expect(screen.getByRole("link", { name: "Continue with SSO" })).toHaveAttribute("href", "/login/sso?next=%2Ftrips");
  });

  test("explains a refused external sign-in from its code", async () => {
    render(await page({ error: "account_exists", provider: "google" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An account with this email already exists. Log in with your password, then connect Google from Login & security.",
    );
  });

  test("shows nothing for a code it doesn't know", async () => {
    render(await page({ error: "Your account is locked, call 555-0100", provider: "google" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
