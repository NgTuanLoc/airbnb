import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { relayToApi } from "@/lib/api/relay";
import { jsonError, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { cookieValue } from "@/lib/auth/session";
import { chatHubUrl } from "@/lib/chat/config";
import { dataSource } from "@/lib/data-source";

const backendToken = z.object({ success: z.literal(true), data: z.object({ token: z.string(), expiresAt: z.string() }) });

/**
 * Trades the session for a short-lived chat token from the backend and says where the hub is (chat spec: "token
 * exchange"), so the browser finds the chat service at runtime and never holds the session token.
 */
export const GET = withErrorEnvelope(async (request: Request) => {
  const source = dataSource();
  if (source.kind !== "api") return jsonError("Messaging needs the backend", 404);
  if (!cookieValue(request)) return unauthorized();
  const hubUrl = chatHubUrl();
  if (!hubUrl) return jsonError("Messaging isn't configured", 503);

  const upstream = await relayToApi(source.baseUrl, "/api/auth/chat-token", request, { method: "POST" });
  if (upstream.status === 401) return unauthorized();
  if (upstream.status === 404) return jsonError("Messaging is off", 404);
  const parsed = backendToken.safeParse(await upstream.json().catch(() => undefined));
  if (!upstream.ok || !parsed.success) throw new Error(`POST /api/auth/chat-token failed with ${upstream.status}`);
  return Response.json(ok({ ...parsed.data.data, hubUrl }), { headers: { "cache-control": "no-store" } });
});
