"use client";

import { useCallback, useRef, useState } from "react";
import { Menu, UserCircle } from "lucide-react";
import { useLightDismiss } from "@/lib/hooks/use-light-dismiss";
import { useSessionState } from "./session-provider";
import { AccountLinks } from "./account-links";

const itemClass = "px-4 py-3 text-left text-body-sm text-ink hover:bg-surface-soft";

export function AccountMenu() {
  const session = useSessionState();
  const user = session?.user ?? null;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useLightDismiss(open, close, rootRef, buttonRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-11 items-center gap-2 rounded-full border border-hairline px-3"
      >
        <Menu aria-hidden className="size-4 text-ink" />
        {user ? (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-rausch-text-bg text-caption text-on-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircle aria-hidden className="size-7 text-muted" />
        )}
      </button>
      {/* z-50: above the sticky search bar (z-40), which the header doesn't contain. */}
      {open && (
        <div className="absolute right-0 top-12 z-50 flex w-56 flex-col rounded-sm bg-canvas py-2 shadow-airbnb">
          <AccountLinks itemClass={itemClass} />
        </div>
      )}
    </div>
  );
}
