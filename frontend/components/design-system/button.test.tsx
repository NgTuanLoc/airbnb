import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Button } from "./button";

describe("Button", () => {
  test("renders its label", () => {
    render(<Button>Reserve</Button>);
    expect(screen.getByRole("button", { name: "Reserve" })).toBeInTheDocument();
  });

  test("primary variant uses the text-safe rausch fill and sm radius", () => {
    render(<Button>Reserve</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-rausch-text-bg");
    expect(btn.className).toContain("hover:bg-rausch-text-bg-hover");
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

  test("the pill variant uses the text-safe rausch fill (white text passes 4.5:1)", () => {
    render(<Button variant="pill">Try hosting</Button>);
    expect(screen.getByRole("button").className).toContain("bg-rausch-text-bg");
  });
});
