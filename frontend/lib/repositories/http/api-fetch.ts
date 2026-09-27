import type { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * GETs a backend envelope and returns its validated `data`.
 * 404 resolves to null; any other failure throws an Error naming the path.
 * Skips Next's data cache: the backend caches.
 */
export async function apiFetch<T extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: T,
): Promise<z.infer<T> | null> {
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`GET ${path} failed: ${reason}`, { cause });
  }

  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }

  const body: unknown = await response.json().catch(() => undefined);
  const envelope = envelopeSchema(schema).safeParse(body);

  if (!response.ok) {
    const backendError = envelope.success && envelope.data.error ? `: ${envelope.data.error}` : "";
    throw new Error(`GET ${path} failed with ${response.status}${backendError}`);
  }
  if (!envelope.success) {
    throw new Error(`GET ${path} returned an invalid payload: ${envelope.error.message}`);
  }
  if (!envelope.data.success || envelope.data.data === undefined) {
    throw new Error(`GET ${path} returned no data${envelope.data.error ? `: ${envelope.data.error}` : ""}`);
  }
  return envelope.data.data as z.infer<T>;
}
