import { jsonError, withErrorEnvelope } from "@/lib/api/request";
import { dataSource } from "@/lib/data-source";
import { relayToApi } from "@/lib/host/photo-relay";
import { uploadedPhotoId, uploadedPhotoUrl } from "@/lib/host/uploaded-photos";

/** A processed host photo, public like the listing that shows it; the backend's cache headers pass through. */
export const GET = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const source = dataSource();
  if (source.kind !== "api") return jsonError("Not found", 404);
  const id = uploadedPhotoId(uploadedPhotoUrl((await params).id));
  if (!id) return jsonError("Photo not found", 404);
  return relayToApi(source.baseUrl, `/api/photos/${id}/image`, request);
});
