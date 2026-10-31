// The site's mark: one Rausch loop that reads as a pin, a heart and an "A", drawn for this clone in the spirit of
// Airbnb's Bélo (not its artwork). app/icon.svg is the same drawing for the browser tab.
export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 4.5c-1.9 0-3.1 1.4-4.2 3.6L4.9 22.2c-1.8 3.7.6 6.8 3.7 6.8 2.4 0 4.6-1.6 7.4-4.8 2.8 3.2 5 4.8 7.4 4.8 3.1 0 5.5-3.1 3.7-6.8L20.2 8.1C19.1 5.9 17.9 4.5 16 4.5Z" />
      <path d="M16 24.2c-2.7-3.1-4.1-5.6-4.1-7.4 0-2.3 1.8-3.9 4.1-3.9s4.1 1.6 4.1 3.9c0 1.8-1.4 4.3-4.1 7.4Z" />
    </svg>
  );
}
