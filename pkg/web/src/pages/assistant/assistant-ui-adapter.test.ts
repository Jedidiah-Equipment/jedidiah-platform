import type { ChatModelRunResult } from '@assistant-ui/react';
import type { ChatEvent } from '@pkg/schema';
import { describe, expect, it, vi } from 'vitest';

import { jedidiahChatAdapter } from './assistant-ui-adapter.js';
import { streamChatEvents } from './sse-client.js';

vi.mock('./sse-client.js', () => ({
  streamChatEvents: vi.fn(),
}));

describe('jedidiahChatAdapter', () => {
  it('preserves tool result size metadata by tool call id', async () => {
    vi.mocked(streamChatEvents).mockImplementation(async function* () {
      yield {
        args: { query: 'assembly' },
        id: 'tool-1',
        name: 'searchProducts',
        type: 'tool_call',
      } satisfies ChatEvent;
      yield {
        id: 'tool-1',
        result: { total: 3 },
        size: {
          maxSerializedBytes: 24 * 1024,
          removedThumbnailFieldsByFallback: 2,
          serializedBytes: 1536,
          truncated: true,
        },
        type: 'tool_result',
      } satisfies ChatEvent;
      yield {
        usage: {
          cachedInputTokens: 0,
          inputTokens: 10,
          outputTokens: 4,
          reasoningOutputTokens: 0,
          requestUsage: [],
          requests: 1,
          totalTokens: 14,
        },
        type: 'done',
      } satisfies ChatEvent;
    });

    const results = await collectRunResults();

    expect(results.at(1)?.metadata?.custom).toEqual({
      toolResultSizes: {
        'tool-1': {
          maxSerializedBytes: 24 * 1024,
          removedThumbnailFieldsByFallback: 2,
          serializedBytes: 1536,
          truncated: true,
        },
      },
    });
    expect(results.at(-1)?.metadata?.custom).toEqual({
      runUsage: {
        cachedInputTokens: 0,
        inputTokens: 10,
        outputTokens: 4,
        reasoningOutputTokens: 0,
        requestUsage: [],
        requests: 1,
        totalTokens: 14,
      },
      toolResultSizes: {
        'tool-1': {
          maxSerializedBytes: 24 * 1024,
          removedThumbnailFieldsByFallback: 2,
          serializedBytes: 1536,
          truncated: true,
        },
      },
    });
  });

  it('leaves metadata absent when tool results do not include size info', async () => {
    vi.mocked(streamChatEvents).mockImplementation(async function* () {
      yield {
        args: {},
        id: 'tool-1',
        name: 'searchProducts',
        type: 'tool_call',
      } satisfies ChatEvent;
      yield {
        id: 'tool-1',
        result: { ok: false },
        type: 'tool_result',
      } satisfies ChatEvent;
      yield { type: 'done' } satisfies ChatEvent;
    });

    const results = await collectRunResults();

    expect(results.at(1)?.metadata).toBeUndefined();
    expect(results.at(-1)?.metadata).toBeUndefined();
  });
});

async function collectRunResults(): Promise<ChatModelRunResult[]> {
  const runResult = jedidiahChatAdapter.run({
    abortSignal: new AbortController().signal,
    messages: [],
  } as unknown as Parameters<typeof jedidiahChatAdapter.run>[0]);
  const results: ChatModelRunResult[] = [];

  for await (const result of runResult as AsyncGenerator<ChatModelRunResult>) {
    results.push(result);
  }

  return results;
}
