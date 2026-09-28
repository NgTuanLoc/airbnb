const BASE = "http://x.invalid";

/**
 * A post-login target: same-site paths only, so ?next= can't send anyone to another site.
 * Resolved the way a browser would (it strips tabs and newlines, treats "\" as "/"), then the origin is compared.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

/** The login page, coming back to `next` afterwards. */
export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}
