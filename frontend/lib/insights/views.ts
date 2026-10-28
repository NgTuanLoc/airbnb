import { z } from "zod";

// Listing views counted through Kafka (docs/superpowers/specs/2026-10-28-listing-views-kafka-design.md).

/** Seed listings (l1…) and host listings (hl- + a UUID): the only ids the backend counts views for. */
export const LISTING_ID_PATTERN = /^(l[0-9]{1,6}|hl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const weeklyViewsSchema = z.object({
  listingId: z.string(),
  last7Days: z.number().int().nonnegative(),
  previous7Days: z.number().int().nonnegative(),
});

export type WeeklyViews = z.infer<typeof weeklyViewsSchema>;

// "views", never "people": refreshes count, so it would overstate how many different guests looked.
const views = (count: number) => (count === 1 ? "1 view" : `${count} views`);

/** The listing page's line for guests; nothing when there are no stats or no views. */
export function guestViewsText(stats: WeeklyViews | null): string | null {
  return stats && stats.last7Days > 0 ? `${views(stats.last7Days)} in the past week` : null;
}

/** The host dashboard's line: the last 7 days, against the week before when it had any views. */
export function hostViewsText({ last7Days, previous7Days }: WeeklyViews): string {
  const count = last7Days === 0 ? "No views" : views(last7Days);
  const line = `${count} in the last 7 days`;
  if (previous7Days === 0) return line;
  const change = Math.round(((last7Days - previous7Days) / previous7Days) * 100);
  if (change === 0) return `${line} · same as the week before`;
  return `${line} · ${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs. the week before`;
}
