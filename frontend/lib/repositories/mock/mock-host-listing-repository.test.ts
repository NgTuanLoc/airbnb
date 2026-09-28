import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { toHostListingInput } from "@/lib/host/listing-input";
import { mockHostListingRepository as repo } from "./mock-host-listing-repository";

const input = hostListingInputSchema.parse(validInput);
const newHost = () => `u-${crypto.randomUUID()}@example.com`;

describe("mockHostListingRepository", () => {
  test("creates a listed listing in the chosen city with no reviews yet", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    expect(listing.id).toMatch(/^hl-/);
    expect(listing).toMatchObject({
      hostId: host, status: "listed", rating: 0, reviewCount: 0, isGuestFavorite: false,
      location: { city: "Aspen", country: "USA" }, title: "Sunny cabin by the lake", pricePerNight: 180,
    });
    expect(await repo.findById(listing.id)).toEqual(listing);
    expect(toHostListingInput(listing)).toEqual(input);
  });

  test("lists a host's own listings, newest first", async () => {
    const host = newHost();
    const first = await repo.create(host, input);
    const second = await repo.create(host, { ...input, title: "Second place" });
    await repo.create(newHost(), input);

    expect((await repo.listForHost(host)).map((l) => l.id)).toEqual([second.id, first.id]);
  });

  test("only the owner can update or change the status", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    expect(await repo.update(newHost(), listing.id, { ...input, title: "Hijacked" })).toBeNull();
    expect(await repo.setStatus(newHost(), listing.id, "unlisted")).toBeNull();
    expect((await repo.findById(listing.id))?.title).toBe("Sunny cabin by the lake");

    const updated = await repo.update(host, listing.id, { ...input, title: "Renamed", cityId: "kyoto" });
    expect(updated).toMatchObject({ title: "Renamed", location: { city: "Kyoto" }, status: "listed" });
  });

  test("listPublic leaves out unlisted listings and keeps the status across edits", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    await repo.setStatus(host, listing.id, "unlisted");
    await repo.update(host, listing.id, { ...input, title: "Still hidden" });

    expect((await repo.listPublic()).some((l) => l.id === listing.id)).toBe(false);
    expect((await repo.findById(listing.id))?.status).toBe("unlisted");
  });
});
