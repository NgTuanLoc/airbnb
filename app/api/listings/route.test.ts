import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GET /api/listings", () => {
  test("returns a successful envelope with all listings", async () => {
    const res = await GET(new Request("http://localhost/api/listings"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
  });

  test("filters by the category query param", async () => {
    const res = await GET(new Request("http://localhost/api/listings?category=Cabins"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.every((l: { category: string }) => l.category === "Cabins")).toBe(true);
  });
});
