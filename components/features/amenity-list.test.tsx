import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmenityList } from "./amenity-list";

describe("AmenityList", () => {
  test("renders a heading and one row per amenity", () => {
    render(<AmenityList amenities={["Wifi", "Kitchen", "Washer"]} />);
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByText("Wifi")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Washer")).toBeInTheDocument();
  });
});
