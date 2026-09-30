"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button, TextInput } from "@/components/design-system";
import { WISHLISTS_QUERY_KEY, addToWishlist, createWishlist } from "@/lib/api-client/wishlists";
import type { Listing, Wishlist } from "@/lib/types";
import { wishlistNameSchema } from "@/lib/wishlists/schemas";

export interface SaveToWishlistDialogProps {
  listing: Listing;
  wishlists: Wishlist[];
  onClose: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

export function SaveToWishlistDialog({ listing, wishlists, onClose }: SaveToWishlistDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(wishlists.length === 0);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // A native modal: focus trap, Esc and a backdrop without a UI library.
  // It unmounts on close, so focus goes back by hand to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  function done() {
    void queryClient.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY });
    onClose();
  }

  const save = useMutation({
    mutationFn: (wishlistId: string) => addToWishlist(wishlistId, listing.id),
    onSuccess: done,
    onError: (e) => setError(messageOf(e)),
  });
  const create = useMutation({
    mutationFn: (listName: string) => createWishlist({ name: listName, listingId: listing.id }),
    onSuccess: done,
    onError: (e) => setError(messageOf(e)),
  });
  const busy = save.isPending || create.isPending;

  function submitNew(event: React.FormEvent) {
    event.preventDefault();
    const parsed = wishlistNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    setError(null);
    create.mutate(parsed.data);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="save-to-wishlist-title"
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-md bg-canvas p-0 shadow-airbnb backdrop:bg-scrim/50"
    >
      <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <h2 id="save-to-wishlist-title" className="text-title-md text-ink">Save to wishlist</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ink hover:bg-surface-soft">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-6">
        {creating ? (
          <form noValidate onSubmit={submitNew} className="flex flex-col gap-4">
            <TextInput label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={nameError} />
            <div className="flex justify-end gap-2">
              {wishlists.length > 0 && (
                <Button type="button" variant="tertiary" onClick={() => { setCreating(false); setName(""); setNameError(undefined); }}>Cancel</Button>
              )}
              <Button type="submit" disabled={busy}>Create</Button>
            </div>
          </form>
        ) : (
          <>
            {wishlists.map((wishlist) => (
              <button
                key={wishlist.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  save.mutate(wishlist.id);
                }}
                className="flex flex-col items-start rounded-sm px-3 py-2 text-left hover:bg-surface-soft"
              >
                <span className="text-title-sm text-ink">{wishlist.name}</span>
                <span className="text-body-sm text-muted">{wishlist.listingIds.length} saved</span>
              </button>
            ))}
            <Button type="button" variant="secondary" onClick={() => setCreating(true)}>Create new wishlist</Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
