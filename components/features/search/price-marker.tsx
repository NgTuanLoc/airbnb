import { cn } from "@/lib/utils";

export interface PriceMarkerProps {
  price: number;
  selected?: boolean;
  onClick?: () => void;
}

export function PriceMarker({ price, selected, onClick }: PriceMarkerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-micro shadow-airbnb transition-colors",
        selected
          ? "bg-ink text-on-primary"
          : "bg-rausch text-on-primary hover:bg-rausch-active",
      )}
    >
      ${price}
    </button>
  );
}
