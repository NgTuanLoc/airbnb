"use client";

import { useCallback, useRef, useState } from "react";
import { Bell, Megaphone } from "lucide-react";
import { useLightDismiss } from "@/lib/hooks/use-light-dismiss";
import type { Broadcast } from "@/lib/notifications/schemas";
import { timeAgo } from "@/lib/notifications/time-ago";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notifications-provider";

/**
 * The nav's bell: a count of the unread announcements, and a panel listing them, newest first. Opening it reads them
 * all; the ones that were new keep a dot while it's open. Nothing when announcements are off.
 */
export function NotificationBell() {
  const notifications = useNotifications();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Taken as the panel opens: the newest id read before, and the time its "5 minutes ago" labels count from.
  const [readBefore, setReadBefore] = useState(0);
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  const open = notifications?.panelOpen ?? false;
  const setPanelOpen = notifications?.setPanelOpen;
  const close = useCallback(() => setPanelOpen?.(false), [setPanelOpen]);
  useLightDismiss(open, close, rootRef, buttonRef);

  if (!notifications) return null;
  const { broadcasts, unread, lastRead, news } = notifications;

  function toggle() {
    if (!open) {
      setReadBefore(lastRead);
      setOpenedAt(new Date());
    }
    setPanelOpen?.(!open);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
        className="relative flex size-11 items-center justify-center rounded-full hover:bg-surface-soft"
      >
        {/* Keyed by the news, so the bell swings again for each announcement that arrives. */}
        <Bell key={news?.id} aria-hidden className={cn("size-5 text-ink", news && "bell-ring")} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-rausch-text-bg px-1 text-badge text-on-primary ring-2 ring-canvas"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {/* z-50: above the sticky search bar (z-40), like the account menu. */}
      {open && (
        <section
          aria-labelledby="notifications-title"
          className="search-pop-in fixed inset-x-4 top-22 z-50 overflow-hidden rounded-md bg-canvas shadow-airbnb md:absolute md:inset-x-auto md:right-0 md:top-14 md:w-96"
        >
          <h2 id="notifications-title" className="border-b border-hairline-soft px-6 py-4 text-title-md text-ink">
            Notifications
          </h2>
          {broadcasts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span aria-hidden className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-strong">
                <Bell className="size-5 text-ink" />
              </span>
              <p className="text-title-sm text-ink">No notifications yet</p>
              <p className="mt-1 text-body-sm text-muted">Announcements from Airbnb show up here.</p>
            </div>
          ) : (
            <ul className="max-h-120 overflow-y-auto py-2">
              {broadcasts.map((broadcast) => (
                <BroadcastRow key={broadcast.id} broadcast={broadcast} isNew={broadcast.id > readBefore} now={openedAt} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function BroadcastRow({ broadcast, isNew, now }: Readonly<{ broadcast: Broadcast; isNew: boolean; now: Date | null }>) {
  return (
    <li className="flex items-start gap-4 px-6 py-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-strong">
        <Megaphone className="size-4 text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="wrap-break-word text-body-sm text-ink">{broadcast.text}</p>
        <time dateTime={broadcast.sentAt.toISOString()} className="mt-1 block text-caption-sm text-muted">
          {timeAgo(broadcast.sentAt, now ?? broadcast.sentAt)}
        </time>
      </div>
      {isNew && (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-rausch">
          <span className="sr-only">New</span>
        </span>
      )}
    </li>
  );
}
