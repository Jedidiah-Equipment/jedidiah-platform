import { describe, expect, test } from "vitest";

import { readChatEventStream } from "./sse-client.js";

describe("readChatEventStream", () => {
  test("reads chat events across response chunks", async () => {
    const events = await collectEvents([
      'data: {"type":"token","delta":"Hel',
      'lo"}\n\n:data-only-heartbeat\n\n',
      'data: {"type":"tool_result","name":"listProducts","ok":true,"summary":"12 products, page 1 of 3"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);

    expect(events).toEqual([
      {
        delta: "Hello",
        type: "token",
      },
      {
        name: "listProducts",
        ok: true,
        summary: "12 products, page 1 of 3",
        type: "tool_result",
      },
      {
        type: "done",
      },
    ]);
  });

  test("handles CRLF-delimited frames", async () => {
    const events = await collectEvents(['data: {"type":"token","delta":"A"}\r\n\r\n']);

    expect(events).toEqual([
      {
        delta: "A",
        type: "token",
      },
    ]);
  });

  test("rejects when aborted before reading", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      collectEvents(['data: {"type":"done"}\n\n'], abortController.signal),
    ).rejects.toThrow("Assistant stream aborted");
  });
});

async function collectEvents(chunks: string[], signal?: AbortSignal) {
  const events = [];

  for await (const event of readChatEventStream(createStream(chunks), signal)) {
    events.push(event);
  }

  return events;
}

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}
