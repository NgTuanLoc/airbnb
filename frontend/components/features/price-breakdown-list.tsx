import type { PriceBreakdown } from "@/lib/reservation/pricing";

export function PriceBreakdownList({ breakdown }: { breakdown: PriceBreakdown }) {
  return (
    <dl className="flex flex-col gap-2">
      {breakdown.lineItems.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-body-sm text-body">
          <dt>{item.label}</dt>
          <dd>${item.amount}</dd>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-title-sm text-ink">
        <dt>Total</dt>
        <dd>${breakdown.total}</dd>
      </div>
    </dl>
  );
}
