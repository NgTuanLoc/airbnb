import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceMarker } from "./price-marker";

describe("PriceMarker", () => {
  test("renders the price and fires onClick", async () => {
    const onClick = vi.fn();
    render(<PriceMarker price={220} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /\$220/ });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("applies the selected style class when selected", () => {
    render(<PriceMarker price={220} selected />);
    expect(screen.getByRole("button", { name: /\$220/ }).className).toContain("bg-ink");
  });

  test("the unselected marker uses the text-safe rausch fill", () => {
    render(<PriceMarker price={220} />);
    expect(screen.getByRole("button", { name: /\$220/ }).className).toContain("bg-rausch-text-bg");
  });
});
