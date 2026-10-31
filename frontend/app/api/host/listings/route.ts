import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { cookieValue, sessionFromRequest } from "@/lib/auth/session";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { checkUploadedPhotos } from "@/lib/host/photo-status";
import { getRepositories } from "@/lib/repositories";

export const POST = withErrorEnvelope(async (request: Request) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, hostListingInputSchema);
  if ("error" in body) return body.error;
  const photoProblem = await checkUploadedPhotos(body.data.photos, cookieValue(request) ?? null);
  if (photoProblem) return jsonError(photoProblem, 400);

  const repos = getRepositories();
  await repos.hostProfiles.upsertFromUser(user);
  const listing = await repos.hostListings.create(user.id, body.data);
  return Response.json(ok(listing), { status: 201 });
});
