import { expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import RegisterPage from "./page";

test("offers the sign-up form, the providers, and a log-in link that keeps next", async () => {
  render(await RegisterPage({ searchParams: Promise.resolve({ next: "/wishlists" }) }));
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fwishlists");
});
