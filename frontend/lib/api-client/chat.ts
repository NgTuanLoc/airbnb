import { z } from "zod";
import { callApi } from "./request";

/** Opens (or reopens) the signed-in guest's conversation about a listing. */
export function startConversation(listingId: string): Promise<{ id: string }> {
  return callApi("/api/chat/conversations", z.object({ id: z.string() }), {
    method: "POST",
    body: JSON.stringify({ listingId }),
  });
}
