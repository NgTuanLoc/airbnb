import { z } from "zod";

export const MAX_NIGHTS = 30;
const MS_PER_DAY = 86_400_000;

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD").refine(isRealDate, "Enter a real date");

/** Nights between two YYYY-MM-DD dates. */
export function nightsBetweenDates(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * A booking request, from a JSON body or the /book page's query string (so numbers may arrive as strings).
 * The listing-dependent rules (it exists, guest cap) are checked where the listing is loaded.
 */
export const bookingRequestSchema = z
  .object({
    listingId: z.string().min(1).max(50),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1, "At least 1 adult is required").max(16),
    children: z.coerce.number().int().min(0).max(15).default(0),
  })
  .superRefine((value, ctx) => {
    // One day of slack, so a guest whose "today" is still yesterday in UTC can book it.
    const earliest = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
    if (value.checkIn < earliest) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Check-in can't be in the past" });
    }
    const nights = nightsBetweenDates(value.checkIn, value.checkOut);
    if (nights <= 0) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in" });
    } else if (nights > MAX_NIGHTS) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: `Stays can be at most ${MAX_NIGHTS} nights` });
    }
  });

export type BookingRequest = z.infer<typeof bookingRequestSchema>;
