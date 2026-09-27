import { describe, expect, test } from "vitest";
import { mockWishlistRepository as repo } from "./mock-wishlist-repository";

const newUser = () => `u-${crypto.randomUUID()}`;

describe("mockWishlistRepository", () => {
  test("creates lists newest first, per user", async () => {
    const user = newUser();
    const first = await repo.create(user, "Summer");
    const second = await repo.create(user, "Winter");

    expect((await repo.listForUser(user)).map((w) => w.id)).toEqual([second.id, first.id]);
    expect(first.listingIds).toEqual([]);
  });

  test("one user never sees or changes another user's lists", async () => {
    const owner = newUser();
    const other = newUser();
    const list = await repo.create(owner, "Mine");

    expect(await repo.listForUser(other)).toEqual([]);
    expect(await repo.findById(other, list.id)).toBeNull();
    expect(await repo.addListing(other, list.id, "l1")).toBeNull();
    expect((await repo.findById(owner, list.id))?.listingIds).toEqual([]);
  });

  test("addListing is idempotent", async () => {
    const user = newUser();
    const list = await repo.create(user, "Trip");

    await repo.addListing(user, list.id, "l1");
    await repo.addListing(user, list.id, "l1");

    expect((await repo.findById(user, list.id))?.listingIds).toEqual(["l1"]);
  });

  test("removeListing clears the listing from every list", async () => {
    const user = newUser();
    const a = await repo.create(user, "A");
    const b = await repo.create(user, "B");
    await repo.addListing(user, a.id, "l1");
    await repo.addListing(user, b.id, "l1");
    await repo.addListing(user, b.id, "l2");

    await repo.removeListing(user, "l1");

    expect((await repo.findById(user, a.id))?.listingIds).toEqual([]);
    expect((await repo.findById(user, b.id))?.listingIds).toEqual(["l2"]);
  });
});
