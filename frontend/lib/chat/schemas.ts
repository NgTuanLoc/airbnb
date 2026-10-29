import { z } from "zod";

/** What the hub sends, as the chat service defines it (SignalR's camelCase JSON). */
export const conversationSummarySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  otherName: z.string(),
  role: z.enum(["guest", "host"]),
  lastMessageText: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unread: z.number().int(),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  text: z.string(),
  sentAt: z.string(),
});

export const readReceiptSchema = z.object({ conversationId: z.string() });

/** GET /api/chat/token: a short-lived token for the hub and where the hub is. */
export const chatTokenSchema = z.object({ token: z.string(), expiresAt: z.string(), hubUrl: z.string() });

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatToken = z.infer<typeof chatTokenSchema>;
