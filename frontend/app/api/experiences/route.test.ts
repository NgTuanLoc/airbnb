import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GET /api/experiences", () => {
  test("returns a successful envelope with all experiences", async () => {
    const res = await GET(new Request("http://localhost/api/experiences"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
    expect(body.meta.page).toBe(1);
  });

  test("filters by the category query param", async () => {
    const res = await GET(new Request("http://localhost/api/experiences?category=Nature"));
    const body = await res.json();
    expect(body.data.every((e: { category: string }) => e.category === "Nature")).toBe(true);
  });
});
