import { jsonError, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { dataSource } from "@/lib/data-source";
import { relayToApi } from "@/lib/host/photo-relay";

// A 10 MB photo on a slow connection needs longer than the usual backend timeout.
const UPLOAD_TIMEOUT_MS = 30_000;

/** Uploads one photo (multipart field `file`) to the backend; only in api mode, where the Media module exists. */
export const POST = withErrorEnvelope(async (request: Request) => {
  const source = dataSource();
  if (source.kind !== "api") return jsonError("Not found", 404);
  if (!(await sessionFromRequest(request))) return unauthorized();
  return relayToApi(source.baseUrl, "/api/photos", request, { method: "POST", timeoutMs: UPLOAD_TIMEOUT_MS });
});
