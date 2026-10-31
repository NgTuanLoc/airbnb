import { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";
import { traceHeaders } from "@/lib/api/trace";
import type { User } from "@/lib/types";
import type { AuthGateway, AuthResult, GatewayFailure, RequestContext } from "./gateway";

const REQUEST_TIMEOUT_MS = 5_000;
// Statuses the backend answers with a message meant for the person signing in.
const USER_FACING_STATUSES = new Set([400, 401, 409, 429]);
// External sign-in adds 404: a provider that isn't on, SSO not set up for a domain, a method that isn't connected.
const EXTERNAL_USER_FACING_STATUSES = new Set([...USER_FACING_STATUSES, 404]);

const token = z.string().regex(/^[A-Za-z0-9_-]+$/);
const userSchema = z.object({ id: z.string().min(1), name: z.string().min(1), email: z.email() });
const sessionSchema = z.object({ user: userSchema, token, expiresAt: z.string().min(1) });
const providersSchema = z.object({ social: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })), sso: z.boolean() });
// The browser is sent to authorizationUrl, so only an http(s) URL will do.
const startSchema = z.object({ authorizationUrl: z.url({ protocol: /^https?$/ }), flowId: token, provider: z.string().min(1) });
const completeSchema = z.union([
  z.object({ session: sessionSchema }),
  z.object({ linked: z.object({ provider: z.string().min(1), email: z.email() }) }),
]);
const connectionsSchema = z.object({
  hasPassword: z.boolean(),
  connections: z.array(z.object({
    provider: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["social", "sso"]),
    email: z.string().optional(),
    connectedAt: z.string().optional(),
  })),
});

function headers(context?: RequestContext, bearer?: string): HeadersInit {
  const result: Record<string, string> = { "content-type": "application/json", ...traceHeaders() };
  if (context?.clientIp) result["x-forwarded-for"] = context.clientIp;
  if (bearer) result.authorization = `Bearer ${bearer}`;
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

function failure(status: number, payload: unknown): GatewayFailure {
  const parsed = envelopeSchema(z.unknown()).safeParse(payload);
  const error = parsed.success && parsed.data.error ? parsed.data.error : "Something went wrong. Try again.";
  const code = parsed.success ? parsed.data.code : undefined;
  return code ? { ok: false, status, error, code } : { ok: false, status, error };
}

/** One backend call: the envelope's data on success, a failure for a user-facing status, a throw for anything else. */
async function call<T extends z.ZodType>(
  baseUrl: string,
  method: string,
  path: string,
  schema: T,
  options: { body?: object; bearer?: string; context?: RequestContext; userFacing?: Set<number> },
): Promise<{ ok: true; data: z.infer<T> } | GatewayFailure> {
  const response = await send(baseUrl, method, path, {
    headers: headers(options.context, options.bearer),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const parsed = envelopeSchema(schema).safeParse(payload);
    if (!parsed.success || parsed.data.data === undefined) throw new Error(`${method} ${path} returned an invalid payload`);
    return { ok: true, data: parsed.data.data };
  }
  if ((options.userFacing ?? EXTERNAL_USER_FACING_STATUSES).has(response.status)) return failure(response.status, payload);
  throw new Error(`${method} ${path} failed with ${response.status}`);
}

async function authenticate(baseUrl: string, path: string, body: object, context?: RequestContext): Promise<AuthResult> {
  const result = await call(baseUrl, "POST", path, sessionSchema, { body, context, userFacing: USER_FACING_STATUSES });
  return result.ok ? { ok: true, session: result.data } : result;
}

/** The backend's Identity module (spec section 2): sessions are opaque tokens the backend can revoke. */
export function createHttpAuthGateway(baseUrl: string): AuthGateway {
  return {
    register: (input, context) => authenticate(baseUrl, "/api/auth/register", input, context),
    login: (input, context) => authenticate(baseUrl, "/api/auth/login", input, context),
    async logout(bearer, context) {
      const response = await send(baseUrl, "POST", "/api/auth/logout", { headers: headers(context, bearer) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`POST /api/auth/logout failed with ${response.status}`);
    },
    async me(bearer, context): Promise<User | null> {
      const response = await send(baseUrl, "GET", "/api/auth/me", { headers: headers(context, bearer) });
      if (response.status === 401) {
        await response.body?.cancel();
        return null;
      }
      const parsed = envelopeSchema(userSchema).safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !parsed.success || !parsed.data.data) throw new Error(`GET /api/auth/me failed with ${response.status}`);
      return parsed.data.data;
    },
    async providers(context) {
      const result = await call(baseUrl, "GET", "/api/auth/providers", providersSchema, { context, userFacing: new Set() });
      if (!result.ok) throw new Error(`GET /api/auth/providers failed with ${result.status}`);
      return result.data;
    },
    async startExternal(input, context) {
      const result = await call(baseUrl, "POST", "/api/auth/external/start", startSchema, { body: input, bearer: context?.token, context });
      return result.ok ? { ok: true, ...result.data } : result;
    },
    async completeExternal(input, context) {
      const result = await call(baseUrl, "POST", "/api/auth/external/callback", completeSchema, { body: input, context });
      return result.ok ? { ok: true, ...result.data } : result;
    },
    async connections(bearer, context) {
      const result = await call(baseUrl, "GET", "/api/auth/connections", connectionsSchema, { bearer, context });
      if (result.ok) return result.data;
      if (result.status === 401) return null;
      throw new Error(`GET /api/auth/connections failed with ${result.status}`);
    },
    async disconnect(bearer, provider, context) {
      const path = `/api/auth/connections/${encodeURIComponent(provider)}`;
      const response = await send(baseUrl, "DELETE", path, { headers: headers(context, bearer) });
      if (response.status === 204) return null;
      const payload: unknown = await response.json().catch(() => undefined);
      if (EXTERNAL_USER_FACING_STATUSES.has(response.status)) return failure(response.status, payload);
      throw new Error(`DELETE ${path} failed with ${response.status}`);
    },
  };
}
