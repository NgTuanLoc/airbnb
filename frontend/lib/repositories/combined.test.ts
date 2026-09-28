import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { mockHostListingRepository } from "./mock/mock-host-listing-repository";
import { mockHostProfileRepository } from "./mock/mock-host-profile-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { combineHosts, combineListings } from "./combined";

const listings = combineListings(mockListingRepository, mockHostListingRepository);
const hosts = combineHosts(mockHostRepository, mockHostProfileRepository);
const input = hostListingInputSchema.parse(validInput);
const newHost = () => `u-${crypto.randomUUID()}@example.com`;

describe("combineListings", () => {
  test("appends listed host listings after the catalog", async () => {
    const listing = await mockHostListingRepository.create(newHost(), { ...input, title: `Combined ${crypto.randomUUID()}` });

    const all = await listings.findAll();

    expect(all.slice(0, 16).map((l) => l.id)).toEqual((await mockListingRepository.findAll()).map((l) => l.id));
    expect(all.some((l) => l.id === listing.id)).toBe(true);
  });

  test("host listings are filtered like catalog listings", async () => {
    const listing = await mockHostListingRepository.create(newHost(), { ...input, cityId: "aspen", maxGuests: 2, category: "Cabins", pricePerNight: 180 });
    const ids = async (filters: Parameters<typeof listings.findAll>[0]) => (await listings.findAll(filters)).map((l) => l.id);

    expect(await ids({ location: "aspen" })).toContain(listing.id);
    expect(await ids({ location: "Aspen", guests: 4 })).not.toContain(listing.id);
    expect(await ids({ location: "Malibu" })).not.toContain(listing.id);
    expect(await ids({ category: "Beachfront" })).not.toContain(listing.id);
    expect(await ids({ minPrice: 200 })).not.toContain(listing.id);
  });

  test("unlisted host listings leave findAll but still resolve by id", async () => {
    const host = newHost();
    const listing = await mockHostListingRepository.create(host, input);
    await mockHostListingRepository.setStatus(host, listing.id, "unlisted");

    expect((await listings.findAll()).some((l) => l.id === listing.id)).toBe(false);
    expect((await listings.findById(listing.id))?.status).toBe("unlisted");
    expect((await listings.findById("l1"))?.id).toBe("l1");
    expect(await listings.findById("hl-missing")).toBeNull();
  });
});

describe("combineHosts", () => {
  test("user ids go to host profiles, others to the catalog", async () => {
    const id = newHost();
    await mockHostProfileRepository.upsertFromUser({ id, name: "Ana", email: "ana@example.com" });

    expect((await hosts.findById(id))?.name).toBe("Ana");
    expect((await hosts.findById("h1"))?.id).toBe("h1");
    expect(await hosts.findById("u-nobody@example.com")).toBeNull();
  });
});
