import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import LoginLoading from "./loading";

describe("LoginLoading", () => {
  test("renders the busy auth card skeleton", () => {
    render(<LoginLoading />);
    expect(screen.getByTestId("auth-card-skeleton")).toHaveAttribute("aria-busy", "true");
  });
});
