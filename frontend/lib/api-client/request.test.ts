import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { callApi } from "./request";

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("callApi", () => {
  test("returns the envelope's data and sends JSON", async () => {
    const fetchMock = respond(200, { success: true, data: { id: "x" } });

    await expect(callApi("/api/thing", z.object({ id: z.string() }), { method: "POST", body: "{}" })).resolves.toEqual({ id: "x" });
    expect(fetchMock.mock.calls[0][1].headers["content-type"]).toBe("application/json");
  });

  test("throws the envelope's error message on failure", async () => {
    respond(409, { success: false, error: "Those dates are no longer available" });
    await expect(callApi("/api/bookings", z.object({}))).rejects.toThrow("Those dates are no longer available");
  });

  test("throws a generic message when the response isn't an envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    await expect(callApi("/api/thing", z.object({}))).rejects.toThrow("Unexpected response from /api/thing");
  });
});
