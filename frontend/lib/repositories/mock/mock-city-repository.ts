import type { City } from "@/lib/types";
import { cities } from "@/lib/data/cities";
import type { CityRepository } from "../city-repository";

export const mockCityRepository: CityRepository = {
  async findAll(): Promise<City[]> {
    return cities;
  },
};
