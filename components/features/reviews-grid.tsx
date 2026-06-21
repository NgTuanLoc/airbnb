import Image from "next/image";
import type { Review } from "@/lib/types";

export interface ReviewsGridProps {
  reviews: Review[];
}

export function ReviewsGrid({ reviews }: ReviewsGridProps) {
  if (reviews.length === 0) {
    return <p className="text-body-md text-muted">No reviews yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
      {reviews.map((review) => (
        <article key={review.id} className="flex flex-col gap-2">
          <header className="flex items-center gap-3">
            <span className="relative h-10 w-10 overflow-hidden rounded-full bg-surface-strong">
              <Image src={review.authorAvatar} alt={review.authorName} fill sizes="40px" className="object-cover" />
            </span>
            <span className="flex flex-col">
              <span className="text-title-sm text-ink">{review.authorName}</span>
              <span className="text-body-sm text-muted">{review.date}</span>
            </span>
          </header>
          <p className="line-clamp-3 text-body-md text-body">{review.body}</p>
        </article>
      ))}
    </div>
  );
}
