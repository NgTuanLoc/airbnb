import { describe, expect, test } from "vitest";
import { GET } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/listings/[id]", () => {
  test("returns the listing", async () => {
    const res = await GET(new Request("http://localhost/api/listings/l2"), params("l2"));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: "l2", title: "Beachfront villa with infinity pool", pricePerNight: 540 });
  });

  test("an unknown listing is 404", async () => {
    const res = await GET(new Request("http://localhost/api/listings/l999"), params("l999"));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Listing 'l999' was not found");
  });
});
