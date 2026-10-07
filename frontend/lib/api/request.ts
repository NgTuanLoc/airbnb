import type { z } from "zod";
import { fail } from "./envelope";

export function jsonError(message: string, status: number): Response {
  return Response.json(fail(message), { status });
}

export function unauthorized(): Response {
  return jsonError("Log in to continue", 401);
}

/** Parses a JSON body with a Zod schema; on failure, a ready 400 envelope naming the first problem. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
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

/** Route handlers never answer with a bare 500: anything thrown becomes the error envelope (and is logged here). */
export function withErrorEnvelope<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return async (request, ...rest) => {
    try {
      return await handler(request, ...rest);
    } catch (error) {
      console.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
      return jsonError("Something went wrong. Try again.", 500);
    }
  };
}
