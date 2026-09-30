import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import RegisterLoading from "./loading";

describe("RegisterLoading", () => {
  test("renders the busy auth card skeleton", () => {
    render(<RegisterLoading />);
    expect(screen.getByTestId("auth-card-skeleton")).toHaveAttribute("aria-busy", "true");
  });
});
