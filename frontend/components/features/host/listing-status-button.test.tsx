import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setHostListingStatus = vi.fn();
vi.mock("@/lib/api-client/host", () => ({ setHostListingStatus: (...args: unknown[]) => setHostListingStatus(...args) }));

import { ListingStatusButton } from "./listing-status-button";

beforeEach(() => {
  refresh.mockReset();
  setHostListingStatus.mockReset();
});

test("unlists a listed listing and refreshes", async () => {
  setHostListingStatus.mockResolvedValue({});
  render(<ListingStatusButton listingId="hl-1" status="listed" />);
  await userEvent.click(screen.getByRole("button", { name: "Unlist" }));
  expect(setHostListingStatus).toHaveBeenCalledWith("hl-1", "unlisted");
  expect(refresh).toHaveBeenCalled();
});

test("relists an unlisted listing and shows failures", async () => {
  setHostListingStatus.mockRejectedValueOnce(new Error("Listing not found"));
  render(<ListingStatusButton listingId="hl-1" status="unlisted" />);
  await userEvent.click(screen.getByRole("button", { name: "Relist" }));
  expect(setHostListingStatus).toHaveBeenCalledWith("hl-1", "listed");
  expect(await screen.findByRole("alert")).toHaveTextContent("Listing not found");
});
