// @vitest-environment node
import { expect, test } from "vitest";
import { clientIp, clientIpFromHeader } from "./client-ip";

test("the last x-forwarded-for entry is the one the nearest proxy appended", () => {
  const request = new Request("http://localhost/", { headers: { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" } });
  expect(clientIp(request)).toBe("10.0.0.1");
});

test("a single entry is the client ip", () => {
  const request = new Request("http://localhost/", { headers: { "x-forwarded-for": "203.0.113.7" } });
  expect(clientIp(request)).toBe("203.0.113.7");
});

test("no header means no client ip", () => {
  expect(clientIp(new Request("http://localhost/"))).toBeUndefined();
});

test("clientIpFromHeader applies the same last-entry rule to a raw header value", () => {
  expect(clientIpFromHeader("203.0.113.7, 10.0.0.1")).toBe("10.0.0.1");
  expect(clientIpFromHeader(null)).toBeUndefined();
  expect(clientIpFromHeader("")).toBeUndefined();
});
