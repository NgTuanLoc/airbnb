import { afterEach, describe, expect, test, vi } from "vitest";
import { listings } from "@/lib/data/listings";
import { createHostListing, setHostListingStatus, updateHostListing } from "./host";
import { validInput } from "@/lib/host/test-fixtures";
import { hostListingInputSchema } from "@/lib/host/schemas";

const input = hostListingInputSchema.parse(validInput);
const listing = { ...listings[0], id: "hl-1", status: "listed" as const };

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("host api-client", () => {
  test("create posts the input and returns the listing", async () => {
    const fetchMock = respond({ success: true, data: listing }, 201);
    await expect(createHostListing(input)).resolves.toMatchObject({ id: "hl-1" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/host/listings");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  test("update puts to the listing's url", async () => {
    const fetchMock = respond({ success: true, data: listing });
    await updateHostListing("hl-1", input);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/host/listings/hl-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  test("status patches and surfaces API errors", async () => {
    respond({ success: false, error: "Listing not found" }, 404);
    await expect(setHostListingStatus("hl-1", "unlisted")).rejects.toThrow("Listing not found");
  });
});
