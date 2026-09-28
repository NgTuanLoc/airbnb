import { describe, expect, test } from "vitest";
import { DEFAULT_HOST_AVATAR } from "@/lib/host/options";
import { mockHostProfileRepository as repo } from "./mock-host-profile-repository";

describe("mockHostProfileRepository", () => {
  test("creates a profile from the user once and keeps it", async () => {
    const id = `u-${crypto.randomUUID()}@example.com`;
    await repo.upsertFromUser({ id, name: "Ana", email: "ana@example.com" });
    await repo.upsertFromUser({ id, name: "Renamed", email: "ana@example.com" });

    expect(await repo.findById(id)).toEqual({
      id, name: "Ana", avatar: DEFAULT_HOST_AVATAR, isSuperhost: false, responseRate: 100, joinedYear: new Date().getFullYear(),
    });
    expect(await repo.findById("u-nobody@example.com")).toBeNull();
  });
});
