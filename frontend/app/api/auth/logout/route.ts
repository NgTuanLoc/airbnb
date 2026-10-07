import { withErrorEnvelope } from "@/lib/api/request";
import { ok } from "@/lib/api/envelope";
import { getAuthGateway } from "@/lib/auth/gateway";
import { clearedSessionCookie, cookieValue } from "@/lib/auth/session";

export const POST = withErrorEnvelope(async (request: Request) => {
  const token = cookieValue(request);
  if (token) {
    try {
      await getAuthGateway().logout(token);
    } catch (error) {
      // The cookie is cleared regardless: a backend outage must not keep someone logged in here.
      console.error("Revoking the session failed", error);
    }
  }
  return Response.json(ok(null), { headers: { "Set-Cookie": clearedSessionCookie() } });
});
