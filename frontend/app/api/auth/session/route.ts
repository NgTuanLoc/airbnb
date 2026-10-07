import { withErrorEnvelope } from "@/lib/api/request";
import { ok } from "@/lib/api/envelope";
import { sessionFromRequest } from "@/lib/auth/session";

export const GET = withErrorEnvelope(async (request: Request) => {
  return Response.json(ok(await sessionFromRequest(request)));
});
