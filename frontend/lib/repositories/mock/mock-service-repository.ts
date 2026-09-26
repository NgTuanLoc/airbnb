import type { Service } from "@/lib/types";
import { services } from "@/lib/data/services";
import type { ServiceFilters, ServiceRepository } from "../service-repository";

export const mockServiceRepository: ServiceRepository = {
  async findAll(filters?: ServiceFilters): Promise<Service[]> {
    const category = filters?.category;
    if (!category || category === "All") return services;
    return services.filter((s) => s.serviceCategory === category);
  },

  async findById(id: string): Promise<Service | null> {
    return services.find((s) => s.id === id) ?? null;
  },
};
