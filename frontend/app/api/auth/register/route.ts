import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, withErrorEnvelope } from "@/lib/api/request";
import { clientIp } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { registerSchema } from "@/lib/auth/schemas";
import { revokePreviousSession, sessionCookie } from "@/lib/auth/session";

export const POST = withErrorEnvelope(async (request: Request) => {
  const body = await parseBody(request, registerSchema);
  if ("error" in body) return body.error;
  const { name, email, password } = body.data;
  const result = await getAuthGateway().register({ name, email, password }, { clientIp: clientIp(request) });
  if (!result.ok) return jsonError(result.error, result.status);
  await revokePreviousSession(request, result.session.token);
  return Response.json(ok(result.session.user), { status: 201, headers: { "Set-Cookie": sessionCookie(result.session.token) } });
});
