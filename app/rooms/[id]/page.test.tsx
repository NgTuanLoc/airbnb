import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import RoomPage from "./page";

describe("RoomPage", () => {
  test("renders the listing title, gallery, amenities, and reservation card for a known id", async () => {
    const ui = await RoomPage({ params: Promise.resolve({ id: "l1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("calls notFound for an unknown id", async () => {
    await expect(RoomPage({ params: Promise.resolve({ id: "does-not-exist" }) })).rejects.toThrow();
  });
});
