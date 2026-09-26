import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/features/search/search-results", () => ({
  SearchResults: ({ location }: { location: string }) => <div data-testid="search-results">{location}</div>,
}));

import SearchPage from "./page";

describe("SearchPage", () => {
  test("decodes the location param and renders the results island", async () => {
    const ui = await SearchPage({ params: Promise.resolve({ location: "San%20Diego" }) });
    render(ui);
    expect(screen.getByTestId("search-results")).toHaveTextContent("San Diego");
  });
});
