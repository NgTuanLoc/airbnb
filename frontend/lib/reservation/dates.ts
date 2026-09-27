/** A calendar day as YYYY-MM-DD from the Date's local fields, so a local midnight never becomes the previous day. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Mar 5, 2026 – Mar 8, 2026" for two YYYY-MM-DD dates. */
export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${dayFormat.format(new Date(`${checkIn}T00:00:00Z`))} – ${dayFormat.format(new Date(`${checkOut}T00:00:00Z`))}`;
}
