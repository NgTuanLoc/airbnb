import { expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import SsoPage from "./page";
import SsoLoading from "./loading";

test("asks for a work email and links back to the other ways in, keeping next", async () => {
  render(await SsoPage({ searchParams: Promise.resolve({ next: "/trips" }) }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Log in with SSO");
  expect(screen.getByLabelText("Work email")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Other ways to log in" })).toHaveAttribute("href", "/login?next=%2Ftrips");
});

test("loads as the busy auth card", () => {
  render(<SsoLoading />);
  expect(screen.getByTestId("auth-card-skeleton")).toHaveAttribute("aria-busy", "true");
});
