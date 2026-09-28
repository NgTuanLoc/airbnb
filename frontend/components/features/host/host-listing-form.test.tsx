import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const api = vi.hoisted(() => ({ createHostListing: vi.fn(), updateHostListing: vi.fn() }));
vi.mock("@/lib/api-client/host", () => api);

import { HostListingForm } from "./host-listing-form";

beforeEach(() => {
  push.mockReset();
  api.createHostListing.mockReset();
  api.updateHostListing.mockReset();
});

async function fillStepOne() {
  await userEvent.type(screen.getByLabelText("Title"), "Sunny cabin by the lake");
  await userEvent.selectOptions(screen.getByLabelText("Property type"), "Entire cabin");
  await userEvent.selectOptions(screen.getByLabelText("Category"), "Cabins");
  await userEvent.type(screen.getByLabelText("Description"), "A bright cabin with a deck and a view of the water.");
}

const next = () => userEvent.click(screen.getByRole("button", { name: "Next" }));

describe("HostListingForm", () => {
  test("won't leave step 1 until its fields are valid", async () => {
    render(<HostListingForm mode="create" />);

    await next();

    expect(screen.getByText("Titles need 5–80 characters")).toBeInTheDocument();
    expect(screen.getByText("Pick a property type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about your place" })).toBeInTheDocument();
  });

  test("walks through all four steps and publishes", async () => {
    api.createHostListing.mockResolvedValue({ id: "hl-new" });
    render(<HostListingForm mode="create" />);

    await fillStepOne();
    await next();
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    await next();
    await userEvent.click(screen.getByRole("checkbox", { name: "Wifi" }));
    await userEvent.click(screen.getByRole("button", { name: "Photo 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Photo 1" }));
    await next();
    await userEvent.clear(screen.getByLabelText("Price per night"));
    await userEvent.type(screen.getByLabelText("Price per night"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    const sent = api.createHostListing.mock.calls[0][0];
    expect(sent).toMatchObject({ title: "Sunny cabin by the lake", cityId: "aspen", amenities: ["Wifi"], pricePerNight: 150 });
    expect(sent.photos).toHaveLength(2);
    expect(push).toHaveBeenCalledWith("/host/listings?created=hl-new");
  });

  test("won't leave the photo step without a photo, and stops at five", async () => {
    render(<HostListingForm mode="create" />);
    await fillStepOne();
    await next();
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    await next();

    await next();
    expect(screen.getByText("Pick 1 to 5 photos")).toBeInTheDocument();

    for (let n = 1; n <= 6; n++) await userEvent.click(screen.getByRole("button", { name: `Photo ${n}` }));
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(5);
  });

  test("editing starts prefilled and saves to the listing", async () => {
    api.updateHostListing.mockResolvedValue({ id: "hl-1" });
    render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);

    expect(screen.getByLabelText("Title")).toHaveValue("Sunny cabin by the lake");
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.updateHostListing).toHaveBeenCalledWith("hl-1", hostListingInputSchema.parse(validInput));
    expect(push).toHaveBeenCalledWith("/host/listings");
  });

  test("invalidates the listings and search-listings queries before navigating away", async () => {
    api.updateHostListing.mockResolvedValue({ id: "hl-1" });
    const { queryClient } = render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(spy).toHaveBeenCalledWith({ queryKey: ["listings"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["search-listings"] });
    expect(spy.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  test("shows an API failure and stays on the review step", async () => {
    api.updateHostListing.mockRejectedValueOnce(new Error("Listing not found"));
    render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Listing not found");
    expect(push).not.toHaveBeenCalled();
  });
});
