import { z } from "zod";

/** What the assistant service accepts (services/assistant: AskRequest). */
export const ASK_LIMITS = { maxMessages: 10, maxTextLength: 1000 } as const;

export interface AskMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AskRequest {
  messages: AskMessage[];
  /** The listing the guest is looking at, so "this place" means it. */
  listingId: string | null;
}

export const foundListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  city: z.string(),
  pricePerNight: z.number(),
  rating: z.number(),
});

/** One line of the answer's NDJSON stream. */
export const assistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("listings"), listings: z.array(foundListingSchema) }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type FoundListing = z.infer<typeof foundListingSchema>;
export type AssistantEvent = z.infer<typeof assistantEventSchema>;
