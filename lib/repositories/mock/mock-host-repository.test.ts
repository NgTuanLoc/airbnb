import { describe, expect, test } from "vitest";
import { mockHostRepository } from "./mock-host-repository";

describe("mockHostRepository", () => {
  test("findById returns the host when it exists", async () => {
    const host = await mockHostRepository.findById("h1");
    expect(host?.id).toBe("h1");
  });

  test("findById returns null when the host is missing", async () => {
    expect(await mockHostRepository.findById("nope")).toBeNull();
  });
});
