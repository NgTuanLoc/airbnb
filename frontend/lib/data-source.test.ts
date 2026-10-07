// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { dataSource } from "./data-source";

describe("dataSource", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("defaults to mock", () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect(dataSource()).toEqual({ kind: "mock" });
  });

  test("api mode carries the backend base url", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://localhost:5000");
    expect(dataSource()).toEqual({ kind: "api", baseUrl: "http://localhost:5000" });
  });

  test("api mode without API_HTTP and unknown values throw", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "");
    expect(() => dataSource()).toThrow("DATA_SOURCE=api needs API_HTTP");
    vi.stubEnv("DATA_SOURCE", "csv");
    expect(() => dataSource()).toThrow('DATA_SOURCE must be "mock" or "api", got "csv"');
  });
});
