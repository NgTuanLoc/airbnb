import type { z } from "zod";
import { envelopeSchema } from "./schemas";

/** Calls one of our /api route handlers: returns the envelope's data, or throws with its error message. */
export async function callApi<T extends z.ZodType>(path: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body: unknown = await res.json().catch(() => undefined);
  const envelope = envelopeSchema(schema).safeParse(body);
  if (!envelope.success) throw new Error(`Unexpected response from ${path}`);
  if (!res.ok || !envelope.data.success) throw new Error(envelope.data.error ?? "Something went wrong");
  return envelope.data.data as z.infer<T>;
}
