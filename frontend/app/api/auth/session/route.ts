import { ok } from "@/lib/api/envelope";
import { sessionFromRequest } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  return Response.json(ok(sessionFromRequest(request)));
}
