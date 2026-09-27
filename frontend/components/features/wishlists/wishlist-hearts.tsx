"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  const { data: wishlists = NO_WISHLISTS } = useQuery({
    queryKey: WISHLISTS_QUERY_KEY,
    queryFn: fetchWishlists,
    enabled: user !== null,
  });
  const savedIds = useMemo(() => new Set(user ? wishlists.flatMap((w) => w.listingIds) : []), [user, wishlists]);

  const unsave = useMutation({
    mutationFn: (listingId: string) => removeFromWishlists(listingId),
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: WISHLISTS_QUERY_KEY });
      const previous = queryClient.getQueryData<Wishlist[]>(WISHLISTS_QUERY_KEY);
      queryClient.setQueryData<Wishlist[]>(WISHLISTS_QUERY_KEY, (lists = []) =>
        lists.map((w) => ({ ...w, listingIds: w.listingIds.filter((id) => id !== listingId) })),
      );
      return { previous };
    },
    onError: (_error, _listingId, context) => {
      queryClient.setQueryData(WISHLISTS_QUERY_KEY, context?.previous);
      setError("Couldn't remove it from your wishlist. Try again.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY }),
  });

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
        <p role="alert" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-sm bg-ink px-4 py-3 text-body-sm text-on-primary shadow-airbnb">
          {error}
        </p>
      )}
    </WishlistHeartsContext.Provider>
  );
}

/** The hearts, or null outside a WishlistHeartsProvider (isolated tests), where cards show no heart. */
export function useWishlistHearts(): WishlistHearts | null {
  return useContext(WishlistHeartsContext);
}
