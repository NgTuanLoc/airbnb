import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { clientIp } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { safeNextPath } from "@/lib/auth/next-path";
import { ACCOUNT_SECURITY_PATH, flowCookie } from "@/lib/auth/oauth-flow";
import { cookieValue } from "@/lib/auth/session";

const startSchema = z.object({
  provider: z.string().min(1).max(64),
  next: z.string().max(2048).optional(),
  email: z.email("Enter a valid email address").max(254).optional(),
  link: z.boolean().optional(),
});

/**
 * Starts Google, GitHub or SSO (provider "sso" + email): the backend keeps the flow's secrets, the browser keeps the
 * flow id in the httpOnly flow cookie and goes to `redirectUrl` (OAuth spec section 2). JSON-only like the other auth
 * routes, so a cross-site form can't start a flow; "link" connects a provider to the signed-in account instead.
 */
export const POST = withErrorEnvelope(async (request: Request) => {
  const body = await parseBody(request, startSchema);
  if ("error" in body) return body.error;
  const { provider, email, link = false } = body.data;
  const token = cookieValue(request);
  if (link && !token) return unauthorized();

  const result = await getAuthGateway().startExternal({ provider, email, link }, { clientIp: clientIp(request), token: link ? token : undefined });
  if (!result.ok) return jsonError(result.error, result.status, result.code);

  const flow = link
    ? { id: result.flowId, next: ACCOUNT_SECURITY_PATH, intent: "link" as const }
    : { id: result.flowId, next: safeNextPath(body.data.next), intent: "login" as const };
  return Response.json(ok({ redirectUrl: result.authorizationUrl }), { headers: { "Set-Cookie": flowCookie(flow) } });
});
