import { assistantEventSchema, type AskRequest, type AssistantEvent } from "./schemas";

const FAILED = "The assistant couldn't answer just now. Try again in a moment.";
const TOO_MANY = "You're asking quickly. Wait a minute and try again.";

/**
 * Asks the assistant (through POST /api/assistant) and hands over each event of its answer as it arrives. Rejects
 * when the question is refused; a failure partway through arrives as an `error` event instead.
 */
export async function askAssistant(request: AskRequest, onEvent: (event: AssistantEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) {
    if (response.status === 429) throw new Error(TOO_MANY);
    const body: unknown = await response.json().catch(() => undefined);
    const reason = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : FAILED;
    throw new Error(reason);
  }

  // NDJSON: one event per line, though the network may cut a line anywhere.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      emit(buffered.slice(0, newline), onEvent);
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf("\n");
    }
  }
  emit(buffered, onEvent);
}

// A line that isn't an event this page knows is skipped rather than failing the answer.
function emit(line: string, onEvent: (event: AssistantEvent) => void): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return;
  }
  const parsed = assistantEventSchema.safeParse(json);
  if (parsed.success) onEvent(parsed.data);
}
