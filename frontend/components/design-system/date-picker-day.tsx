import { cn } from "@/lib/utils";

export interface DatePickerDayProps {
  day: number;
  selected?: boolean;
  inRange?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function DatePickerDay({
  day,
  selected,
  inRange,
  disabled,
  onSelect,
}: DatePickerDayProps) {
  return (
    <button
      type="button"
      data-calendar-day=""
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-body-sm text-ink",
        inRange && "bg-surface-soft",
        selected && "bg-ink text-on-primary",
        disabled && "cursor-not-allowed text-muted-soft line-through",
      )}
    >
      {day}
    </button>
  );
}
