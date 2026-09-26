import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Button } from "./button";

describe("Button", () => {
  test("renders its label", () => {
    render(<Button>Reserve</Button>);
    expect(screen.getByRole("button", { name: "Reserve" })).toBeInTheDocument();
  });

  test("primary variant uses the rausch fill and sm radius", () => {
    render(<Button>Reserve</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-rausch");
    expect(btn.className).toContain("rounded-sm");
  });

  test("secondary variant uses canvas fill with ink border", () => {
    render(<Button variant="secondary">Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-canvas");
    expect(btn.className).toContain("border");
  });

  test("disabled buttons are disabled and use the pale tint", () => {
    render(<Button disabled>Reserve</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("disabled:bg-rausch-disabled");
  });
});
