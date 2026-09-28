import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "listings", label: "Listings", href: "/host/listings" },
  { id: "reservations", label: "Reservations", href: "/host/reservations" },
] as const;

export function HostNav({ active }: { active: "listings" | "reservations" }) {
  return (
    <nav aria-label="Host" className="flex gap-6 border-b border-hairline">
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? "page" : undefined}
          className={cn("border-b-2 pb-3 text-title-sm", tab.id === active ? "border-ink text-ink" : "border-transparent text-muted")}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
