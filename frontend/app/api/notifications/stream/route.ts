import { withErrorEnvelope } from "@/lib/api/request";
import { traceHeaders } from "@/lib/api/trace";
import { broadcastsEnabled } from "@/lib/notifications/config";

// no-transform keeps the response out of compression, which would hold events back until a buffer filled.
const EVENT_STREAM_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" };
// An error status would make EventSource give up for good: while the service is unreachable it's told to retry later.
const RETRY_LATER = "retry: 15000\n\n";

/**
 * The live announcements (Server-Sent Events), relayed from the notification service so the browser stays on this
 * origin. The browser's Last-Event-ID goes along, so a page that reconnects gets the broadcasts it missed. No timeout:
 * the stream stays open until the browser leaves (its abort closes the service's stream too).
 */
export const GET = withErrorEnvelope(async (request: Request) => {
  // 204 tells EventSource not to reconnect: in mock mode there's no notification service.
  if (!broadcastsEnabled()) return new Response(null, { status: 204 });

  const headers = new Headers({ accept: "text/event-stream", ...traceHeaders() });
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers.set("last-event-id", lastEventId);
  try {
    const upstream = await fetch(new URL("/events", process.env.NOTIFICATIONS_HTTP), {
      headers,
      cache: "no-store",
      signal: request.signal,
    });
    if (upstream.ok && upstream.body) return new Response(upstream.body, { headers: EVENT_STREAM_HEADERS });
    console.error(`The notification service's event stream answered ${upstream.status}`);
  } catch (error) {
    if (!request.signal.aborted) console.error("Couldn't reach the notification service's event stream", error);
  }
  return new Response(RETRY_LATER, { headers: EVENT_STREAM_HEADERS });
});
