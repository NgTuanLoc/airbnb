import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { Broadcast } from "./schemas";

/** The browser's EventSource, driven by hand: emit() delivers an event to the page's listeners. */
export class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: string) {
    act(() => this.listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data }))));
  }

  /** An announcement as the service sends it: "recent" (sent before the page opened) or "broadcast" (news). */
  send(type: "recent" | "broadcast", broadcast: Pick<Broadcast, "id" | "text"> & { sentAt?: string }) {
    this.emit(type, JSON.stringify({ sentAt: "2026-10-31T12:00:00Z", ...broadcast }));
  }
}

/** Swaps in FakeEventSource for the test; FakeEventSource.last is the page's stream once it opens. */
export function installFakeEventSource() {
  FakeEventSource.last = null;
  vi.stubGlobal("EventSource", FakeEventSource);
}

/** The page's stream (fails the test if none is open). */
export function stream(): FakeEventSource {
  if (!FakeEventSource.last) throw new Error("No EventSource was opened");
  return FakeEventSource.last;
}
