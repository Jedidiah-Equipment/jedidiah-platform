import type { RunStreamEvent } from '@openai/agents';
import type { ChatRequestUsage } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { toChatRequestUsage, toChatRunUsage, toTextDeltas } from './openai.js';

function rawTextDelta(delta: string): RunStreamEvent {
  return { data: { delta, type: 'output_text_delta' }, type: 'raw_model_stream_event' } as RunStreamEvent;
}

function rawResponseDone(usage: Record<string, unknown>): RunStreamEvent {
  return { data: { response: { usage }, type: 'response_done' }, type: 'raw_model_stream_event' } as RunStreamEvent;
}

function eventStreamResult(...events: RunStreamEvent[]): { toStream: () => AsyncIterable<RunStreamEvent> } {
  return {
    toStream: () => ({
      async *[Symbol.asyncIterator]() {
        yield* events;
      },
    }),
  };
}

describe('toChatRunUsage', () => {
  test('maps aggregate and per-request SDK usage details', () => {
    expect(
      toChatRunUsage({
        inputTokens: 300,
        inputTokensDetails: [{ cached_tokens: 12 }, { cached_tokens: 8 }, { other: 99 }],
        outputTokens: 80,
        outputTokensDetails: [{ reasoning_tokens: 20 }, { reasoning_tokens: 5 }],
        requestUsageEntries: [
          {
            inputTokens: 200,
            inputTokensDetails: { cached_tokens: 12 },
            outputTokens: 40,
            outputTokensDetails: { reasoning_tokens: 20 },
            totalTokens: 240,
          },
          {
            inputTokens: 100,
            inputTokensDetails: {},
            outputTokens: 40,
            outputTokensDetails: {},
            totalTokens: 140,
          },
        ],
        requests: 2,
        totalTokens: 380,
      }),
    ).toEqual({
      cachedInputTokens: 20,
      inputTokens: 300,
      outputTokens: 80,
      reasoningOutputTokens: 25,
      requestUsage: [
        {
          cachedInputTokens: 12,
          inputTokens: 200,
          outputTokens: 40,
          reasoningOutputTokens: 20,
          totalTokens: 240,
        },
        {
          cachedInputTokens: 0,
          inputTokens: 100,
          outputTokens: 40,
          reasoningOutputTokens: 0,
          totalTokens: 140,
        },
      ],
      requests: 2,
      totalTokens: 380,
    });
  });

  test('uses an empty per-request list when the SDK has no entries', () => {
    expect(
      toChatRunUsage({
        inputTokens: 10,
        inputTokensDetails: [],
        outputTokens: 5,
        outputTokensDetails: [],
        requestUsageEntries: undefined,
        requests: 1,
        totalTokens: 15,
      }).requestUsage,
    ).toEqual([]);
  });
});

describe('toChatRequestUsage', () => {
  test('maps a single-call usage payload with record details', () => {
    expect(
      toChatRequestUsage({
        inputTokens: 200,
        inputTokensDetails: { cached_tokens: 12 },
        outputTokens: 40,
        outputTokensDetails: { reasoning_tokens: 20 },
        totalTokens: 240,
      }),
    ).toEqual({
      cachedInputTokens: 12,
      inputTokens: 200,
      outputTokens: 40,
      reasoningOutputTokens: 20,
      totalTokens: 240,
    });
  });

  test('defaults missing detail entries to zero', () => {
    expect(
      toChatRequestUsage({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      }),
    ).toEqual({
      cachedInputTokens: 0,
      inputTokens: 100,
      outputTokens: 20,
      reasoningOutputTokens: 0,
      totalTokens: 120,
    });
  });
});

describe('toTextDeltas', () => {
  test('yields text deltas in order and reports usage once per response_done', async () => {
    const result = eventStreamResult(
      rawTextDelta('Com'),
      rawResponseDone({ inputTokens: 100, outputTokens: 10, totalTokens: 110 }),
      rawTextDelta('pact'),
      rawResponseDone({ inputTokens: 300, outputTokens: 20, totalTokens: 320 }),
    );
    const usageCalls: ChatRequestUsage[] = [];

    const deltas: string[] = [];
    for await (const delta of toTextDeltas(result, (usage) => usageCalls.push(usage))) {
      deltas.push(delta);
    }

    expect(deltas).toEqual(['Com', 'pact']);
    expect(usageCalls.map((usage) => usage.inputTokens)).toEqual([100, 300]);
  });

  test('ignores non-raw events and keeps streaming when the observer throws', async () => {
    const result = eventStreamResult(
      { type: 'run_item_stream_event' } as unknown as RunStreamEvent,
      rawResponseDone({ inputTokens: 100, outputTokens: 10, totalTokens: 110 }),
      rawTextDelta('ok'),
    );
    const onRequestUsage = vi.fn(() => {
      throw new Error('observer boom');
    });

    const deltas: string[] = [];
    for await (const delta of toTextDeltas(result, onRequestUsage)) {
      deltas.push(delta);
    }

    expect(deltas).toEqual(['ok']);
    expect(onRequestUsage).toHaveBeenCalledTimes(1);
  });
});
