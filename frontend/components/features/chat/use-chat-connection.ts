"use client";

import { useEffect, useState } from "react";
import { connectChat, type ChatConnection, type ChatStatus } from "@/lib/chat/connection";

export const CONNECT_ERROR = "Couldn't connect to messages. Refresh the page to try again.";

export type ConnectionStatus = "connecting" | ChatStatus;

/**
 * One hub connection for the component's lifetime, stopped on unmount (strict mode's second mount included), with
 * its status: only "connected" can send.
 */
export function useChatConnection(): { connection: ChatConnection | null; status: ConnectionStatus; error: string | null } {
  const [connection, setConnection] = useState<ChatConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let opened: ChatConnection | null = null;
    let offStatus: (() => void) | null = null;
    connectChat().then(
      (connected) => {
        if (!active) {
          void connected.stop();
          return;
        }
        opened = connected;
        offStatus = connected.onStatusChange(setStatus);
        setConnection(connected);
        setStatus("connected");
      },
      () => {
        if (active) setError(CONNECT_ERROR);
      },
    );
    return () => {
      active = false;
      // Unsubscribed first: stopping reports "disconnected", which an unmounted page has no use for.
      offStatus?.();
      void opened?.stop();
    };
  }, []);

  return { connection, status, error };
}
