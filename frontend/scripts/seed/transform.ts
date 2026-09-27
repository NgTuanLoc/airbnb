import type { Experience, Review } from "@/lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The mock stores review dates preformatted ("March 2026"); the backend stores an ISO timestamp.
export function toCreatedAt(date: string): string {
  const [month, year] = date.split(" ");
  const index = MONTHS.indexOf(month);
  if (index < 0 || !/^\d{4}$/.test(year ?? "")) throw new Error(`Unexpected review date: "${date}"`);
  return `${year}-${String(index + 1).padStart(2, "0")}-01T00:00:00Z`;
}

export function withSortOrder<T extends object>(items: readonly T[]): (T & { sortOrder: number })[] {
  return items.map((item, sortOrder) => ({ ...item, sortOrder }));
}

// The mock misuses listingId for experience reviews too; the backend stores subjectType + subjectId.
export function toBackendReviews(reviews: readonly Review[], experiences: readonly Experience[]) {
  const experienceIds = new Set(experiences.map((e) => e.id));
  return reviews.map(({ listingId, date, ...rest }) => ({
    ...rest,
    subjectType: experienceIds.has(listingId) ? "experience" : "stay",
    subjectId: listingId,
    createdAt: toCreatedAt(date),
  }));
}
