"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, fetchSession, logout as logoutRequest } from "@/lib/api-client/auth";
import type { User } from "@/lib/types";

export interface SessionState {
  user: User | null;
  isLoading: boolean;
  /** Re-reads the session, e.g. after logging in. */
  refresh: () => Promise<void>;
  /** Ends the session and reloads the app on /, which resets every client cache. */
  logout: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, staleTime: 0, retry: false });

  const value: SessionState = {
    user: data ?? null,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
    async logout() {
      await logoutRequest();
      window.location.assign("/");
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session, or null outside a SessionProvider (isolated component tests), which callers treat as logged out. */
export function useSessionState(): SessionState | null {
  return useContext(SessionContext);
}
