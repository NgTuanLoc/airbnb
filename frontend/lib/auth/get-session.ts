import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, decodeSession } from "./session";
import { loginPath } from "./next-path";

/** The logged-in user for a server component, or null. */
export async function getSession(): Promise<User | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The logged-in user, or a redirect to /login that comes back to `path` afterwards. */
export async function requireSession(path: string): Promise<User> {
  const user = await getSession();
  if (!user) redirect(loginPath(path));
  return user;
}
