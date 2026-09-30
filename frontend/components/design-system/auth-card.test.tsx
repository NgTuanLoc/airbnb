import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AuthCard } from "./auth-card";

describe("AuthCard", () => {
  test("renders the title and children", () => {
    render(
      <AuthCard title="Log in">
        <button type="button">Continue</button>
      </AuthCard>,
    );
    expect(screen.getByText("Log in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  test("renders an optional subtitle", () => {
    render(
      <AuthCard title="Welcome back" subtitle="Sign in to continue">
        <span>x</span>
      </AuthCard>,
    );
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });

  test("uses the canvas surface and rounded card tokens", () => {
    render(<AuthCard title="Log in"><span>x</span></AuthCard>);
    const card = screen.getByTestId("auth-card");
    expect(card.className).toContain("bg-canvas");
    expect(card.className).toContain("rounded-md");
  });

  test("auth pages have a main landmark with the skip-link target", () => {
    render(<AuthCard title="Welcome back">form</AuthCard>);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });
});
