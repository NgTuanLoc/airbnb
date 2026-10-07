// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

const findAll = vi.fn();
vi.mock("@/lib/repositories", () => ({ getRepositories: () => ({ listings: { findAll } }) }));

import { GET } from "./route";

describe("GET /api/listings failures", () => {
  afterEach(() => vi.restoreAllMocks());

  test("a backend failure returns the 500 envelope instead of a bare 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findAll.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const response = await GET(new Request("http://localhost/api/listings"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Something went wrong. Try again." });
  });
});
