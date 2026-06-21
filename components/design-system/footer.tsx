const columns: { heading: string; links: string[] }[] = [
  { heading: "Support", links: ["Help Center", "AirCover", "Cancellation options"] },
  { heading: "Hosting", links: ["Airbnb your home", "AirCover for Hosts", "Hosting resources"] },
  { heading: "Airbnb", links: ["Newsroom", "New features", "Careers"] },
];

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-canvas px-20 py-12">
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
          <span>English (US)</span>
          <span>$ USD</span>
        </div>
      </div>
    </footer>
  );
}
