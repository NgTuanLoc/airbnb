import "server-only";
import { dataSource } from "@/lib/data-source";

/** Live announcements need the notification service: on in api mode once NOTIFICATIONS_HTTP is set. */
export function broadcastsEnabled(): boolean {
  return dataSource().kind === "api" && Boolean(process.env.NOTIFICATIONS_HTTP);
}
