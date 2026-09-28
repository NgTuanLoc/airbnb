import type { Host, User } from "@/lib/types";

export interface HostProfileRepository {
  /** Creates the user's host profile the first time; later calls keep the original. */
  upsertFromUser(user: User): Promise<void>;
  findById(id: string): Promise<Host | null>;
}
