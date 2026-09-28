import { describe, expect, test } from "vitest";
import { loginPath, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  test("keeps same-site paths, including their query", () => {
    expect(safeNextPath("/trips")).toBe("/trips");
    expect(safeNextPath("/book/l1?checkIn=2026-10-01")).toBe("/book/l1?checkIn=2026-10-01");
  });

  test("safeNextPath rejects anything that isn't a same-site path", () => {
    for (const next of [
      undefined,
      null,
      "",
      "trips",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
    ]) {
      expect(safeNextPath(next)).toBe("/");
    }
  });

  test("an encoded tab stays a same-site path", () => {
    expect(safeNextPath("/%09/evil.com")).toBe("/%09/evil.com");
  });
});

test("loginPath encodes the path to come back to", () => {
  expect(loginPath("/book/l1?checkIn=2026-10-01&adults=2")).toBe("/login?next=%2Fbook%2Fl1%3FcheckIn%3D2026-10-01%26adults%3D2");
});
