import { ok } from "@/lib/api/envelope";
import { clearedSessionCookie } from "@/lib/auth/session";

export async function POST(): Promise<Response> {
  return Response.json(ok(null), { headers: { "Set-Cookie": clearedSessionCookie() } });
}
