import type { Service } from "@/lib/types";
import { services } from "@/lib/data/services";
import type { ServiceFilters, ServiceRepository } from "../service-repository";

export const mockServiceRepository: ServiceRepository = {
  findAll(filters?: ServiceFilters): Promise<Service[]> {
    const category = filters?.category;
    if (!category || category === "All") return Promise.resolve(services);
    return Promise.resolve(services.filter((s) => s.serviceCategory === category));
  },

  findById(id: string): Promise<Service | null> {
    return Promise.resolve(services.find((s) => s.id === id) ?? null);
  },
};
