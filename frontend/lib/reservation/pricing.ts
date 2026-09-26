export interface PriceLineItem {
  label: string;
  amount: number;
}

export interface PriceBreakdown {
  lineItems: PriceLineItem[];
  total: number;
}

export const CLEANING_FEE = 75;
export const SERVICE_FEE_RATE = 0.14;

const MS_PER_NIGHT = 86_400_000;

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const diff = checkOut.getTime() - checkIn.getTime();
  return Math.max(0, Math.round(diff / MS_PER_NIGHT));
}

export function calculatePriceBreakdown(pricePerNight: number, nights: number): PriceBreakdown {
  const nightlySubtotal = pricePerNight * nights;
  const serviceFee = Math.round(nightlySubtotal * SERVICE_FEE_RATE);
  const lineItems: PriceLineItem[] = [
    { label: `$${pricePerNight} x ${nights} night${nights === 1 ? "" : "s"}`, amount: nightlySubtotal },
    { label: "Cleaning fee", amount: CLEANING_FEE },
    { label: "Airbnb service fee", amount: serviceFee },
  ];
  return { lineItems, total: nightlySubtotal + CLEANING_FEE + serviceFee };
}
