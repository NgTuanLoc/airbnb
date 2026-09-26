import type { Experience } from "@/lib/types";

export interface ExperienceFilters {
  category?: string;
}

export interface ExperienceRepository {
  findAll(filters?: ExperienceFilters): Promise<Experience[]>;
  findById(id: string): Promise<Experience | null>;
}
