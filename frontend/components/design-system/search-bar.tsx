import { cn } from "@/lib/utils";

export type SearchSegment = "where" | "when" | "who";

export interface SearchValues {
  where: string;
  when: string;
  who: string;
}

export interface SearchBarProps {
  values: SearchValues;
  activeSegment: SearchSegment | null;
  onSegmentClick: (segment: SearchSegment) => void;
  onSearch: () => void;
}

const SEGMENTS: { key: SearchSegment; label: string }[] = [
  { key: "where", label: "Where" },
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
];

function Segment({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("flex flex-col rounded-full px-6 py-2 text-left", active && "bg-surface-strong")}
    >
      <span className="text-caption text-ink">{label}</span>
      <span className="text-body-sm text-muted">{value}</span>
    </button>
  );
}

export function SearchBar({ values, activeSegment, onSegmentClick, onSearch }: SearchBarProps) {
  return (
    <div className="flex h-16 items-center rounded-full border border-hairline bg-canvas pr-2 shadow-airbnb">
      {SEGMENTS.map((segment, index) => (
        <div key={segment.key} className="flex items-center">
          {index > 0 && <span className="h-8 w-px bg-hairline" aria-hidden />}
          <Segment
            label={segment.label}
            value={values[segment.key]}
            active={activeSegment === segment.key}
            onClick={() => onSegmentClick(segment.key)}
          />
        </div>
      ))}
      <button
        type="button"
        aria-label="Search"
        onClick={onSearch}
        className={cn(
          "ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-rausch text-on-primary",
          "hover:bg-rausch-active",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
