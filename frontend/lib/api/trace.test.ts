// @vitest-environment node
import { describe, expect, test } from "vitest";
import { currentTraceId, inNewTrace, traceHeaders } from "./trace";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

describe("trace", () => {
  test("outside a request there's no trace to name or pass on", () => {
    expect(currentTraceId()).toBeUndefined();
    expect(traceHeaders()).toEqual({});
  });

  test("a request's trace is passed on to each backend call as a W3C traceparent, a new span each time", () => {
    inNewTrace((traceId) => {
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(currentTraceId()).toBe(traceId);
      const [first, second] = [traceHeaders().traceparent, traceHeaders().traceparent];
      expect(first?.match(TRACEPARENT)?.[1]).toBe(traceId);
      expect(second?.match(TRACEPARENT)?.[1]).toBe(traceId);
      expect(first).not.toBe(second);
    });
    expect(currentTraceId()).toBeUndefined();
  });

  test("requests handled at the same time keep their own traces across awaits", async () => {
    const seen = await Promise.all(
      [1, 2].map(() =>
        inNewTrace(async (traceId) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return [traceId, currentTraceId()];
        }),
      ),
    );

    expect(seen[0][0]).toBe(seen[0][1]);
    expect(seen[1][0]).toBe(seen[1][1]);
    expect(seen[0][0]).not.toBe(seen[1][0]);
  });
});
