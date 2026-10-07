import "server-only";
import { dataSource } from "@/lib/data-source";
import type { User } from "@/lib/types";
import { createHttpAuthGateway } from "./http-gateway";
import { mockAuthGateway } from "./mock-gateway";

export interface AuthSession { user: User; token: string; expiresAt: string }
export type AuthResult = { ok: true; session: AuthSession } | { ok: false; status: number; error: string };
export interface RequestContext { clientIp?: string }

export interface AuthGateway {
  register(input: { name: string; email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  login(input: { email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  /** Revokes the session; never fails for an unknown token. */
  logout(token: string): Promise<void>;
  /** The token's user, or null when the session is unknown or expired. */
  me(token: string): Promise<User | null>;
}

/** Mock accounts in DATA_SOURCE=mock, the backend's Identity module in api mode (spec section 2). */
export function getAuthGateway(): AuthGateway {
  const source = dataSource();
  return source.kind === "mock" ? mockAuthGateway : createHttpAuthGateway(source.baseUrl);
}
