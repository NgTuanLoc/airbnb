import { ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/request";
import { loginSchema } from "@/lib/auth/schemas";
import { sessionCookie, userFromCredentials } from "@/lib/auth/session";

// Mock auth: any valid email and password logs in; nothing is checked against stored credentials.
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, loginSchema);
  if ("error" in body) return body.error;
  const user = userFromCredentials(body.data.email);
  return Response.json(ok(user), { headers: { "Set-Cookie": sessionCookie(user) } });
}
