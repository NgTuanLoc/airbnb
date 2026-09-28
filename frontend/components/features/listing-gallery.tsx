import Image from "next/image";

export interface ListingGalleryProps {
  photos: string[];
  title: string;
}

export function ListingGallery({ photos, title }: ListingGalleryProps) {
  const mosaic = photos.slice(0, 5);
  return (
    <section
      aria-label="Photo gallery"
      className="grid h-[320px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl md:h-[480px]"
    >
      {mosaic.map((src, i) => (
        <div
          key={src + i}
          className={
            i === 0
              ? mosaic.length === 1
                ? "relative col-span-4 row-span-2"
                : "relative col-span-2 row-span-2"
              : "relative hidden md:block"
          }
        >
          <Image
            src={src}
            alt={`${title} — photo ${i + 1}`}
            fill
            sizes="(max-width: 744px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      ))}
    </section>
  );
}
