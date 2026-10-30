// lucide-react v1 removed brand logos (Facebook/Instagram/Twitter) for trademark
// reasons, so the social row uses evocative generic icons with brand aria-labels.
import Link from "next/link";
import { Globe, ThumbsUp, Camera, AtSign } from "lucide-react";

// Links only where the app has the page; the rest are placeholders, so they read as text rather than dead links.
const columns: { heading: string; items: { label: string; href?: string }[] }[] = [
  { heading: "Support", items: [{ label: "Help Center" }, { label: "AirCover" }, { label: "Cancellation options" }] },
  { heading: "Hosting", items: [{ label: "Airbnb your home", href: "/host" }, { label: "AirCover for Hosts" }, { label: "Hosting resources" }] },
  { heading: "Airbnb", items: [{ label: "Newsroom" }, { label: "New features" }, { label: "Careers" }] },
];

const social: { label: string; Icon: typeof Globe }[] = [
  { label: "Facebook", Icon: ThumbsUp },
  { label: "Instagram", Icon: Camera },
  { label: "Twitter", Icon: AtSign },
];

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-canvas px-6 md:px-10 xl:px-20 py-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {columns.map((col) => (
          <div key={col.heading} className="flex flex-col gap-3">
            <h2 className="text-title-sm text-ink">{col.heading}</h2>
            {col.items.map(({ label, href }) =>
              href ? (
                <Link key={label} href={href} className="text-body-sm text-ink hover:underline">
                  {label}
                </Link>
              ) : (
                <span key={label} className="text-body-sm text-ink">
                  {label}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-2 border-t border-hairline pt-6 text-caption-sm text-muted md:flex-row md:items-center md:justify-between">
        <span>© 2026 Airbnb, Inc.</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <Globe aria-hidden className="size-4" />
            English (US)
          </span>
          <span>$ USD</span>
          <div className="flex items-center gap-3">
            {social.map(({ label, Icon }) => (
              <Icon key={label} role="img" aria-label={label} className="size-5 text-ink" />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
