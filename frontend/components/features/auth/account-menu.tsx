"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, UserCircle } from "lucide-react";
import { useSessionState } from "./session-provider";
import { AccountLinks } from "./account-links";

const itemClass = "px-4 py-3 text-left text-body-sm text-ink hover:bg-surface-soft";

export function AccountMenu() {
  const session = useSessionState();
  const user = session?.user ?? null;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // A disclosure, not an ARIA menu: Escape and a click outside close it.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

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
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-rausch text-caption text-on-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircle aria-hidden className="size-7 text-muted" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-20 flex w-56 flex-col rounded-sm bg-canvas py-2 shadow-airbnb">
          <AccountLinks itemClass={itemClass} />
        </div>
      )}
    </div>
  );
}
