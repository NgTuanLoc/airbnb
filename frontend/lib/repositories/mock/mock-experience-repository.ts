import type { Experience } from "@/lib/types";
import { experiences } from "@/lib/data/experiences";
import type { ExperienceFilters, ExperienceRepository } from "../experience-repository";

export const mockExperienceRepository: ExperienceRepository = {
  async findAll(filters?: ExperienceFilters): Promise<Experience[]> {
    const category = filters?.category;
    if (!category || category === "All") return experiences;
    return experiences.filter((e) => e.category === category);
  },

  async findById(id: string): Promise<Experience | null> {
    return experiences.find((e) => e.id === id) ?? null;
  },
};
