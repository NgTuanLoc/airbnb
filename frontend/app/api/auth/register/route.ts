import { ok } from "@/lib/api/envelope";
import { parseBody, withErrorEnvelope } from "@/lib/api/request";
import { registerSchema } from "@/lib/auth/schemas";
import { sessionCookie, userFromCredentials } from "@/lib/auth/session";

// Mock auth: registering just starts a session with the given name; no account is stored.
export const POST = withErrorEnvelope(async (request: Request) => {
  const body = await parseBody(request, registerSchema);
  if ("error" in body) return body.error;
  const user = userFromCredentials(body.data.email, body.data.name);
  return Response.json(ok(user), { status: 201, headers: { "Set-Cookie": sessionCookie(user) } });
});
