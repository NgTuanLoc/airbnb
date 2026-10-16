import "server-only";
import { dataSource } from "@/lib/data-source";
import type { User } from "@/lib/types";
import { createHttpAuthGateway } from "./http-gateway";
import { mockAuthGateway } from "./mock-gateway";

export interface AuthSession { user: User; token: string; expiresAt: string }
/** A refusal meant for the person signing in; `code` tells failures apart (OAuth spec section 1). */
export interface GatewayFailure { ok: false; status: number; error: string; code?: string }
export type AuthResult = { ok: true; session: AuthSession } | GatewayFailure;
export interface RequestContext { clientIp?: string }

/** The sign-in buttons to show. SSO connections aren't listed: the SSO form finds one by email domain. */
export interface ProvidersInfo { social: { id: string; name: string }[]; sso: boolean }
export type StartResult = { ok: true; authorizationUrl: string; flowId: string; provider: string } | GatewayFailure;
/** A sign-in flow ends with a session; a connect flow ("link") with the provider account it connected. */
export type CompleteResult =
  | { ok: true; session: AuthSession }
  | { ok: true; linked: { provider: string; email: string } }
  | GatewayFailure;
export interface Connection { provider: string; name: string; kind: "social" | "sso"; email?: string; connectedAt?: string }
export interface ConnectionsInfo { hasPassword: boolean; connections: Connection[] }

export interface AuthGateway {
  register(input: { name: string; email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  login(input: { email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  /** Revokes the session; never fails for an unknown token. */
  logout(token: string, context?: RequestContext): Promise<void>;
  /** The token's user, or null when the session is unknown or expired. */
  me(token: string, context?: RequestContext): Promise<User | null>;
  providers(context?: RequestContext): Promise<ProvidersInfo>;
  /** Starts a Google, GitHub or SSO flow; provider "sso" finds the connection by email. `link` needs the session token. */
  startExternal(
    input: { provider: string; email?: string; link?: boolean },
    context?: RequestContext & { token?: string },
  ): Promise<StartResult>;
  /** Redeems the provider's callback for the flow in the browser's flow cookie. */
  completeExternal(
    input: { provider: string; flowId: string; state: string; code: string; iss?: string },
    context?: RequestContext,
  ): Promise<CompleteResult>;
  /** Login & security's sign-in methods, or null when the session is unknown or expired. */
  connections(token: string, context?: RequestContext): Promise<ConnectionsInfo | null>;
  /** Disconnects a provider: null when done, else why not. */
  disconnect(token: string, provider: string, context?: RequestContext): Promise<GatewayFailure | null>;
}

/** Mock accounts in DATA_SOURCE=mock, the backend's Identity module in api mode (spec section 2). */
export function getAuthGateway(): AuthGateway {
  const source = dataSource();
  return source.kind === "mock" ? mockAuthGateway : createHttpAuthGateway(source.baseUrl);
}
