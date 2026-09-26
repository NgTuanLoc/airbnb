import type { Host } from "@/lib/types";

export interface HostRepository {
  findById(id: string): Promise<Host | null>;
}
