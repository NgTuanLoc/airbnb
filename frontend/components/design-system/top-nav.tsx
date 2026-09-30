import Link from "next/link";
import { cn } from "@/lib/utils";
import { NewBadge } from "./badges";
// The one design-system → features import: every page's nav needs the live session menu.
import { AccountMenu } from "@/components/features/auth/account-menu";

type Product = "homes" | "experiences" | "services";

const tabs: { id: Product; label: string; href: string; isNew?: boolean }[] = [
  { id: "homes", label: "Homes", href: "/" },
  { id: "experiences", label: "Experiences", href: "/experiences", isNew: true },
  { id: "services", label: "Services", href: "/services", isNew: true },
];

export function TopNav({ active = "homes" }: { active?: Product }) {
  return (
    <header className="flex h-20 items-center justify-between border-b border-hairline bg-canvas px-6 md:px-10 xl:px-20">
      <Link href="/" className="text-display-sm font-bold text-rausch" aria-label="Airbnb home">
        airbnb
      </Link>
      <nav className="flex items-center gap-8">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex items-center gap-1 border-b-2 border-transparent pb-1 text-nav-link",
              tab.id === active ? "border-ink text-ink" : "text-muted",
            )}
          >
            {tab.label}
            {tab.isNew && <NewBadge />}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/host" className="text-title-sm text-ink">
          Become a host
        </Link>
        <AccountMenu />
      </div>
    </header>
  );
}
