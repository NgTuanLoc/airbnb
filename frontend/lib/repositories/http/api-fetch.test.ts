// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "./api-fetch";

const BASE = "http://backend.test";
const itemSchema = z.object({ id: z.string() });

function stubResponse(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  test("returns the envelope data on success", async () => {
    const fetchMock = stubResponse(200, { success: true, data: { id: "a" } });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).resolves.toEqual({ id: "a" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.test/api/things/a");
  });

  test("requests bypass the Next data cache and carry a timeout signal", async () => {
    const fetchMock = stubResponse(200, { success: true, data: { id: "a" } });

    await apiFetch(BASE, "/api/things/a", itemSchema);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("a 404 resolves to null", async () => {
    stubResponse(404, { success: false, error: "Thing 'x' was not found" });

    await expect(apiFetch(BASE, "/api/things/x", itemSchema)).resolves.toBeNull();
  });

  test("a 400 throws with the backend's message", async () => {
    stubResponse(400, { success: false, error: "Guests: The field Guests must be between 1 and 2147483647." });

    await expect(apiFetch(BASE, "/api/listings?guests=0", itemSchema)).rejects.toThrow(
      "GET /api/listings?guests=0 failed with 400: Guests: The field Guests must be between 1 and 2147483647.",
    );
  });

  test("a 5xx with a non-JSON body throws naming the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));

    await expect(apiFetch(BASE, "/api/things", itemSchema)).rejects.toThrow("GET /api/things failed with 502");
  });

  test("an invalid payload throws", async () => {
    stubResponse(200, { success: true, data: { id: 42 } });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).rejects.toThrow("GET /api/things/a returned an invalid payload");
  });

  test("a success envelope without data throws", async () => {
    stubResponse(200, { success: true });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).rejects.toThrow("GET /api/things/a returned no data");
  });

  test("a network failure or timeout throws naming the path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    await expect(apiFetch(BASE, "/api/things", itemSchema)).rejects.toThrow(
      "GET /api/things failed: The operation was aborted due to timeout",
    );
  });
});
