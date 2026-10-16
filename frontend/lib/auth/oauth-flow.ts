import { z } from "zod";
import { readCookie, secureFlag } from "./session";

/**
 * The browser's half of an OAuth flow (OAuth spec section 2): the backend's flow id, where to go afterwards, and
 * whether it signs in or connects. httpOnly so scripts can't read the id; SameSite=Lax because the provider's
 * redirect back is a top-level GET; scoped to the auth routes and to the flow's 10 minutes.
 */
export const OAUTH_FLOW_COOKIE = "oauth_flow";
const FLOW_MAX_AGE_SECONDS = 10 * 60;
const FLOW_PATH = "/api/auth";

/** Where a connect flow comes back to, and where Login & security lives. */
export const ACCOUNT_SECURITY_PATH = "/account/security";

const flowSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  next: z.string(),
  intent: z.enum(["login", "link"]),
});
export type OAuthFlow = z.infer<typeof flowSchema>;

export function flowCookie(flow: OAuthFlow): string {
  const value = Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
  return `${OAUTH_FLOW_COOKIE}=${value}; Path=${FLOW_PATH}; HttpOnly; SameSite=Lax; Max-Age=${FLOW_MAX_AGE_SECONDS}${secureFlag()}`;
}

export function clearedFlowCookie(): string {
  return `${OAUTH_FLOW_COOKIE}=; Path=${FLOW_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

/** The flow a callback request belongs to; a missing or unreadable cookie means none. */
export function flowFromRequest(request: Request): OAuthFlow | null {
  const value = readCookie(request, OAUTH_FLOW_COOKIE);
  if (!value) return null;
  try {
    const parsed = flowSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
