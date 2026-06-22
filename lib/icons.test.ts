import { describe, expect, test } from "vitest";
import { Wifi, TreePine, Camera, Circle } from "lucide-react";
import { getAmenityIcon, getCategoryIcon } from "./icons";

describe("getAmenityIcon", () => {
  test("returns the matching icon for a known amenity", () => {
    expect(getAmenityIcon("Wifi")).toBe(Wifi);
  });

  test("returns the Circle fallback for an unknown amenity", () => {
    expect(getAmenityIcon("Helipad")).toBe(Circle);
  });
});

describe("getCategoryIcon", () => {
  test("returns the matching icon for a homes category", () => {
    expect(getCategoryIcon("Cabins")).toBe(TreePine);
  });

  test("returns the matching icon for a services category", () => {
    expect(getCategoryIcon("Photography")).toBe(Camera);
  });

  test("returns the Circle fallback for an unknown category", () => {
    expect(getCategoryIcon("Spaceships")).toBe(Circle);
  });
});
