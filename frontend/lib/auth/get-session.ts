import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";
import { clientIpFromHeader } from "./client-ip";
import { SESSION_COOKIE, userForToken } from "./session";
import { loginPath } from "./next-path";

/** The logged-in user for a server component, or null; one gateway call per request. */
export const getSession = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForToken(token, { clientIp: clientIpFromHeader((await headers()).get("x-forwarded-for")) });
});

/** The logged-in user, or a redirect to /login that comes back to `path` afterwards. */
export async function requireSession(path: string): Promise<User> {
  const user = await getSession();
  if (!user) redirect(loginPath(path));
  return user;
}
