"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface PhotoLightboxProps {
  photos: string[];
  title: string;
  startIndex: number;
  onClose: () => void;
}

const navButton =
  "flex size-11 items-center justify-center rounded-full bg-canvas text-ink shadow-airbnb disabled:opacity-0 disabled:pointer-events-none";

/**
 * Full-screen photo viewer. Slides sit in a horizontal scroll-snap track, so touch devices swipe natively;
 * the buttons and arrow keys scroll the same track, and the counter follows whichever slide is in view.
 */
export function PhotoLightbox({ photos, title, startIndex, onClose }: Readonly<PhotoLightboxProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(startIndex);
  const last = photos.length - 1;

  // A native modal: focus trap, Escape and an inert page; it unmounts on close, so focus goes back by hand.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Open on the clicked photo without an animated scroll.
  useLayoutEffect(() => {
    const track = trackRef.current;
    track?.scrollTo?.({ left: startIndex * track.clientWidth, behavior: "instant" });
  }, [startIndex]);

  function goTo(next: number) {
    const target = Math.min(Math.max(next, 0), last);
    setIndex(target);
    const track = trackRef.current;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track?.scrollTo?.({ left: target * track.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  }

  // Arrow keys work wherever focus is inside the open viewer.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      // One photo per press: stop the focused track's own arrow-key scrolling from moving it too.
      event.preventDefault();
      goTo(index + (event.key === "ArrowRight" ? 1 : -1));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // A swipe moves the track itself; keep the counter on the slide that's now in view.
  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const inView = Math.round(track.scrollLeft / track.clientWidth);
    if (inView !== index) setIndex(inView);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Photos of ${title}`}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-ink p-0 text-on-primary backdrop:bg-scrim"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <button type="button" aria-label="Close" onClick={onClose} className={navButton}>
            <X aria-hidden className="size-5" />
          </button>
          <p aria-live="polite" className="text-title-sm">
            {index + 1} / {photos.length}
          </p>
          <span aria-hidden className="size-11" />
        </div>

        <div className="relative min-h-0 flex-1">
          <section
            ref={trackRef}
            onScroll={onScroll}
            // A scrollable region must be reachable by keyboard; focused, it scrolls with the arrow keys too.
            tabIndex={0}
            aria-roledescription="carousel"
            aria-label={`${title} photos`}
            className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
          >
            {photos.map((src, i) => (
              <div
                key={src + i}
                role="group"
                aria-roledescription="slide"
                aria-label={`Photo ${i + 1} of ${photos.length}`}
                className="relative h-full w-full shrink-0 snap-center"
              >
                {/* Inset so the photo never touches the screen edge; on desktop the arrows sit beside it, not on it. */}
                <div className="absolute inset-x-2 bottom-4 top-0 md:inset-x-24 md:bottom-8">
                  <Image src={src} alt={`${title} — photo ${i + 1}`} fill sizes="100vw" className="object-contain" />
                </div>
              </div>
            ))}
          </section>

          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className={`${navButton} absolute left-4 top-1/2 -translate-y-1/2 md:left-6`}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => goTo(index + 1)}
            disabled={index === last}
            className={`${navButton} absolute right-4 top-1/2 -translate-y-1/2 md:right-6`}
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>
    </dialog>
  );
}
