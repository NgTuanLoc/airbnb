import { z } from "zod";
import type { User } from "@/lib/types";
import { getAuthGateway } from "./gateway";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const userSchema = z.object({ id: z.string().min(1), name: z.string().min(1), email: z.email() });

/** The mock user for an email: the same email always maps to the same id, whatever its case or spacing. */
export function userFromCredentials(email: string, name?: string): User {
  const normalized = email.trim().toLowerCase();
  return { id: `u-${normalized}`, name: name?.trim() || normalized.split("@")[0], email: normalized };
}

// The mock gateway's token format (dev/test only). Deliberately unsigned: no real credentials exist in mock mode.
export function encodeSession(user: User): string {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

/** The user in a session cookie value; anything unreadable is simply "logged out". */
export function decodeSession(value: string | undefined): User | null {
  if (!value) return null;
  try {
    const parsed = userSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** The session token in a request's cookie header, if any. */
export function cookieValue(request: Request): string | undefined {
  const entry = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1) || undefined;
}

/** The session of a route handler's request; a backend outage reads as logged out (plan ruling). */
export async function sessionFromRequest(request: Request): Promise<User | null> {
  const token = cookieValue(request);
  return token ? userForToken(token) : null;
}

/** The user for a session token through the auth gateway; null when unknown, expired or unreachable. */
export async function userForToken(token: string): Promise<User | null> {
  try {
    return await getAuthGateway().me(token);
  } catch (error) {
    console.error("Reading the session failed", error);
    return null;
  }
}
