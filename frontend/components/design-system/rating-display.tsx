export function RatingDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-label={`Rated ${value} out of 5`}>
      <span aria-hidden className="text-2xl text-ink">❧</span>
      <span className="text-rating text-ink">{value.toFixed(2)}</span>
      <span aria-hidden className="scale-x-[-1] text-2xl text-ink">❧</span>
    </div>
  );
}
