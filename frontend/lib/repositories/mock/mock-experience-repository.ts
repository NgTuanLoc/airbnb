import type { Experience } from "@/lib/types";
import { experiences } from "@/lib/data/experiences";
import type { ExperienceFilters, ExperienceRepository } from "../experience-repository";

export const mockExperienceRepository: ExperienceRepository = {
  findAll(filters?: ExperienceFilters): Promise<Experience[]> {
    const category = filters?.category;
    if (!category || category === "All") return Promise.resolve(experiences);
    return Promise.resolve(experiences.filter((e) => e.category === category));
  },

  findById(id: string): Promise<Experience | null> {
    return Promise.resolve(experiences.find((e) => e.id === id) ?? null);
  },
};
