import { assistantEnabled } from "@/lib/assistant/config";
import { AssistantChatBox } from "./assistant-chat-box";

/** The chat box on every page, when the assistant runs (api mode with ASSISTANT_HTTP); nothing otherwise. */
export function AssistantSlot() {
  return assistantEnabled() ? <AssistantChatBox /> : null;
}
