// @vitest-environment node
import { describe, expect, test } from "vitest";
import { GET, POST } from "./route";
import { POST as addListing } from "./[id]/listings/route";
import { DELETE as unsave } from "./saved/[listingId]/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";

const url = "http://localhost/api/wishlists";
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function createList(cookie: string, body: object) {
  const res = await POST(jsonRequest(url, "POST", body, cookie));
  return { res, body: await res.json() };
}

describe("wishlist API", () => {
  test("every endpoint needs a session", async () => {
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(jsonRequest(url, "POST", { name: "x" }))).status).toBe(401);
    expect((await addListing(jsonRequest(`${url}/w/listings`, "POST", { listingId: "l1" }), params({ id: "w" }))).status).toBe(401);
    const res = await unsave(jsonRequest(`${url}/saved/l1`, "DELETE"), params({ listingId: "l1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Log in to continue" });
  });

  test("a garbage session cookie gets 401", async () => {
    expect((await GET(new Request(url, { headers: { cookie: `${SESSION_COOKIE}=garbage` } }))).status).toBe(401);
  });

  test("creates a list, with or without a first listing, and lists it", async () => {
    const cookie = sessionCookieHeader();
    const empty = await createList(cookie, { name: "  Summer  " });
    const withListing = await createList(cookie, { name: "Cabins", listingId: "l1" });

    expect(empty.res.status).toBe(201);
    expect(empty.body.data).toMatchObject({ name: "Summer", listingIds: [] });
    expect(withListing.body.data.listingIds).toEqual(["l1"]);
    const all = await (await GET(new Request(url, { headers: { cookie } }))).json();
    expect(all.data.map((w: { name: string }) => w.name)).toEqual(["Cabins", "Summer"]);
  });

  test.each([
    [{ name: "" }, "Give your wishlist a name"],
    [{ name: "   " }, "Give your wishlist a name"],
    [{ name: "x".repeat(51) }, "Wishlist names can be at most 50 characters"],
  ])("rejects the name in %o", async (body, message) => {
    const { res, body: json } = await createList(sessionCookieHeader(), body);
    expect(res.status).toBe(400);
    expect(json.error).toBe(message);
  });

  test("a new list with an unknown listing is 404", async () => {
    const { res, body } = await createList(sessionCookieHeader(), { name: "X", listingId: "l999" });
    expect(res.status).toBe(404);
    expect(body.error).toBe("Listing 'l999' was not found");
  });

  test("adds a listing to a list", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await createList(cookie, { name: "Trip" });

    const res = await addListing(jsonRequest(`${url}/${body.data.id}/listings`, "POST", { listingId: "l2" }, cookie), params({ id: body.data.id }));

    expect(res.status).toBe(200);
    expect((await res.json()).data.listingIds).toEqual(["l2"]);
  });

  test("another user's wishlist is 404, and so is an unknown listing", async () => {
    const { body } = await createList(sessionCookieHeader(), { name: "Private" });
    const stranger = sessionCookieHeader();

    const foreign = await addListing(jsonRequest(`${url}/${body.data.id}/listings`, "POST", { listingId: "l2" }, stranger), params({ id: body.data.id }));
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).error).toBe("Wishlist not found");

    const owner = sessionCookieHeader();
    const own = await createList(owner, { name: "Mine" });
    const unknown = await addListing(jsonRequest(`${url}/${own.body.data.id}/listings`, "POST", { listingId: "l999" }, owner), params({ id: own.body.data.id }));
    expect(unknown.status).toBe(404);
  });

  test("unsaving removes the listing from every list", async () => {
    const cookie = sessionCookieHeader();
    await createList(cookie, { name: "A", listingId: "l3" });
    await createList(cookie, { name: "B", listingId: "l3" });

    const res = await unsave(jsonRequest(`${url}/saved/l3`, "DELETE", undefined, cookie), params({ listingId: "l3" }));

    expect(res.status).toBe(200);
    const all = await (await GET(new Request(url, { headers: { cookie } }))).json();
    expect(all.data.every((w: { listingIds: string[] }) => w.listingIds.length === 0)).toBe(true);
  });
});
