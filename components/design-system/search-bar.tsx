import { cn } from "@/lib/utils";

export interface SearchBarProps {
  onSearch?: () => void;
}

function Segment({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="flex flex-col px-6 py-2 text-left">
      <span className="text-caption text-ink">{label}</span>
      <span className="text-body-sm text-muted">{placeholder}</span>
    </div>
  );
}

export function SearchBar({ onSearch }: SearchBarProps) {
  return (
    <div className="flex h-16 items-center rounded-full border border-hairline bg-canvas pr-2 shadow-airbnb">
      <Segment label="Where" placeholder="Search destinations" />
      <span className="h-8 w-px bg-hairline" aria-hidden />
      <Segment label="When" placeholder="Add dates" />
      <span className="h-8 w-px bg-hairline" aria-hidden />
      <Segment label="Who" placeholder="Add guests" />
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
