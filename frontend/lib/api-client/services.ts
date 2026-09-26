import type { Service } from "@/lib/types";
import { servicesEnvelopeSchema } from "./schemas";

export async function fetchServices(category?: string): Promise<Service[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/services${query}`);
  const json: unknown = await res.json();
  const envelope = servicesEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load services");
  }
  return envelope.data ?? [];
}
