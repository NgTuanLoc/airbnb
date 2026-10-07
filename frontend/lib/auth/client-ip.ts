/**
 * The browser's IP from the incoming request, to forward to the backend's rate limiter. It is the LAST
 * x-forwarded-for entry: the first is client-controlled and spoofable, the last is appended by the nearest proxy.
 * Deployment assumption: the last entry is only trustworthy when a proxy in front of Next appends x-forwarded-for.
 * Exposed directly, a client could pick its own rate-limit bucket.
 */
export function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || undefined;
}
