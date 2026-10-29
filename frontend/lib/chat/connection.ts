import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { z } from "zod";
import { callApi } from "@/lib/api-client/request";
import {
  chatMessageSchema,
  chatTokenSchema,
  conversationSummarySchema,
  readReceiptSchema,
  type ChatMessage,
  type ChatToken,
  type ConversationSummary,
} from "./schemas";

export type { ChatMessage, ConversationSummary } from "./schemas";

/** The chat hub, typed. Each `on…` returns its unsubscribe. */
export interface ChatConnection {
  listConversations(): Promise<ConversationSummary[]>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  send(conversationId: string, text: string): Promise<ChatMessage>;
  markRead(conversationId: string): Promise<void>;
  onMessage(handler: (message: ChatMessage) => void): () => void;
  onRead(handler: (receipt: { conversationId: string }) => void): () => void;
  onReconnected(handler: () => void): () => void;
  stop(): Promise<void>;
}

// SignalR wraps a refused call's reason ("…on the server. HubException: <reason>"); the reason is what people read.
const HUB_EXCEPTION = /HubException: ([\s\S]*)$/;

function hubError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(HUB_EXCEPTION.exec(message)?.[1] ?? message);
}

function fetchToken(): Promise<ChatToken> {
  return callApi("/api/chat/token", chatTokenSchema);
}

/**
 * Connects to the chat hub the server names (the gateway), over WebSockets without the negotiate request, so no
 * sticky sessions are needed in front of its instances. Reconnects on its own, with a fresh token each time.
 */
export async function connectChat(): Promise<ChatConnection> {
  const first = await fetchToken();
  let unused: string | null = first.token;
  const hub = new HubConnectionBuilder()
    .withUrl(first.hubUrl, {
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
      // Asked on every connect: the first token once, then a fresh one. Tokens last 10 minutes, and the hub closes a
      // connection when its token expires.
      accessTokenFactory: async () => {
        if (unused) {
          const token = unused;
          unused = null;
          return token;
        }
        return (await fetchToken()).token;
      },
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();
  const reconnected = new Set<() => void>();
  hub.onreconnected(() => reconnected.forEach((handler) => handler()));
  await hub.start();

  async function call<T>(schema: z.ZodType<T>, method: string, ...args: unknown[]): Promise<T> {
    let result: unknown;
    try {
      result = await hub.invoke(method, ...args);
    } catch (error) {
      throw hubError(error);
    }
    return schema.parse(result);
  }

  function on<T>(event: string, schema: z.ZodType<T>, handler: (payload: T) => void): () => void {
    const listener = (payload: unknown) => {
      const parsed = schema.safeParse(payload);
      if (parsed.success) handler(parsed.data);
    };
    hub.on(event, listener);
    return () => hub.off(event, listener);
  }

  return {
    listConversations: () => call(z.array(conversationSummarySchema), "ListConversations"),
    getMessages: (conversationId) => call(z.array(chatMessageSchema), "GetMessages", conversationId),
    send: (conversationId, text) => call(chatMessageSchema, "Send", conversationId, text),
    markRead: async (conversationId) => {
      await call(z.unknown(), "MarkRead", conversationId);
    },
    onMessage: (handler) => on("message", chatMessageSchema, handler),
    onRead: (handler) => on("read", readReceiptSchema, handler),
    onReconnected: (handler) => {
      reconnected.add(handler);
      return () => void reconnected.delete(handler);
    },
    stop: () => hub.stop(),
  };
}
