export type ReservationQuery = Partial<Record<"checkIn" | "checkOut" | "adults" | "children", string>>;

export interface ReservationInit {
  checkIn: Date | null;
  checkOut: Date | null;
  adults: number;
  children: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COUNT = 16;

function toLocalDate(value: string | undefined): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function toCount(value: string | undefined, min: number, fallback: number): number {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= min && n <= MAX_COUNT ? n : fallback;
}

/** Dates and guests from a /rooms/[id] query; anything invalid or in the past falls back to empty. */
export function parseReservationQuery(query: ReservationQuery, today: Date = new Date()): ReservationInit {
  const checkIn = toLocalDate(query.checkIn);
  const checkOut = toLocalDate(query.checkOut);
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const valid = checkIn !== null && checkOut !== null && checkIn >= floor && checkOut > checkIn;
  return {
    checkIn: valid ? checkIn : null,
    checkOut: valid ? checkOut : null,
    adults: toCount(query.adults, 1, 1),
    children: toCount(query.children, 0, 0),
  };
}
