"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useSessionState } from "@/components/features/auth/session-provider";
import { WISHLISTS_QUERY_KEY, fetchWishlists, removeFromWishlists } from "@/lib/api-client/wishlists";
import { loginPath } from "@/lib/auth/next-path";
import type { Listing, Wishlist } from "@/lib/types";
import { SaveToWishlistDialog } from "./save-to-wishlist-dialog";

export interface WishlistHearts {
  savedIds: ReadonlySet<string>;
  /** Logged out: go to login. Saved: unsave everywhere. Not saved: open the save dialog. */
  toggle: (listing: Listing) => void;
}

const WishlistHeartsContext = createContext<WishlistHearts | null>(null);
const NO_WISHLISTS: Wishlist[] = [];

export function WishlistHeartsProvider({
  children,
  redirectToLogin = (url) => window.location.assign(url),
}: {
  children: ReactNode;
  redirectToLogin?: (url: string) => void;
}) {
  const user = useSessionState()?.user ?? null;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per user, so a different login on the same browser never sees the previous user's cached lists.
  const queryKey = [...WISHLISTS_QUERY_KEY, user?.id];
  const { data: wishlists = NO_WISHLISTS } = useQuery({
    queryKey,
    queryFn: fetchWishlists,
    enabled: user !== null,
  });
  const savedIds = useMemo(() => new Set(user ? wishlists.flatMap((w) => w.listingIds) : []), [user, wishlists]);

  const unsave = useMutation({
    mutationFn: (listingId: string) => removeFromWishlists(listingId),
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Wishlist[]>(queryKey);
      queryClient.setQueryData<Wishlist[]>(queryKey, (lists = []) =>
        lists.map((w) => ({ ...w, listingIds: w.listingIds.filter((id) => id !== listingId) })),
      );
      return { previous };
    },
    onError: (_error, _listingId, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      setError("Couldn't remove it from your wishlist. Try again.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY }),
  });

  // Escape dismisses the unsave error toast, same as its button.
  useEffect(() => {
    if (!error) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setError(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [error]);

  function toggle(listing: Listing) {
    setError(null);
    if (!user) {
      redirectToLogin(loginPath(window.location.pathname + window.location.search));
      return;
    }
    if (savedIds.has(listing.id)) unsave.mutate(listing.id);
    else setPending(listing);
  }

  return (
    <WishlistHeartsContext.Provider value={{ savedIds, toggle }}>
      {children}
      {pending && <SaveToWishlistDialog listing={pending} wishlists={wishlists} onClose={() => setPending(null)} />}
      {error && (
        <div role="alert" className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-ink px-4 py-3 text-body-sm text-on-primary shadow-airbnb md:bottom-6">
          {error}
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="flex size-8 items-center justify-center rounded-full">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </WishlistHeartsContext.Provider>
  );
}

/** The hearts, or null outside a WishlistHeartsProvider (isolated tests), where cards show no heart. */
export function useWishlistHearts(): WishlistHearts | null {
  return useContext(WishlistHeartsContext);
}
