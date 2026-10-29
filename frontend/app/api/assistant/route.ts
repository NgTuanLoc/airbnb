import { relayToApi } from "@/lib/api/relay";
import { jsonError, withErrorEnvelope } from "@/lib/api/request";
import { dataSource } from "@/lib/data-source";

// A local model on CPU can take a while to finish an answer; the stream carries it piece by piece meanwhile.
const ANSWER_TIMEOUT_MS = 180_000;

/**
 * A guest's question for the assistant (no sign-in needed: it only reads public listings). Relayed with the browser's
 * IP for the assistant's rate limit, never the session, and the answer streamed back as it's written.
 */
export const POST = withErrorEnvelope(async (request: Request) => {
  if (dataSource().kind !== "api") return jsonError("The assistant needs the backend", 404);
  const baseUrl = process.env.ASSISTANT_HTTP;
  if (!baseUrl) return jsonError("The assistant isn't configured", 503);
  return relayToApi(baseUrl, "/ask", request, { method: "POST", session: false, timeoutMs: ANSWER_TIMEOUT_MS });
});
