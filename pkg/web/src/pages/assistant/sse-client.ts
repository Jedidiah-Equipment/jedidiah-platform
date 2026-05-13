import type { AssistantEvent, ChatStreamMessage } from "@pkg/schema";

import { getClientConfig } from "@/lib/app-config.js";

export type StreamAssistantEventsOptions = {
  messages: ChatStreamMessage[];
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
};

export async function* streamAssistantEvents({
  fetchImpl = fetch,
  messages,
  signal,
}: StreamAssistantEventsOptions): AsyncGenerator<AssistantEvent> {
  const config = getClientConfig();
  const response = await fetchImpl(`${config.apiBaseUrl}/ai/chat-stream`, {
    body: JSON.stringify({ messages }),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response));
  }

  if (!response.body) {
    throw new Error("Assistant stream response did not include a body");
  }

  yield* readAssistantEventStream(response.body, signal);
}

export async function* readAssistantEventStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };

  if (signal?.aborted) {
    cancelReader();
    throw createAbortError();
  }

  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (signal?.aborted) {
        throw createAbortError();
      }

      if (done) {
        break;
      }

      buffer = normalizeLineEndings(buffer + decoder.decode(value, { stream: true }));
      yield* readBufferedEvents(buffer);
      buffer = getRemainder(buffer);
    }

    buffer = normalizeLineEndings(buffer + decoder.decode());

    if (buffer.trim().length > 0) {
      yield parseEventFrame(buffer);
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}

function* readBufferedEvents(buffer: string): Generator<AssistantEvent> {
  let frameEndIndex = buffer.indexOf("\n\n");

  while (frameEndIndex !== -1) {
    const frame = buffer.slice(0, frameEndIndex);

    if (frame.trim().length > 0 && !frame.startsWith(":")) {
      yield parseEventFrame(frame);
    }

    buffer = buffer.slice(frameEndIndex + 2);
    frameEndIndex = buffer.indexOf("\n\n");
  }
}

function getRemainder(buffer: string): string {
  const frameEndIndex = buffer.lastIndexOf("\n\n");

  return frameEndIndex === -1 ? buffer : buffer.slice(frameEndIndex + 2);
}

function parseEventFrame(frame: string): AssistantEvent {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (!data) {
    throw new Error("Assistant stream frame did not include data");
  }

  return JSON.parse(data) as AssistantEvent;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  const suffix = body.trim().length > 0 ? `: ${body}` : "";

  return `Assistant stream failed with HTTP ${response.status}${suffix}`;
}

function createAbortError(): DOMException {
  return new DOMException("Assistant stream aborted", "AbortError");
}
