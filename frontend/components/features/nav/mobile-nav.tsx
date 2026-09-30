"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NewBadge } from "@/components/design-system/badges";
import { AccountLinks } from "@/components/features/auth/account-links";
import { NAV_TABS, type Product } from "@/lib/nav";
import { cn } from "@/lib/utils";

const itemClass = "block px-4 py-3 text-left text-body-md text-ink hover:bg-surface-soft";

export function MobileNav({ active }: { active: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-11 items-center justify-center rounded-full border border-hairline md:hidden"
      >
        <Menu aria-hidden className="size-5 text-ink" />
      </button>
      {open && <MobileNavSheet active={active} onClose={() => setOpen(false)} />}
    </>
  );
}

function MobileNavSheet({ active, onClose }: { active: Product; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Any link choice closes the sheet; the route change happens underneath.
  function closeOnLink(event: React.MouseEvent) {
    if ((event.target as Element).closest("a")) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Menu"
      onClose={onClose}
      onClick={closeOnLink}
      className="sheet-slide-up fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-t-lg bg-canvas p-0 pb-4 backdrop:bg-scrim/50"
    >
      <div className="flex justify-end px-4 pt-4">
        <button type="button" aria-label="Close menu" onClick={onClose} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-soft">
          <X aria-hidden className="size-5 text-ink" />
        </button>
      </div>
      <nav aria-label="Products" className="flex flex-col border-b border-hairline pb-2">
        {NAV_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === active ? "page" : undefined}
            className={cn(itemClass, "flex items-center gap-2", tab.id === active && "font-semibold")}
          >
            {tab.label}
            {tab.isNew && <NewBadge />}
          </Link>
        ))}
        <Link href="/host" className={itemClass}>Become a host</Link>
      </nav>
      <div className="flex flex-col pt-2">
        <AccountLinks itemClass={itemClass} />
      </div>
    </dialog>
  );
}
