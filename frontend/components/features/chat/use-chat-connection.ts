"use client";

import { useEffect, useState } from "react";
import { connectChat, type ChatConnection } from "@/lib/chat/connection";

export const CONNECT_ERROR = "Couldn't connect to messages. Refresh the page to try again.";

/** One hub connection for the component's lifetime, stopped on unmount (strict mode's second mount included). */
export function useChatConnection(): { connection: ChatConnection | null; error: string | null } {
  const [connection, setConnection] = useState<ChatConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let opened: ChatConnection | null = null;
    connectChat().then(
      (connected) => {
        if (!active) {
          void connected.stop();
          return;
        }
        opened = connected;
        setConnection(connected);
      },
      () => {
        if (active) setError(CONNECT_ERROR);
      },
    );
    return () => {
      active = false;
      void opened?.stop();
    };
  }, []);

  return { connection, error };
}
