import type { Experience } from "@/lib/types";
import { experiencesEnvelopeSchema } from "./schemas";

export async function fetchExperiences(category?: string): Promise<Experience[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/experiences${query}`);
  const json: unknown = await res.json();
  const envelope = experiencesEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load experiences");
  }
  return envelope.data ?? [];
}
