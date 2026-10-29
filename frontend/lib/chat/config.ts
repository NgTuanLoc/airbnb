import "server-only";
import { dataSource } from "@/lib/data-source";

/** Chat needs the backend (chat spec): it's on in api mode only. */
export function chatEnabled(): boolean {
  return dataSource().kind === "api";
}

/** Where the Next server reaches the chat service, and the key it vouches with; null until both are configured. */
export function chatService(): { baseUrl: string; serviceKey: string } | null {
  const baseUrl = process.env.CHAT_HTTP;
  const serviceKey = process.env.CHAT_SERVICE_KEY;
  return baseUrl && serviceKey ? { baseUrl, serviceKey } : null;
}

/** The hub's address as the browser reaches it, through the gateway; null until configured. */
export function chatHubUrl(): string | null {
  return process.env.CHAT_HUB_URL || null;
}
