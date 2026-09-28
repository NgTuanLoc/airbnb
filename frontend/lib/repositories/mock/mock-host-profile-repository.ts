import { DEFAULT_HOST_AVATAR } from "@/lib/host/options";
import type { Host } from "@/lib/types";
import type { HostProfileRepository } from "../host-profile-repository";

// In memory, by user id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Host> = ((globalThis as { __mockHostProfiles?: Map<string, Host> }).__mockHostProfiles ??= new Map());

export const mockHostProfileRepository: HostProfileRepository = {
  async upsertFromUser(user) {
    if (store.has(user.id)) return;
    store.set(user.id, {
      id: user.id,
      name: user.name,
      avatar: DEFAULT_HOST_AVATAR,
      isSuperhost: false,
      responseRate: 100,
      joinedYear: new Date().getFullYear(),
    });
  },

  async findById(id) {
    return store.get(id) ?? null;
  },
};
