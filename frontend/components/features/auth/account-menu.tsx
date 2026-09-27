"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, UserCircle } from "lucide-react";
import { useSessionState } from "./session-provider";

const itemClass = "px-4 py-3 text-left text-body-sm text-ink hover:bg-surface-soft";

export function AccountMenu() {
  const session = useSessionState();
  const user = session?.user ?? null;
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-10 items-center gap-2 rounded-full border border-hairline px-3"
      >
        <Menu aria-hidden className="size-4 text-ink" />
        {user ? (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-rausch text-caption text-on-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircle aria-hidden className="size-7 text-muted" />
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-20 flex w-56 flex-col rounded-sm bg-canvas py-2 shadow-airbnb">
          {user ? (
            <>
              <p className="px-4 py-2 text-body-sm text-muted">{user.email}</p>
              <Link role="menuitem" href="/wishlists" className={itemClass}>Wishlists</Link>
              <Link role="menuitem" href="/trips" className={itemClass}>Trips</Link>
              <button role="menuitem" type="button" onClick={() => void session?.logout()} className={itemClass}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link role="menuitem" href="/login" className={itemClass}>Log in</Link>
              <Link role="menuitem" href="/register" className={itemClass}>Sign up</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
