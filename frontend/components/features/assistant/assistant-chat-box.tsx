"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/design-system";
import { askAssistant } from "@/lib/assistant/client";
import { ASK_LIMITS, type AskMessage, type FoundListing } from "@/lib/assistant/schemas";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  text: string;
  listings?: FoundListing[];
  failed?: boolean;
}

const LISTING_PAGE = /^\/rooms\/([^/]+)$/;
const FAILED = "The assistant couldn't answer just now. Try again in a moment.";

/**
 * The smart chat box on every page: the guest asks, the assistant answers as it writes, with links to the places it
 * found. On a listing page each question carries that listing. Replies are plain text, never HTML.
 */
export function AssistantChatBox() {
  const pathname = usePathname();
  const listingId = LISTING_PAGE.exec(pathname ?? "")?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const answering = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  // An answer still streaming when the box goes away is dropped.
  useEffect(() => () => answering.current?.abort(), []);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  // The reply being written is always the last turn.
  const changeReply = (change: (reply: Turn) => Turn | null) =>
    setTurns((current) => {
      const reply = change(current[current.length - 1]);
      return reply ? [...current.slice(0, -1), reply] : current.slice(0, -1);
    });

  async function ask() {
    const text = draft.trim();
    if (!text || busy) return;
    // The conversation so far, without failed answers, as the service takes it.
    const history: AskMessage[] = [...turns.filter((t) => !t.failed && t.text), { role: "user" as const, text }]
      .map((t) => ({ role: t.role, text: t.text.slice(0, ASK_LIMITS.maxTextLength) }))
      .slice(-ASK_LIMITS.maxMessages);
    setTurns((current) => [...current, { role: "user", text }, { role: "assistant", text: "" }]);
    setDraft("");
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    answering.current = controller;
    const outcome: { failure: string | null; answer: string } = { failure: null, answer: "" };
    try {
      await askAssistant(
        { messages: history, listingId },
        (event) => {
          if (event.type === "text") {
            outcome.answer += event.text;
            changeReply((reply) => ({ ...reply, text: reply.text + event.text }));
          } else if (event.type === "listings") {
            changeReply((reply) => ({ ...reply, listings: event.listings }));
          } else if (event.type === "error") {
            outcome.failure = event.message;
          }
        },
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      outcome.failure = e instanceof Error ? e.message : FAILED;
    } finally {
      setBusy(false);
    }
    if (outcome.failure) {
      // An empty reply goes; a partial one stays, marked as failed and left out of the next question's history.
      changeReply((reply) => (reply.text ? { ...reply, failed: true } : null));
      setError(outcome.failure);
    } else {
      setAnnouncement(`Assistant: ${outcome.answer}`);
    }
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-label="Ask the assistant"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="fixed bottom-24 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-on-primary shadow-airbnb md:bottom-6 md:right-6"
      >
        <MessageCircle aria-hidden className="size-5" />
        <span className="text-button-md">Ask</span>
      </button>
      {open && (
        <section
          id="assistant-panel"
          role="dialog"
          aria-label="Ask the assistant"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-canvas md:inset-auto md:bottom-6 md:right-6 md:h-[560px] md:w-[380px] md:rounded-md md:border md:border-hairline md:shadow-airbnb"
        >
          <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <h2 className="text-title-md text-ink">Ask about stays</h2>
            <button type="button" aria-label="Close" onClick={close} className="rounded-full p-2 text-ink hover:bg-surface-soft">
              <X aria-hidden className="size-5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <p className="text-body-sm text-muted">Ask me to find a place, about the place you&apos;re looking at, or how booking works.</p>
            )}
            <ol aria-label="Conversation" className="flex flex-col gap-3">
              {turns.map((turn, index) => (
                <li
                  key={index}
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-body-sm",
                    turn.role === "user" ? "self-end bg-ink text-on-primary" : "self-start bg-surface-soft text-ink",
                    turn.failed && "opacity-60",
                  )}
                >
                  <span className="sr-only">{turn.role === "user" ? "You" : "Assistant"}: </span>
                  {turn.text ? <span>{turn.text}</span> : busy && index === turns.length - 1 && <span className="text-muted">Thinking…</span>}
                  {turn.listings && turn.listings.length > 0 && (
                    <span className="mt-2 flex flex-col gap-1">
                      {turn.listings.map((listing) => (
                        <Link key={listing.id} href={`/rooms/${encodeURIComponent(listing.id)}`} className="rounded-sm bg-canvas px-2 py-1 text-ink underline">
                          {listing.title} · {listing.city} · ${listing.pricePerNight} a night · ★ {listing.rating}
                        </Link>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <form
            className="flex flex-col gap-2 border-t border-hairline p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            {error && (
              <p role="alert" className="text-body-sm text-error">
                {error}
              </p>
            )}
            <label htmlFor="assistant-question" className="sr-only">
              Your question
            </label>
            <textarea
              id="assistant-question"
              ref={inputRef}
              value={draft}
              rows={2}
              maxLength={ASK_LIMITS.maxTextLength}
              placeholder="Ask a question"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter asks; Shift+Enter (or composing text) adds a line.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void ask();
                }
              }}
              className="rounded-sm border border-hairline bg-canvas p-3 text-body-md text-ink placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-muted">Answers come from a local AI model and the site&apos;s listings. Check them before you book.</p>
              <Button type="submit" disabled={busy || !draft.trim()}>
                Send
              </Button>
            </div>
          </form>
          {/* The finished answer is read out once, not word by word as it streams. */}
          <div role="status" className="sr-only">
            {announcement}
          </div>
        </section>
      )}
    </>
  );
}
