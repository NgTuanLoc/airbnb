"use client";

import { useState } from "react";
import Image from "next/image";
import { Grid2x2 } from "lucide-react";
import { PhotoLightbox } from "./photo-lightbox";

export interface ListingGalleryProps {
  photos: string[];
  title: string;
}

// The cover spans the mosaic; the other photos are hidden below md, so there the cover takes the whole width.
function tileClass(index: number, tiles: number): string {
  if (index > 0) return "relative hidden md:block";
  return tiles === 1 ? "relative col-span-4 row-span-2" : "relative col-span-4 row-span-2 md:col-span-2";
}

export function ListingGallery({ photos, title }: Readonly<ListingGalleryProps>) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const mosaic = photos.slice(0, 5);
  return (
    <>
      <section
        aria-label="Photo gallery"
        className="relative grid h-[320px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl md:h-[480px]"
      >
        {mosaic.map((src, i) => (
          <button
            key={src + i}
            type="button"
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
            onClick={() => setOpenAt(i)}
            className={tileClass(i, mosaic.length)}
          >
            <Image
              src={src}
              alt={`${title} — photo ${i + 1}`}
              fill
              sizes="(max-width: 744px) 100vw, 50vw"
              className="object-cover transition-opacity hover:opacity-90"
            />
          </button>
        ))}
        {photos.length > 1 && (
          <>
            {/* Phones only see the cover, so they get a count instead of the mosaic. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-ink/70 px-3 py-1 text-caption text-on-primary md:hidden"
            >
              1 / {photos.length}
            </span>
            <button
              type="button"
              onClick={() => setOpenAt(0)}
              className="absolute bottom-4 right-4 hidden items-center gap-2 rounded-sm border border-ink bg-canvas px-4 py-2 text-title-sm text-ink shadow-airbnb hover:bg-surface-soft md:flex"
            >
              <Grid2x2 aria-hidden className="size-4" />
              Show all photos
            </button>
          </>
        )}
      </section>
      {openAt !== null && (
        <PhotoLightbox photos={photos} title={title} startIndex={openAt} onClose={() => setOpenAt(null)} />
      )}
    </>
  );
}
