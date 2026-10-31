import Link from "next/link";
import { cn } from "@/lib/utils";
import { NewBadge } from "./badges";
import { BrandMark } from "./brand-mark";
// The design-system → features imports: every page's nav needs the live session menu and the notifications bell.
import { AccountMenu } from "@/components/features/auth/account-menu";
import { MobileNav } from "@/components/features/nav/mobile-nav";
import { NotificationBell } from "@/components/features/notifications/notification-bell";
import { NAV_TABS, type Product } from "@/lib/nav";

export type { Product } from "@/lib/nav";

export function TopNav({ active = "homes" }: Readonly<{ active?: Product }>) {
  return (
    <header className="flex h-20 items-center justify-between border-b border-hairline bg-canvas px-6 md:px-10 xl:px-20">
      <Link href="/" className="flex items-center gap-1 text-display-sm font-bold text-rausch" aria-label="Airbnb home">
        <BrandMark className="size-8" />
        airbnb
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        {NAV_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === active ? "page" : undefined}
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
      {/* The bell shows at every width; the host link and account menu from md up, the mobile menu below. */}
      <div className="flex items-center gap-2">
        <Link href="/host" className="hidden text-title-sm text-ink md:block">
          Become a host
        </Link>
        <NotificationBell />
        <div className="hidden md:block">
          <AccountMenu />
        </div>
        <nav aria-label="Main menu" className="md:hidden">
          <MobileNav active={active} />
        </nav>
      </div>
    </header>
  );
}
