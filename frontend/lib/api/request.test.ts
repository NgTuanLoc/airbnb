// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { parseBody, withErrorEnvelope } from "./request";

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

describe("parseBody", () => {
  const schema = z.object({ a: z.string() });
  const post = (contentType?: string) =>
    new Request("http://localhost/api/x", { method: "POST", headers: contentType ? { "content-type": contentType } : {}, body: '{"a":"b"}' });

  test("refuses a body that is not declared as JSON with a 415, so a text/plain form post cannot reach a handler", async () => {
    for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded"]) {
      const result = await parseBody(post(type), schema);
      expect("error" in result && result.error.status).toBe(415);
    }
  });

  test("accepts application/json, with or without a charset", async () => {
    expect(await parseBody(post("application/json"), schema)).toEqual({ data: { a: "b" } });
    expect(await parseBody(post("application/json; charset=utf-8"), schema)).toEqual({ data: { a: "b" } });
  });
});
