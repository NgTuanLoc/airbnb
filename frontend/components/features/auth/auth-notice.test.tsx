import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AuthNotice, AuthSwitch } from "./auth-notice";

describe("AuthNotice", () => {
  test("an error is an alert in the error colour", () => {
    render(<AuthNotice tone="error">Signing in with Google was cancelled.</AuthNotice>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Signing in with Google was cancelled.");
    expect(alert.className).toContain("text-error");
  });

  test("good news is a polite status", () => {
    render(<AuthNotice tone="success">Google is now connected.</AuthNotice>);
    expect(screen.getByRole("status")).toHaveTextContent("Google is now connected.");
  });
});

test("AuthSwitch links to the other auth page", () => {
  render(<AuthSwitch prompt="Don't have an account?" label="Sign up" href="/register?next=%2Ftrips" />);
  expect(screen.getByText(/Don't have an account\?/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register?next=%2Ftrips");
});
