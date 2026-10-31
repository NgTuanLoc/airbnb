import type { z } from "zod";
import { fail } from "./envelope";
import { inNewTrace, TRACE_HEADER } from "./trace";

export function jsonError(message: string, status: number, code?: string): Response {
  return Response.json(fail(message, code), { status });
}

export function unauthorized(): Response {
  return jsonError("Log in to continue", 401);
}

/** Parses a JSON body with a Zod schema; on failure, a ready 400 envelope naming the first problem. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return { error: jsonError("Request body must be JSON", 415) };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError("Request body must be JSON", 400) };
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { data: parsed.data }
    : { error: jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400) };
}

/**
 * Route handlers never answer with a bare 500: anything thrown becomes the error envelope (and is logged here). Each
 * request runs in a trace of its own, named on its response (the x-trace-id header and the envelope's traceId) and
 * passed on to the backend.
 */
export function withErrorEnvelope<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Response | Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return (request, ...rest) =>
    inNewTrace(async (traceId) => {
      let response: Response;
      try {
        response = await handler(request, ...rest);
      } catch (error) {
        console.error(`${request.method} ${new URL(request.url).pathname} failed (trace ${traceId})`, error);
        response = jsonError("Something went wrong. Try again.", 500);
      }
      return withTraceHeader(response, traceId);
    });
}

// Some responses' headers can't change (Response.redirect): those are copied to take it.
function withTraceHeader(response: Response, traceId: string): Response {
  try {
    response.headers.set(TRACE_HEADER, traceId);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(TRACE_HEADER, traceId);
    return copy;
  }
}
