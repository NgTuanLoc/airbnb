import { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";
import type { User } from "@/lib/types";
import type { AuthGateway, AuthResult, RequestContext } from "./gateway";

const REQUEST_TIMEOUT_MS = 5_000;
// Statuses the backend answers with a message meant for the person signing in.
const USER_FACING_STATUSES = new Set([400, 401, 409, 429]);

const userSchema = z.object({ id: z.string().min(1), name: z.string().min(1), email: z.email() });
const sessionSchema = z.object({ user: userSchema, token: z.string().min(1), expiresAt: z.string().min(1) });

function headers(context?: RequestContext, token?: string): HeadersInit {
  const result: Record<string, string> = { "content-type": "application/json" };
  if (context?.clientIp) result["x-forwarded-for"] = context.clientIp;
  if (token) result.authorization = `Bearer ${token}`;
  return result;
}

async function send(baseUrl: string, method: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(new URL(path, baseUrl), { ...init, method, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${method} ${path} failed: ${reason}`, { cause });
  }
}

async function authenticate(baseUrl: string, path: string, body: object, context?: RequestContext): Promise<AuthResult> {
  const response = await send(baseUrl, "POST", path, { headers: headers(context), body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const parsed = envelopeSchema(sessionSchema).safeParse(payload);
    if (!parsed.success || !parsed.data.data) throw new Error(`POST ${path} returned an invalid payload`);
    return { ok: true, session: parsed.data.data };
  }
  if (USER_FACING_STATUSES.has(response.status)) {
    const parsed = envelopeSchema(z.unknown()).safeParse(payload);
    const error = parsed.success && parsed.data.error ? parsed.data.error : "Something went wrong. Try again.";
    return { ok: false, status: response.status, error };
  }
  throw new Error(`POST ${path} failed with ${response.status}`);
}

/** The backend's Identity module (spec section 2): sessions are opaque tokens the backend can revoke. */
export function createHttpAuthGateway(baseUrl: string): AuthGateway {
  return {
    register: (input, context) => authenticate(baseUrl, "/api/auth/register", input, context),
    login: (input, context) => authenticate(baseUrl, "/api/auth/login", input, context),
    async logout(token) {
      const response = await send(baseUrl, "POST", "/api/auth/logout", { headers: headers(undefined, token) });
      await response.body?.cancel();
    },
    async me(token): Promise<User | null> {
      const response = await send(baseUrl, "GET", "/api/auth/me", { headers: headers(undefined, token) });
      if (response.status === 401) {
        await response.body?.cancel();
        return null;
      }
      const parsed = envelopeSchema(userSchema).safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !parsed.success || !parsed.data.data) throw new Error(`GET /api/auth/me failed with ${response.status}`);
      return parsed.data.data;
    },
  };
}
