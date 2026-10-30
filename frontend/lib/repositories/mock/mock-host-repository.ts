import type { Host } from "@/lib/types";
import { hosts } from "@/lib/data/hosts";
import type { HostRepository } from "../host-repository";

export const mockHostRepository: HostRepository = {
  findById(id: string): Promise<Host | null> {
    return Promise.resolve(hosts.find((h) => h.id === id) ?? null);
  },
};
