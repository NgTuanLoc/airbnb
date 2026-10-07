import { ok } from "@/lib/api/envelope";
import { unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";

/** Unsaves a listing: removes it from every one of the user's wishlists. */
export const DELETE = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ listingId: string }> }) => {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const { listingId } = await params;
  await getRepositories().wishlists.removeListing(user.id, listingId);
  return Response.json(ok(null));
});
