import type { City } from "@/lib/types";

export interface CityRepository {
  findAll(): Promise<City[]>;
}
