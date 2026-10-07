// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { withErrorEnvelope } from "./request";

describe("withErrorEnvelope", () => {
  test("passes a handler's response through", async () => {
    const handler = withErrorEnvelope(async () => Response.json({ success: true }, { status: 201 }));
    const response = await handler(new Request("http://localhost/api/x"));
    expect(response.status).toBe(201);
  });

  test("turns a thrown error into a 500 envelope and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorEnvelope(async () => {
      throw new Error("GET /api/listings failed: connect ECONNREFUSED");
    });

    const response = await handler(new Request("http://localhost/api/listings", { method: "GET" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Something went wrong. Try again." });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
