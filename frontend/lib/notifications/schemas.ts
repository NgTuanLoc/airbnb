import { z } from "zod";

/** The Server-Sent Events route the browser listens on, relayed from the notification service. */
export const BROADCAST_STREAM = "/api/notifications/stream";

/** One announcement, as the notification service sends it (services/notifications: Broadcast). */
export const broadcastSchema = z.object({
  id: z.number(),
  text: z.string().min(1),
  sentAt: z.coerce.date(),
});

export type Broadcast = z.infer<typeof broadcastSchema>;
