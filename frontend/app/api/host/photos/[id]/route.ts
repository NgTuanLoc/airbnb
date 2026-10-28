import { jsonError, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { dataSource } from "@/lib/data-source";
import { relayToApi } from "@/lib/api/relay";
import { uploadedPhotoId, uploadedPhotoUrl } from "@/lib/host/uploaded-photos";

/** An uploaded photo's processing status, for its uploader only (the backend checks ownership). */
export const GET = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const source = dataSource();
  if (source.kind !== "api") return jsonError("Not found", 404);
  if (!(await sessionFromRequest(request))) return unauthorized();
  const id = uploadedPhotoId(uploadedPhotoUrl((await params).id));
  if (!id) return jsonError("Photo not found", 404);
  return relayToApi(source.baseUrl, `/api/photos/${id}`, request);
});
