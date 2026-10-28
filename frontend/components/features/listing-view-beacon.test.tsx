import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "@/lib/test-utils";
import { ListingViewBeacon } from "./listing-view-beacon";

describe("ListingViewBeacon", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("records one view per page view, even when strict mode runs effects twice", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);

    render(<StrictMode><ListingViewBeacon listingId="l1" /></StrictMode>);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/listings/l1/views", { method: "POST", keepalive: true });
  });

  test("a failed ping is ignored", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ListingViewBeacon listingId="l1" />);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});
