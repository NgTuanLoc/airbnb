import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, withErrorEnvelope } from "@/lib/api/request";
import { clientIp } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { loginSchema } from "@/lib/auth/schemas";
import { revokePreviousSession, sessionCookie } from "@/lib/auth/session";

export const POST = withErrorEnvelope(async (request: Request) => {
  const body = await parseBody(request, loginSchema);
  if ("error" in body) return body.error;
  const result = await getAuthGateway().login(body.data, { clientIp: clientIp(request) });
  if (!result.ok) return jsonError(result.error, result.status);
  await revokePreviousSession(request, result.session.token);
  return Response.json(ok(result.session.user), { headers: { "Set-Cookie": sessionCookie(result.session.token) } });
});
