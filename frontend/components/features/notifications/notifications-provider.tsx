"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { BROADCAST_STREAM, broadcastSchema, type Broadcast } from "@/lib/notifications/schemas";
import { BroadcastToast } from "./broadcast-toast";

// The newest announcement id read on this browser: newer ones are unread.
const LAST_READ_KEY = "notifications:last-read";
// The service keeps its last 20, so a page never gets more.
const KEPT = 20;

export interface Notifications {
  /** Newest first: what was sent before the page opened, then each new one. */
  readonly broadcasts: readonly Broadcast[];
  /** How many are newer than the last one read (none while the panel is open). */
  readonly unread: number;
  /** The newest id read on this browser. */
  readonly lastRead: number;
  /** The latest announcement that arrived while the page was open, until it's dismissed or the panel opens. */
  readonly news: Broadcast | null;
  readonly panelOpen: boolean;
  /** Opening or closing the panel reads everything in it. */
  setPanelOpen(open: boolean): void;
}

const NotificationsContext = createContext<Notifications | null>(null);

/** The site announcements for the bell, or null when they're off (mock mode, or no notification service). */
export function useNotifications(): Notifications | null {
  return useContext(NotificationsContext);
}

/**
 * Site announcements, live from the notification service over Server-Sent Events (the Aspire dashboard's "Broadcast a
 * message"). One stream for the whole visit: the provider sits in the root layout, so it survives moving between pages.
 */
export function NotificationsProvider({ enabled, children }: Readonly<{ enabled: boolean; children: React.ReactNode }>) {
  return enabled ? <LiveNotifications>{children}</LiveNotifications> : children;
}

function LiveNotifications({ children }: Readonly<{ children: React.ReactNode }>) {
  const [broadcasts, setBroadcasts] = useState<readonly Broadcast[]>([]);
  const [lastRead, setLastRead] = useState(readLastRead);
  const [news, setNews] = useState<Broadcast | null>(null);
  const [panelOpen, setPanelOpenState] = useState(false);

  useEffect(() => {
    // EventSource reconnects by itself, sending the last id it saw, so a dropped connection misses nothing.
    const source = new EventSource(BROADCAST_STREAM);
    function receive(event: MessageEvent<string>): Broadcast | null {
      const parsed = broadcastSchema.safeParse(parseJson(event.data));
      if (!parsed.success) return null;
      const broadcast = parsed.data;
      setBroadcasts((list) =>
        list.some((listed) => listed.id === broadcast.id)
          ? list
          : [broadcast, ...list].sort((a, b) => b.id - a.id).slice(0, KEPT),
      );
      return broadcast;
    }
    // What was sent before the page opened only fills the bell; news also pops up.
    source.addEventListener("recent", receive);
    source.addEventListener("broadcast", (event) => {
      const broadcast = receive(event);
      if (broadcast) setNews(broadcast);
    });
    return () => source.close();
  }, []);

  function setPanelOpen(open: boolean) {
    setPanelOpenState(open);
    // The panel shows the news now (or showed it, on closing).
    setNews(null);
    const newest = broadcasts[0]?.id ?? 0;
    if (newest > lastRead) {
      setLastRead(newest);
      writeLastRead(newest);
    }
  }

  const unread = panelOpen ? 0 : broadcasts.filter((broadcast) => broadcast.id > lastRead).length;
  const value: Notifications = { broadcasts, unread, lastRead, news, panelOpen, setPanelOpen };
  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <BroadcastToast broadcast={news} hidden={panelOpen} onDismiss={() => setNews(null)} />
    </NotificationsContext.Provider>
  );
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// No storage (the server render, private browsing, blocked): everything counts as unread.
function readLastRead(): number {
  try {
    return Number(localStorage.getItem(LAST_READ_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastRead(id: number): void {
  try {
    localStorage.setItem(LAST_READ_KEY, String(id));
  } catch {
    // No storage: what was read is forgotten on the next visit.
  }
}
