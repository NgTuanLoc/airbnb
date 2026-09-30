// lucide-react v1 removed brand logos (Facebook/Instagram/Twitter) for trademark
// reasons, so the social row uses evocative generic icons with brand aria-labels.
import { Globe, ThumbsUp, Camera, AtSign } from "lucide-react";

const columns: { heading: string; links: string[] }[] = [
  { heading: "Support", links: ["Help Center", "AirCover", "Cancellation options"] },
  { heading: "Hosting", links: ["Airbnb your home", "AirCover for Hosts", "Hosting resources"] },
  { heading: "Airbnb", links: ["Newsroom", "New features", "Careers"] },
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
            {col.links.map((link) => (
              <a key={link} href="#" className="text-body-sm text-ink hover:underline">
                {link}
              </a>
            ))}
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
              <a key={label} href="#" aria-label={label} className="text-ink hover:text-rausch">
                <Icon aria-hidden className="size-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
