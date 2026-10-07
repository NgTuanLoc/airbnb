import { withErrorEnvelope } from "@/lib/api/request";
import { ok } from "@/lib/api/envelope";
import { clearedSessionCookie } from "@/lib/auth/session";

export const POST = withErrorEnvelope(async () => {
  return Response.json(ok(null), { headers: { "Set-Cookie": clearedSessionCookie() } });
});
