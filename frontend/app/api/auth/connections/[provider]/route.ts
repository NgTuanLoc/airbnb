import { ok } from "@/lib/api/envelope";
import { jsonError, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { clientIp } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { cookieValue } from "@/lib/auth/session";

/** Disconnects a provider from Login & security; the backend refuses to remove the last way to sign in. */
export const DELETE = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const token = cookieValue(request);
  if (!token) return unauthorized();
  const { provider } = await params;
  const failure = await getAuthGateway().disconnect(token, provider, { clientIp: clientIp(request) });
  if (failure) return jsonError(failure.error, failure.status, failure.code);
  return Response.json(ok(null));
});
