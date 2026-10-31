// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { ok } from "./envelope";
import { parseBody, withErrorEnvelope } from "./request";
import { traceHeaders } from "./trace";

describe("withErrorEnvelope", () => {
  test("passes a handler's response through", async () => {
    const handler = withErrorEnvelope(async () => Response.json({ success: true }, { status: 201 }));
    const response = await handler(new Request("http://localhost/api/x"));
    expect(response.status).toBe(201);
  });

  test("turns a thrown error into a 500 envelope and logs it with its trace", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorEnvelope(async () => {
      throw new Error("GET /api/listings failed: connect ECONNREFUSED");
    });

    const response = await handler(new Request("http://localhost/api/listings", { method: "GET" }));

    expect(response.status).toBe(500);
    const traceId = response.headers.get("x-trace-id");
    expect(await response.json()).toEqual({ success: false, error: "Something went wrong. Try again.", traceId });
    expect(log).toHaveBeenCalledWith(`GET /api/listings failed (trace ${traceId})`, expect.any(Error));
    log.mockRestore();
  });

  test("names each request's trace in the x-trace-id header and the envelope, and passes it on to the backend", async () => {
    let passedOn: string | undefined;
    const handler = withErrorEnvelope(async () => {
      passedOn = traceHeaders().traceparent;
      return Response.json(ok(["l1"]));
    });

    const response = await handler(new Request("http://localhost/api/listings"));

    const traceId = response.headers.get("x-trace-id");
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(await response.json()).toEqual({ success: true, data: ["l1"], traceId });
    expect(passedOn).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
    const other = await handler(new Request("http://localhost/api/listings"));
    expect(other.headers.get("x-trace-id")).not.toBe(traceId);
  });

  test("names the trace on responses whose headers can't change, like redirects", async () => {
    const handler = withErrorEnvelope(async () => Response.redirect("http://localhost/trips", 303));

    const response = await handler(new Request("http://localhost/api/auth/callback/google"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/trips");
    expect(response.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{32}$/);
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
