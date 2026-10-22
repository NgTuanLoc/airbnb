import { clientIp } from "@/lib/auth/client-ip";
import { cookieValue } from "@/lib/auth/session";

const DEFAULT_TIMEOUT_MS = 5_000;
// Headers worth passing back to the browser: the body's type and how long it may be cached.
const PASSED_BACK = ["content-type", "cache-control", "etag"];

/**
 * Sends a request on to the backend's Media endpoints and streams the answer back unchanged: the session's token as
 * the bearer, the browser's IP for the rate limiter, and (for uploads) the multipart body as it arrived.
 */
export async function relayToApi(
  baseUrl: string,
  path: string,
  request: Request,
  options: { method?: "GET" | "POST"; timeoutMs?: number } = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  const headers = new Headers();
  const token = cookieValue(request);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const ip = clientIp(request);
  if (ip) headers.set("x-forwarded-for", ip);
  const contentType = request.headers.get("content-type");
  if (method === "POST" && contentType) headers.set("content-type", contentType);

  const upstream = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: method === "POST" ? request.body : undefined,
    // Required by Node's fetch to stream a request body.
    ...(method === "POST" ? { duplex: "half" } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  } as RequestInit);

  const passed = new Headers();
  for (const name of PASSED_BACK) {
    const value = upstream.headers.get(name);
    if (value) passed.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: passed });
}
