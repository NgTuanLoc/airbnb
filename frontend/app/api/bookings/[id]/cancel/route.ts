import { ok } from "@/lib/api/envelope";
import { jsonError, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";

export const POST = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const result = await getRepositories().bookings.cancel(user.id, id);
  if (result === "not-found") return jsonError("Booking not found", 404);
  if (result === "started") return jsonError("This trip has already started", 409);
  return Response.json(ok(result));
});
