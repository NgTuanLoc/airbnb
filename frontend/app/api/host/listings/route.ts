import { ok } from "@/lib/api/envelope";
import { parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export const POST = withErrorEnvelope(async (request: Request) => {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, hostListingInputSchema);
  if ("error" in body) return body.error;

  const repos = getRepositories();
  await repos.hostProfiles.upsertFromUser(user);
  const listing = await repos.hostListings.create(user.id, body.data);
  return Response.json(ok(listing), { status: 201 });
});
