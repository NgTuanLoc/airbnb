import { SESSION_COOKIE, encodeSession, userFromCredentials } from "./session";

/** A `cookie` header value for a logged-in guest; a fresh random email unless one is given. */
export function sessionCookieHeader(email = `guest-${crypto.randomUUID()}@example.com`): string {
  return `${SESSION_COOKIE}=${encodeSession(userFromCredentials(email))}`;
}

/** A JSON request for route handler tests; a string body is sent as-is (to test malformed JSON). */
export function jsonRequest(url: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
