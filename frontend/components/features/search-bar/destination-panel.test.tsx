import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import type { City } from "@/lib/types";
import { DestinationPanel } from "./destination-panel";

const cities: City[] = [
  { id: "lisbon", name: "Lisbon", subLabel: "Apartment rentals", image: "/l.jpg", listingCount: 1 },
  { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "/a.jpg", listingCount: 1 },
];

describe("DestinationPanel", () => {
  test("filters suggestions by the typed value", () => {
    render(<DestinationPanel value="lis" suggestions={cities} onChange={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Lisbon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aspen" })).not.toBeInTheDocument();
  });

  test("shows all suggestions when value is empty", () => {
    render(<DestinationPanel value="" suggestions={cities} onChange={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Lisbon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aspen" })).toBeInTheDocument();
  });

  test("typing fires onChange", async () => {
    const onChange = vi.fn();
    render(<DestinationPanel value="" suggestions={cities} onChange={onChange} onSelect={() => {}} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Where to?" }), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  test("clicking a suggestion fires onSelect with the city name", async () => {
    const onSelect = vi.fn();
    render(<DestinationPanel value="" suggestions={cities} onChange={() => {}} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(onSelect).toHaveBeenCalledWith("Lisbon");
  });
});
