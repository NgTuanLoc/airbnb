"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/design-system";
import { cities } from "@/lib/data/cities";
import { useSearchForm } from "@/lib/search/use-search-form";
import { DestinationPanel } from "./destination-panel";
import { DatePanel } from "./date-panel";
import { GuestPanel } from "./guest-panel";

type Section = "where" | "when" | "who";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "where", label: "Where" },
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
];

export function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center gap-3 rounded-full border border-hairline bg-canvas px-5 text-left shadow-airbnb"
      >
        <Search aria-hidden className="size-5 text-ink" />
        <span className="flex flex-col">
          <span className="text-title-sm text-ink">Start your search</span>
          <span className="text-caption text-muted">Anywhere · Any week · Add guests</span>
        </span>
      </button>
      {open && <MobileSearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MobileSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const form = useSearchForm();
  const [section, setSection] = useState<Section>("where");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const whenHeaderRef = useRef<HTMLButtonElement>(null);
  const focusWhenNext = useRef(false);

  // A native modal; it unmounts on close, so focus goes back by hand to the pill.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Picking a city unmounts the Where content (and the button that had focus) as the section
  // switches to When, so focus would otherwise drop to <body>. Move it to the When header instead.
  useEffect(() => {
    if (section === "when" && focusWhenNext.current) {
      focusWhenNext.current = false;
      whenHeaderRef.current?.focus();
    }
  }, [section]);

  const summaries: Record<Section, string> = {
    where: form.destination || "Anywhere",
    when: form.whenLabel,
    who: form.whoLabel,
  };

  function search() {
    router.push(form.url);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="mobile-search-title"
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none bg-surface-soft p-0 backdrop:bg-scrim/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 id="mobile-search-title" className="text-title-md text-ink">
            Search
          </h2>
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full border border-hairline bg-canvas"
          >
            <X aria-hidden className="size-4 text-ink" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6">
          {SECTIONS.map(({ key, label }) => (
            <section key={key} className="rounded-md bg-canvas p-4 shadow-airbnb">
              <h3>
                <button
                  type="button"
                  ref={key === "when" ? whenHeaderRef : undefined}
                  aria-expanded={section === key}
                  aria-controls={`mobile-search-${key}`}
                  onClick={() => setSection(key)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-title-sm text-ink">{label}</span>
                  <span className="text-body-sm text-muted">{summaries[key]}</span>
                </button>
              </h3>
              {section === key && (
                <div id={`mobile-search-${key}`} className="mt-4">
                  {key === "where" && (
                    <DestinationPanel
                      value={form.destination}
                      suggestions={cities}
                      onChange={form.setDestination}
                      onSelect={(name) => {
                        form.setDestination(name);
                        focusWhenNext.current = true;
                        setSection("when");
                      }}
                    />
                  )}
                  {key === "when" && <DatePanel checkIn={form.checkIn} checkOut={form.checkOut} onSelect={form.selectDate} />}
                  {key === "who" && <GuestPanel value={form.guests} onChange={form.setGuests} />}
                </div>
              )}
            </section>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-hairline bg-canvas px-6 py-4">
          <button type="button" onClick={form.clear} className="text-title-sm text-ink underline">
            Clear all
          </button>
          <Button type="button" onClick={search}>
            Search
          </Button>
        </div>
      </div>
    </dialog>
  );
}
