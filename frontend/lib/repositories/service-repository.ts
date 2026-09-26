import type { Service } from "@/lib/types";

export interface ServiceFilters {
  category?: string;
}

export interface ServiceRepository {
  findAll(filters?: ServiceFilters): Promise<Service[]>;
  findById(id: string): Promise<Service | null>;
}
