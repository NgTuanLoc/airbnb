import { broadcastsEnabled } from "@/lib/notifications/config";
import { BroadcastToast } from "./broadcast-toast";

/** Live announcements on every page, when the notification service runs (api mode with NOTIFICATIONS_HTTP). */
export function BroadcastSlot() {
  return broadcastsEnabled() ? <BroadcastToast /> : null;
}
