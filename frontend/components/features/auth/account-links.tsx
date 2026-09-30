"use client";

import { useState } from "react";
import Link from "next/link";
import { useSessionState } from "./session-provider";

export const LOGOUT_ERROR = "Couldn't log you out. Try again.";

export function useLogout() {
  const session = useSessionState();
  const [error, setError] = useState<string | null>(null);
  async function logout() {
    setError(null);
    try {
      await session?.logout();
    } catch {
      setError(LOGOUT_ERROR);
    }
  }
  return { logout, error };
}

/** The session's account links, shared by the desktop AccountMenu and the mobile nav sheet. */
export function AccountLinks({ itemClass }: { itemClass: string }) {
  const user = useSessionState()?.user ?? null;
  const { logout, error } = useLogout();
  if (!user) {
    return (
      <>
        <Link href="/login" className={itemClass}>Log in</Link>
        <Link href="/register" className={itemClass}>Sign up</Link>
      </>
    );
  }
  return (
    <>
      <p className="px-4 py-2 text-body-sm text-muted">{user.email}</p>
      <Link href="/wishlists" className={itemClass}>Wishlists</Link>
      <Link href="/trips" className={itemClass}>Trips</Link>
      <Link href="/host/listings" className={itemClass}>Host dashboard</Link>
      <button type="button" onClick={() => void logout()} className={itemClass}>Log out</button>
      {error && <p role="alert" className="px-4 py-2 text-body-sm text-error">{error}</p>}
    </>
  );
}
