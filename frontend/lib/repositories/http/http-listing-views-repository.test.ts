import { afterEach, describe, expect, test, vi } from "vitest";
import { createHttpListingViewsRepository } from "./http-listing-views-repository";

const BASE = "http://api.test";

describe("http listing views repository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("returns the backend's weekly views", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, data: { listingId: "l1", last7Days: 48, previous7Days: 30 } }));
    vi.stubGlobal("fetch", fetchMock);

    const views = await createHttpListingViewsRepository(BASE).weekly("l1");

    expect(views).toEqual({ listingId: "l1", last7Days: 48, previous7Days: 30 });
    expect(String((fetchMock.mock.calls[0] as unknown as [URL])[0])).toBe(`${BASE}/api/listings/l1/views`);
  });

  test("a 404 is no stats", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false, error: "x" }, { status: 404 })));
    expect(await createHttpListingViewsRepository(BASE).weekly("l1")).toBeNull();
  });

  test("a stats outage is logged and reads as no stats, never an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await createHttpListingViewsRepository(BASE).weekly("l1")).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  test("an id that isn't a listing id never reaches the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await createHttpListingViewsRepository(BASE).weekly("..")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
