/**
 * The browser's IP from the incoming request, to forward to the backend's rate limiter. It is the LAST
 * x-forwarded-for entry: the first is client-controlled and spoofable, the last is appended by the nearest proxy.
 * Deployment assumption: the last entry is only trustworthy when a proxy in front of Next appends x-forwarded-for.
 * Exposed directly, a client could pick its own rate-limit bucket.
 */
export function clientIpFromHeader(value: string | null): string | undefined {
  return value?.split(",").at(-1)?.trim() || undefined;
}

export function clientIp(request: Request): string | undefined {
  return clientIpFromHeader(request.headers.get("x-forwarded-for"));
}
