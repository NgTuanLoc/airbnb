import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

/** The response header naming a request's trace, as the .NET services name theirs. */
export const TRACE_HEADER = "x-trace-id";

const current = new AsyncLocalStorage<string>();

/**
 * Handles a request in a trace of its own: its envelope names it, and its calls to the backend pass it on, so its id
 * finds the whole request in the Aspire dashboard's Traces. (This server exports no spans of its own.)
 */
export function inNewTrace<T>(handle: (traceId: string) => T): T {
  const traceId = randomBytes(16).toString("hex");
  return current.run(traceId, () => handle(traceId));
}

/** The trace of the request being handled, if any. */
export function currentTraceId(): string | undefined {
  return current.getStore();
}

/** The W3C traceparent for a call to a backend service: the request's trace goes on there. Empty outside a request. */
export function traceHeaders(): Record<string, string> {
  const traceId = current.getStore();
  return traceId ? { traceparent: `00-${traceId}-${randomBytes(8).toString("hex")}-01` } : {};
}
