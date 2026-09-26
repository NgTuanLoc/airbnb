import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, fireEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { HomeSearchBar } from "./home-search-bar";

beforeEach(() => {
  push.mockClear();
});

describe("HomeSearchBar", () => {
  test("opens the destination panel when Where is clicked", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
  });

  test("selecting a destination updates the Where display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(screen.getByRole("button", { name: "Where" }).textContent).toContain("Lisbon");
  });

  test("Escape closes the open panel", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Where to?" })).not.toBeInTheDocument();
  });

  test("increasing guests updates the Who display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(screen.getByRole("button", { name: "Who" }).textContent).toContain("1 guest");
  });

  test("search with no input routes to /s/anywhere", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/anywhere");
  });

  test("search with a destination and guests builds the URL", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/Lisbon?guests=1");
  });

  test("date range selection appends checkIn and checkOut to the pushed URL", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "When" }));

    // Navigate to next month so all days are safely past today's minDate
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));

    // Determine the month we navigated to from the calendar heading
    const monthHeading = screen.getByText(/\w+ \d{4}/);
    const [monthName, yearStr] = monthHeading.textContent!.split(" ");
    const year = parseInt(yearStr, 10);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();

    // Select day 10 then day 20 (both are in a future month, so enabled)
    await userEvent.click(screen.getByRole("button", { name: "10" }));
    await userEvent.click(screen.getByRole("button", { name: "20" }));

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(push).toHaveBeenCalledTimes(1);

    const checkInISO = `${year}-${String(monthIndex + 1).padStart(2, "0")}-10`;
    const checkOutISO = `${year}-${String(monthIndex + 1).padStart(2, "0")}-20`;
    expect(push).toHaveBeenCalledWith(
      `/s/anywhere?checkIn=${checkInISO}&checkOut=${checkOutISO}`,
    );
  });

  test("selecting only a check-in appends checkIn but not checkOut", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "When" }));

    // Navigate to next month so all days are safely past today's minDate
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));

    // Click a single day — no second selection
    await userEvent.click(screen.getByRole("button", { name: "15" }));

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("checkIn=");
    expect(url).not.toContain("checkOut=");
  });

  test("mousedown outside the search bar closes an open panel", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("textbox", { name: "Where to?" })).not.toBeInTheDocument();
  });
});
