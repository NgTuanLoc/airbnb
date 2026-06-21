import { describe, expect, test } from "vitest";

describe("test harness", () => {
  test("runs and asserts", () => {
    expect(1 + 1).toBe(2);
  });
});
